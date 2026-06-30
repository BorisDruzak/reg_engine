import csv
import json
from datetime import date, datetime
from decimal import Decimal
from importlib import import_module
from io import BytesIO, StringIO
from typing import Any, cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Card, CardAttachment, FormBlock, FormField, GeneratedDocument, StoredFile
from app.services.audit import AuditService
from app.services.cards import (
    CardBlockInstanceRead,
    CardFieldRead,
    CardRead,
    CardService,
    CardServiceError,
    FileRefValueRead,
    InvalidFieldValueError,
)
from app.services.permissions import PermissionDeniedError
from app.services.registry_schema import RegistrySchemaService

CARD_EXPORT_FORMAT_VERSION = "card_export_v1"
CARD_IMPORT_PREVIEW_FORMAT_VERSION = "card_import_preview_v1"
CARD_IMPORT_COMMIT_FORMAT_VERSION = "card_import_commit_v1"
CARD_IMPORT_REQUIRED_COLUMNS = {
    "card_id",
    "organization_id",
    "display_name",
    "block_code",
    "field_code",
    "value",
}
CARD_EXPORT_ROW_COLUMNS = [
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


class ImportExportServiceError(ValueError):
    """Raised when import/export operations receive invalid parameters."""


class CardImportCommitValidationError(ImportExportServiceError):
    """Raised when an import commit batch has preview validation errors."""

    def __init__(self, preview: dict[str, Any]) -> None:
        super().__init__("CSV import contains invalid rows.")
        self.preview = preview


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
        rows = self._card_export_rows(cards)
        output = StringIO(newline="")
        writer = csv.DictWriter(output, fieldnames=CARD_EXPORT_ROW_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

        self._record_export_event(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            export_format="csv",
            card_count=len(cards),
        )
        return output.getvalue()

    def export_cards_xlsx_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        organization_id: UUID | None = None,
        include_archive: bool = False,
        query: str | None = None,
    ) -> bytes:
        cards = self._card_exports_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            organization_id=organization_id,
            include_archive=include_archive,
            query=query,
        )
        rows = self._card_export_rows(cards)
        openpyxl = _openpyxl()
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.title = "cards"
        sheet.append(CARD_EXPORT_ROW_COLUMNS)
        for row in rows:
            sheet.append([row[column] for column in CARD_EXPORT_ROW_COLUMNS])

        output = BytesIO()
        workbook.save(output)
        self._record_export_event(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            export_format="xlsx",
            card_count=len(cards),
        )
        return output.getvalue()

    def _card_export_rows(self, cards: list[dict[str, Any]]) -> list[dict[str, str]]:
        rows: list[dict[str, str]] = []
        for card in cards:
            for block_code, block in card["blocks"].items():
                for instance in block["instances"]:
                    rows.extend(
                        self._export_instance_rows(
                            card=card,
                            block_code=block_code,
                            instance=instance,
                        )
                    )
        return rows

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

    def _export_instance_rows(
        self,
        *,
        card: dict[str, Any],
        block_code: str,
        instance: dict[str, Any],
    ) -> list[dict[str, str]]:
        return [
            {
                "card_id": card["id"],
                "display_name": card["display_name"],
                "organization_id": card["organization_id"],
                "org_unit_id": card["org_unit_id"] or "",
                "lifecycle_status": card["lifecycle_status"],
                "block_code": block_code,
                "block_instance_ordinal": str(instance["ordinal"]),
                "field_code": field_code,
                "field_type": field["field_type"],
                "value": _csv_export_value(field["value"]),
            }
            for field_code, field in instance["fields"].items()
        ]

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


class CardImportPreviewService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def preview_cards_csv_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        csv_content: str,
    ) -> dict[str, Any]:
        rows = self._read_csv_rows(csv_content)
        return self._preview_cards_rows_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            rows=rows,
        )

    def preview_cards_xlsx_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        xlsx_content: bytes,
    ) -> dict[str, Any]:
        rows = self._read_xlsx_rows(xlsx_content)
        return self._preview_cards_rows_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            rows=rows,
        )

    def _preview_cards_rows_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        rows: list[tuple[int, dict[str, str]]],
    ) -> dict[str, Any]:
        _, blocks, fields = RegistrySchemaService(self.session).read_schema_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
        )
        field_mapping = self._field_mapping(blocks, fields)
        preview_rows = [
            self._preview_row(
                actor_user_id=actor_user_id,
                registry_id=registry_id,
                row_number=row_number,
                row=row,
                field_mapping=field_mapping,
            )
            for row_number, row in rows
        ]
        valid_rows = [row for row in preview_rows if row["status"] == "valid"]
        summary = {
            "total_rows": len(preview_rows),
            "valid_rows": len(valid_rows),
            "invalid_rows": len(preview_rows) - len(valid_rows),
            "would_create_rows": sum(1 for row in valid_rows if row["action"] == "create"),
            "would_update_rows": sum(1 for row in valid_rows if row["action"] == "update"),
        }
        return {
            "format_version": CARD_IMPORT_PREVIEW_FORMAT_VERSION,
            "registry_id": str(registry_id),
            "summary": summary,
            "rows": preview_rows,
        }

    def _read_csv_rows(self, csv_content: str) -> list[tuple[int, dict[str, str]]]:
        reader = csv.DictReader(StringIO(csv_content))
        fieldnames = set(reader.fieldnames or [])
        if not fieldnames >= CARD_IMPORT_REQUIRED_COLUMNS:
            required = ", ".join(sorted(CARD_IMPORT_REQUIRED_COLUMNS))
            raise ImportExportServiceError(f"CSV import preview requires columns: {required}.")
        return [
            (
                index,
                {key: (value or "").strip() for key, value in row.items() if key is not None},
            )
            for index, row in enumerate(reader, start=2)
        ]

    def _read_xlsx_rows(self, xlsx_content: bytes) -> list[tuple[int, dict[str, str]]]:
        try:
            workbook = _openpyxl().load_workbook(
                BytesIO(xlsx_content),
                read_only=True,
                data_only=True,
            )
        except Exception as exc:
            raise ImportExportServiceError("XLSX import file could not be read.") from exc
        sheet = workbook.active
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            raise ImportExportServiceError("XLSX import file is empty.")
        headers = ["" if value is None else str(value).strip() for value in rows[0]]
        fieldnames = set(headers)
        if not fieldnames >= CARD_IMPORT_REQUIRED_COLUMNS:
            required = ", ".join(sorted(CARD_IMPORT_REQUIRED_COLUMNS))
            raise ImportExportServiceError(f"XLSX import preview requires columns: {required}.")

        parsed_rows: list[tuple[int, dict[str, str]]] = []
        for index, values in enumerate(rows[1:], start=2):
            row = {
                key: "" if value is None else str(value).strip()
                for key, value in zip(headers, values, strict=False)
                if key
            }
            parsed_rows.append((index, row))
        return parsed_rows

    def _field_mapping(
        self,
        blocks: list[FormBlock],
        fields: list[FormField],
    ) -> dict[tuple[str, str], FormField]:
        blocks_by_id = {block.id: block for block in blocks}
        mapping: dict[tuple[str, str], FormField] = {}
        for field_model in fields:
            block = blocks_by_id.get(field_model.block_id)
            if block is None:
                continue
            mapping[(block.code, field_model.code)] = field_model
        return mapping

    def _preview_row(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        row_number: int,
        row: dict[str, str],
        field_mapping: dict[tuple[str, str], FormField],
    ) -> dict[str, Any]:
        errors: list[str] = []
        card_id = _optional_uuid(row["card_id"], errors, "card_id")
        organization_id = _optional_uuid(row["organization_id"], errors, "organization_id")
        action = "update" if card_id is not None else "create"
        field_path = f"{row['block_code']}.{row['field_code']}"
        field_model = field_mapping.get((row["block_code"], row["field_code"]))
        parsed_value: object | None = None
        field_type = field_model.field_type if field_model is not None else None

        if card_id is not None:
            organization_id = self._organization_id_for_card(
                card_id,
                registry_id=registry_id,
                errors=errors,
            )
        elif organization_id is None:
            errors.append("organization_id is required for new card import rows.")

        if action == "create" and not row["display_name"]:
            errors.append("display_name is required for new card import rows.")

        if field_model is None:
            errors.append("Import field mapping was not found.")
        else:
            try:
                parsed_value = _parse_csv_field_value(field_model, row["value"])
            except ImportExportServiceError as exc:
                errors.append(str(exc))

        if not errors and field_model is not None and organization_id is not None:
            try:
                CardService(self.session).validate_field_value_for_actor(
                    actor_user_id=actor_user_id,
                    registry_id=registry_id,
                    organization_id=organization_id,
                    card_id=card_id,
                    field_id=field_model.id,
                    value=parsed_value,
                )
            except (
                CardServiceError,
                InvalidFieldValueError,
                PermissionDeniedError,
            ) as exc:
                errors.append(str(exc))

        return {
            "row_number": row_number,
            "status": "invalid" if errors else "valid",
            "action": action,
            "card_id": str(card_id) if card_id else None,
            "organization_id": str(organization_id) if organization_id else None,
            "display_name": row["display_name"] or None,
            "import_key": row.get("import_key") or None,
            "field_id": field_model.id if field_model is not None else None,
            "field_path": field_path,
            "field_type": field_type,
            "raw_value": row["value"],
            "parsed_value_for_commit": parsed_value if not errors else None,
            "parsed_value": _serialize_export_value(parsed_value) if not errors else None,
            "errors": errors,
        }

    def _organization_id_for_card(
        self,
        card_id: UUID,
        *,
        registry_id: UUID,
        errors: list[str],
    ) -> UUID | None:
        card = self.session.get(Card, card_id)
        if card is None:
            errors.append("Card was not found.")
            return None
        if card.registry_id != registry_id:
            errors.append("Card does not belong to the import registry.")
            return None
        return card.organization_id


class CardImportCommitService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def commit_cards_csv_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        csv_content: str,
    ) -> dict[str, Any]:
        preview = CardImportPreviewService(self.session).preview_cards_csv_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            csv_content=csv_content,
        )
        return self._commit_preview_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            preview=preview,
            import_format="csv",
        )

    def commit_cards_xlsx_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        xlsx_content: bytes,
    ) -> dict[str, Any]:
        preview = CardImportPreviewService(self.session).preview_cards_xlsx_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            xlsx_content=xlsx_content,
        )
        return self._commit_preview_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            preview=preview,
            import_format="xlsx",
        )

    def _commit_preview_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        preview: dict[str, Any],
        import_format: str,
    ) -> dict[str, Any]:
        if preview["summary"]["invalid_rows"]:
            raise CardImportCommitValidationError(preview)

        groups = self._commit_groups(preview["rows"])
        committed_cards: list[dict[str, Any]] = []
        created_cards = 0
        updated_cards = 0
        field_values_written = 0
        card_service = CardService(self.session)

        with self.session.begin_nested():
            for group in groups:
                if group["action"] == "create":
                    card = card_service.create_card_for_actor(
                        actor_user_id=actor_user_id,
                        registry_id=registry_id,
                        organization_id=group["organization_id"],
                        display_name=group["display_name"],
                    )
                    created_cards += 1
                    committed_cards.append(
                        {
                            "card_id": str(card.id),
                            "action": "create",
                            "import_key": group["import_key"],
                        }
                    )
                    target_card_id = card.id
                else:
                    target_card_id = group["card_id"]
                    updated_cards += 1
                    committed_cards.append(
                        {
                            "card_id": str(target_card_id),
                            "action": "update",
                            "import_key": None,
                        }
                    )

                for row in group["rows"]:
                    card_service.set_field_value_for_actor(
                        actor_user_id=actor_user_id,
                        card_id=target_card_id,
                        field_id=row["field_id"],
                        value=row["parsed_value_for_commit"],
                    )
                    field_values_written += 1

            AuditService(self.session).record_user_event(
                actor_user_id=actor_user_id,
                action="import_commit",
                object_type="registry",
                object_id=registry_id,
                new_data_json={
                    "import_type": "cards",
                    "format": import_format,
                    "total_rows": preview["summary"]["total_rows"],
                    "committed_rows": field_values_written,
                    "created_cards": created_cards,
                    "updated_cards": updated_cards,
                    "field_values_written": field_values_written,
                },
            )

        return {
            "format_version": CARD_IMPORT_COMMIT_FORMAT_VERSION,
            "registry_id": str(registry_id),
            "summary": {
                "total_rows": preview["summary"]["total_rows"],
                "committed_rows": field_values_written,
                "created_cards": created_cards,
                "updated_cards": updated_cards,
                "field_values_written": field_values_written,
            },
            "cards": committed_cards,
        }

    def _commit_groups(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        groups: list[dict[str, Any]] = []
        groups_by_key: dict[tuple[str, str], dict[str, Any]] = {}

        for row in rows:
            if row["action"] == "update":
                key = ("update", str(row["card_id"]))
                group = groups_by_key.get(key)
                if group is None:
                    group = {
                        "action": "update",
                        "card_id": UUID(str(row["card_id"])),
                        "import_key": None,
                        "rows": [],
                    }
                    groups_by_key[key] = group
                    groups.append(group)
                group["rows"].append(row)
                continue

            import_key = row["import_key"] or f"row:{row['row_number']}"
            key = ("create", import_key)
            organization_id = UUID(str(row["organization_id"]))
            display_name = str(row["display_name"])
            group = groups_by_key.get(key)
            if group is None:
                group = {
                    "action": "create",
                    "card_id": None,
                    "import_key": row["import_key"],
                    "organization_id": organization_id,
                    "display_name": display_name,
                    "rows": [],
                }
                groups_by_key[key] = group
                groups.append(group)
            elif (
                group["organization_id"] != organization_id or group["display_name"] != display_name
            ):
                raise ImportExportServiceError(
                    "Import rows for the same import_key must use one organization_id "
                    "and display_name."
                )
            group["rows"].append(row)

        return groups


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


def _optional_uuid(raw_value: str, errors: list[str], column_name: str) -> UUID | None:
    if not raw_value:
        return None
    try:
        return UUID(raw_value)
    except ValueError:
        errors.append(f"{column_name} must be a UUID string.")
        return None


def _parse_csv_field_value(field_model: FormField, raw_value: str) -> object:
    if raw_value == "":
        return None
    if field_model.field_type == "text":
        return raw_value
    if field_model.field_type == "number":
        try:
            return Decimal(raw_value)
        except Exception as exc:
            raise ImportExportServiceError("Number fields require a numeric value.") from exc
    if field_model.field_type == "date":
        try:
            return date.fromisoformat(raw_value)
        except ValueError as exc:
            raise ImportExportServiceError("Date fields require an ISO date string.") from exc
    if field_model.field_type == "datetime":
        try:
            return datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ImportExportServiceError(
                "Datetime fields require an ISO datetime string."
            ) from exc
    if field_model.field_type == "bool":
        lowered = raw_value.lower()
        if lowered in {"true", "1", "yes"}:
            return True
        if lowered in {"false", "0", "no"}:
            return False
        raise ImportExportServiceError("Bool fields require a boolean value.")
    if field_model.field_type == "json":
        try:
            parsed_json = json.loads(raw_value)
        except json.JSONDecodeError as exc:
            raise ImportExportServiceError("JSON fields require an object value.") from exc
        if not isinstance(parsed_json, dict):
            raise ImportExportServiceError("JSON fields require an object value.")
        return parsed_json
    if field_model.field_type in {
        "select",
        "card_ref",
        "user_ref",
        "organization_ref",
        "org_unit_ref",
        "registry_ref",
        "file_ref",
    }:
        return _required_uuid(raw_value, f"{field_model.field_type} fields require a UUID string.")
    if field_model.field_type == "multi_select":
        return _parse_multi_select_csv_value(raw_value)
    raise ImportExportServiceError(f"Unsupported field type: {field_model.field_type}")


def _required_uuid(raw_value: str, message: str) -> UUID:
    try:
        return UUID(raw_value)
    except ValueError as exc:
        raise ImportExportServiceError(message) from exc


def _parse_multi_select_csv_value(raw_value: str) -> list[UUID]:
    if raw_value.startswith("["):
        try:
            parsed = json.loads(raw_value)
        except json.JSONDecodeError as exc:
            raise ImportExportServiceError(
                "Multi-select fields require UUID strings separated by semicolon or a JSON list."
            ) from exc
        if not isinstance(parsed, list):
            raise ImportExportServiceError(
                "Multi-select fields require UUID strings separated by semicolon or a JSON list."
            )
        raw_items = [str(item) for item in parsed]
    else:
        raw_items = [item.strip() for item in raw_value.split(";") if item.strip()]
    try:
        return [UUID(item) for item in raw_items]
    except ValueError as exc:
        raise ImportExportServiceError(
            "Multi-select fields require UUID strings separated by semicolon or a JSON list."
        ) from exc


def _openpyxl() -> Any:
    return cast(Any, import_module("openpyxl"))
