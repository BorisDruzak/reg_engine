import csv
import json
from datetime import date, datetime
from decimal import Decimal
from io import StringIO
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CardAttachment, GeneratedDocument, StoredFile
from app.services.audit import AuditService
from app.services.cards import (
    CardBlockInstanceRead,
    CardFieldRead,
    CardRead,
    CardService,
    FileRefValueRead,
)

CARD_EXPORT_FORMAT_VERSION = "card_export_v1"


class ImportExportServiceError(ValueError):
    """Raised when import/export operations receive invalid parameters."""


class CardExportService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def export_cards_json_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        organization_id: UUID | None = None,
        include_archive: bool = False,
        query: str | None = None,
    ) -> dict[str, Any]:
        cards = self._card_exports_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            organization_id=organization_id,
            include_archive=include_archive,
            query=query,
        )
        self._record_export_event(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            export_format="json",
            card_count=len(cards),
        )
        return {
            "format_version": CARD_EXPORT_FORMAT_VERSION,
            "registry_id": str(registry_id),
            "cards": cards,
        }

    def export_cards_csv_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        organization_id: UUID | None = None,
        include_archive: bool = False,
        query: str | None = None,
    ) -> str:
        cards = self._card_exports_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            organization_id=organization_id,
            include_archive=include_archive,
            query=query,
        )
        output = StringIO(newline="")
        fieldnames = [
            "card_id",
            "display_name",
            "organization_id",
            "org_unit_id",
            "lifecycle_status",
            "block_code",
            "block_instance_ordinal",
            "field_code",
            "field_type",
            "value",
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        for card in cards:
            for block_code, block in card["blocks"].items():
                for instance in block["instances"]:
                    self._write_csv_instance_rows(
                        writer,
                        card=card,
                        block_code=block_code,
                        instance=instance,
                    )

        self._record_export_event(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            export_format="csv",
            card_count=len(cards),
        )
        return output.getvalue()

    def _card_exports_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        organization_id: UUID | None,
        include_archive: bool,
        query: str | None,
    ) -> list[dict[str, Any]]:
        card_service = CardService(self.session)
        visible_cards = card_service.list_visible_cards(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            organization_id=organization_id,
            include_archive=include_archive,
            query=query,
        )
        attachment_metadata = self._attachment_metadata_by_card(
            [card.id for card in visible_cards],
            include_archive=include_archive,
        )
        generated_document_metadata = self._generated_document_metadata_by_card(
            [card.id for card in visible_cards],
            include_archive=include_archive,
        )
        exports: list[dict[str, Any]] = []
        for card in visible_cards:
            card_read = card_service.read_card_for_actor(
                actor_user_id=actor_user_id,
                card_id=card.id,
                include_archive=include_archive,
            )
            exports.append(
                {
                    "id": str(card.id),
                    "registry_id": str(card.registry_id),
                    "organization_id": str(card.organization_id),
                    "org_unit_id": str(card.org_unit_id) if card.org_unit_id else None,
                    "display_name": card.display_name,
                    "lifecycle_status": card.lifecycle_status,
                    "blocks": self._blocks_to_export(card_read),
                    "attachments": attachment_metadata.get(card.id, []),
                    "generated_documents": generated_document_metadata.get(card.id, []),
                }
            )
        return exports

    def _blocks_to_export(self, card_read: CardRead) -> dict[str, dict[str, Any]]:
        return {
            block_code: {
                "block_id": str(block.block_id),
                "code": block.code,
                "instances": [
                    self._block_instance_to_export(instance) for instance in block.instances
                ],
            }
            for block_code, block in card_read.blocks.items()
        }

    def _block_instance_to_export(
        self,
        instance: CardBlockInstanceRead,
    ) -> dict[str, Any]:
        return {
            "block_instance_id": (
                str(instance.block_instance_id) if instance.block_instance_id else None
            ),
            "ordinal": instance.ordinal,
            "fields": {
                field_code: self._field_to_export(field)
                for field_code, field in instance.fields.items()
            },
        }

    def _field_to_export(self, field: CardFieldRead) -> dict[str, Any]:
        return {
            "field_id": str(field.field_id),
            "code": field.code,
            "field_type": field.field_type,
            "value": _serialize_export_value(field.value),
        }

    def _attachment_metadata_by_card(
        self,
        card_ids: list[UUID],
        *,
        include_archive: bool,
    ) -> dict[UUID, list[dict[str, Any]]]:
        if not card_ids:
            return {}

        criteria = [CardAttachment.card_id.in_(card_ids)]
        if not include_archive:
            criteria.append(CardAttachment.archived_at.is_(None))
            criteria.append(StoredFile.archived_at.is_(None))

        rows = self.session.execute(
            select(CardAttachment, StoredFile)
            .join(StoredFile, StoredFile.id == CardAttachment.stored_file_id)
            .where(*criteria)
            .order_by(CardAttachment.card_id, CardAttachment.position, CardAttachment.id)
        )
        metadata: dict[UUID, list[dict[str, Any]]] = {}
        for attachment, stored_file in rows:
            metadata.setdefault(attachment.card_id, []).append(
                {
                    "id": str(attachment.id),
                    "title": attachment.title,
                    "original_filename": stored_file.original_filename,
                    "content_type": stored_file.content_type,
                    "content_length_bytes": stored_file.content_length_bytes,
                    "archived_at": _serialize_export_value(attachment.archived_at),
                }
            )
        return metadata

    def _generated_document_metadata_by_card(
        self,
        card_ids: list[UUID],
        *,
        include_archive: bool,
    ) -> dict[UUID, list[dict[str, Any]]]:
        if not card_ids:
            return {}

        criteria = [GeneratedDocument.card_id.in_(card_ids)]
        if not include_archive:
            criteria.append(GeneratedDocument.archived_at.is_(None))

        metadata: dict[UUID, list[dict[str, Any]]] = {}
        for generated_document in self.session.scalars(
            select(GeneratedDocument)
            .where(*criteria)
            .order_by(GeneratedDocument.card_id, GeneratedDocument.created_at, GeneratedDocument.id)
        ):
            metadata.setdefault(generated_document.card_id, []).append(
                {
                    "id": str(generated_document.id),
                    "title": generated_document.title,
                    "output_filename": generated_document.output_filename,
                    "content_type": generated_document.content_type,
                    "render_status": generated_document.render_status,
                    "archived_at": _serialize_export_value(generated_document.archived_at),
                }
            )
        return metadata

    def _write_csv_instance_rows(
        self,
        writer: csv.DictWriter[str],
        *,
        card: dict[str, Any],
        block_code: str,
        instance: dict[str, Any],
    ) -> None:
        for field_code, field in instance["fields"].items():
            writer.writerow(
                {
                    "card_id": card["id"],
                    "display_name": card["display_name"],
                    "organization_id": card["organization_id"],
                    "org_unit_id": card["org_unit_id"] or "",
                    "lifecycle_status": card["lifecycle_status"],
                    "block_code": block_code,
                    "block_instance_ordinal": instance["ordinal"],
                    "field_code": field_code,
                    "field_type": field["field_type"],
                    "value": _csv_export_value(field["value"]),
                }
            )

    def _record_export_event(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        export_format: str,
        card_count: int,
    ) -> None:
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="export",
            object_type="registry",
            object_id=registry_id,
            new_data_json={
                "export_type": "cards",
                "format": export_format,
                "card_count": card_count,
            },
        )


def _serialize_export_value(value: object | None) -> object | None:
    if value is None:
        return None
    if isinstance(value, FileRefValueRead):
        return {
            "attachment_id": str(value.attachment_id),
            "title": value.title,
            "original_filename": value.original_filename,
            "content_type": value.content_type,
            "content_length_bytes": value.content_length_bytes,
            "scanner_status": value.scanner_status,
            "archived_at": _serialize_export_value(value.archived_at),
        }
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, list):
        return [_serialize_export_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _serialize_export_value(item) for key, item in value.items()}
    return value


def _csv_export_value(value: object | None) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float):
        return str(value)
    return json.dumps(value, ensure_ascii=False, sort_keys=True)
