import csv
import json
from collections.abc import Mapping
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from io import StringIO
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.constants import REPORT_OUTPUT_FORMATS, REPORT_TYPES
from app.models import Card, Registry, ReportRun, ReportTemplate, StoredFile
from app.services.attachments import AttachmentStorage, normalize_attachment_filename
from app.services.audit import AuditService
from app.services.cards import (
    CardBlockInstanceRead,
    CardFieldRead,
    CardRead,
    CardService,
    CardServiceError,
    FileRefValueRead,
)
from app.services.permissions import PermissionDeniedError, PermissionService


class ReportServiceError(ValueError):
    """Raised when report template or run state is invalid."""


@dataclass(frozen=True)
class _RenderedReport:
    report_type: str
    card_id: UUID | None
    content: dict[str, Any]
    summary: dict[str, Any]
    row_count: int


@dataclass(frozen=True)
class _ReportOutput:
    content: bytes
    filename: str
    content_type: str


class ReportService:
    def __init__(self, session: Session, *, storage: AttachmentStorage) -> None:
        self.session = session
        self.storage = storage

    def create_template_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        code: str,
        name: str,
        report_type: str,
        description: str | None = None,
        parameters_schema_json: dict[str, Any] | None = None,
        default_parameters_json: dict[str, Any] | None = None,
        output_format: str = "json",
    ) -> ReportTemplate:
        self._require_schema_permission(actor_user_id, registry_id)
        self._get_active_registry(registry_id)
        self._validate_report_type(report_type)
        self._validate_output_format(output_format)
        template = ReportTemplate(
            registry_id=registry_id,
            code=self._clean_required_text(code, "code"),
            name=self._clean_required_text(name, "name"),
            description=description,
            report_type=report_type,
            parameters_schema_json=parameters_schema_json,
            default_parameters_json=default_parameters_json,
            output_format=output_format,
            created_by=actor_user_id,
            updated_by=actor_user_id,
        )
        self.session.add(template)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="report_template_create",
            object_type="report_template",
            object_id=template.id,
            new_data_json={
                "registry_id": str(registry_id),
                "code": template.code,
                "report_type": template.report_type,
                "output_format": template.output_format,
            },
        )
        return template

    def update_template_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
        updates: Mapping[str, Any],
    ) -> ReportTemplate:
        template = self._get_active_template(template_id)
        self._require_schema_permission(actor_user_id, template.registry_id)
        allowed_fields = {
            "name",
            "description",
            "parameters_schema_json",
            "default_parameters_json",
        }
        unexpected_fields = set(updates) - allowed_fields
        if unexpected_fields:
            raise ReportServiceError(
                f"Unsupported report template update fields: {', '.join(sorted(unexpected_fields))}"
            )

        old_data: dict[str, Any] = {}
        new_data: dict[str, Any] = {}
        if "name" in updates:
            old_data["name"] = template.name
            name = updates["name"]
            if not isinstance(name, str):
                raise ReportServiceError("Report template name must not be empty.")
            template.name = self._clean_required_text(name, "name")
            new_data["name"] = template.name
        if "description" in updates:
            old_data["description"] = template.description
            description = updates["description"]
            template.description = description.strip() if isinstance(description, str) else None
            new_data["description"] = template.description
        if "parameters_schema_json" in updates:
            old_data["parameters_schema_json"] = template.parameters_schema_json
            template.parameters_schema_json = updates["parameters_schema_json"]
            new_data["parameters_schema_json"] = template.parameters_schema_json
        if "default_parameters_json" in updates:
            old_data["default_parameters_json"] = template.default_parameters_json
            template.default_parameters_json = updates["default_parameters_json"]
            new_data["default_parameters_json"] = template.default_parameters_json

        if old_data:
            template.updated_by = actor_user_id
            self.session.flush()
            AuditService(self.session).record_user_event(
                actor_user_id=actor_user_id,
                action="report_template_update",
                object_type="report_template",
                object_id=template.id,
                old_data_json=old_data,
                new_data_json=new_data,
            )
        return template

    def list_templates_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        include_archive: bool = False,
    ) -> list[ReportTemplate]:
        self._require_registry_report_read(actor_user_id, registry_id)
        self._get_active_registry(registry_id)
        criteria = [ReportTemplate.registry_id == registry_id]
        if not include_archive:
            criteria.append(ReportTemplate.archived_at.is_(None))
            criteria.append(ReportTemplate.is_active.is_(True))
        return list(
            self.session.scalars(
                select(ReportTemplate).where(*criteria).order_by(ReportTemplate.name)
            ).all()
        )

    def archive_template_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
        archive_reason: str | None = None,
    ) -> ReportTemplate:
        template = self._get_active_template(template_id)
        self._require_schema_permission(actor_user_id, template.registry_id)
        template.archived_at = datetime.now(UTC)
        template.archived_by = actor_user_id
        template.archive_reason = archive_reason
        template.is_active = False
        template.updated_by = actor_user_id
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="report_template_archive",
            object_type="report_template",
            object_id=template.id,
            old_data_json={"archived_at": None, "is_active": True},
            new_data_json={"archive_reason": archive_reason},
        )
        return template

    def generate_report_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
        parameters: dict[str, Any] | None = None,
    ) -> ReportRun:
        template = self._get_active_template(template_id)
        merged_parameters = {
            **(template.default_parameters_json or {}),
            **(parameters or {}),
        }
        rendered = self._render_report(
            actor_user_id=actor_user_id,
            template=template,
            parameters=merged_parameters,
        )
        output = self._render_report_output(template=template, rendered=rendered)
        started_at = datetime.now(UTC)
        stored_info = self.storage.write_bytes(output.content)
        try:
            stored_file = StoredFile(
                storage_backend=self.storage.backend_name,
                storage_key=stored_info.storage_key,
                original_filename=output.filename,
                content_type=output.content_type,
                content_length_bytes=stored_info.content_length_bytes,
                checksum_sha256=stored_info.checksum_sha256,
                scanner_status="deferred",
                scanner_details_json={
                    "source": "report_run_v1",
                    "report_type": rendered.report_type,
                    "output_format": template.output_format,
                },
                created_by=actor_user_id,
            )
            self.session.add(stored_file)
            self.session.flush()
            report_run = ReportRun(
                report_template_id=template.id,
                registry_id=template.registry_id,
                card_id=rendered.card_id,
                stored_file_id=stored_file.id,
                report_type=rendered.report_type,
                run_status="generated",
                parameters_json=merged_parameters,
                summary_json=rendered.summary,
                row_count=rendered.row_count,
                output_filename=output.filename,
                output_content_type=stored_file.content_type,
                generated_by=actor_user_id,
                started_at=started_at,
                finished_at=datetime.now(UTC),
            )
            self.session.add(report_run)
            self.session.flush()
            AuditService(self.session).record_user_event(
                actor_user_id=actor_user_id,
                action="report_run_generate",
                object_type="report_run",
                object_id=report_run.id,
                new_data_json={
                    "report_template_id": str(template.id),
                    "registry_id": str(template.registry_id),
                    "card_id": str(rendered.card_id) if rendered.card_id is not None else None,
                    "report_type": rendered.report_type,
                    "stored_file_id": str(stored_file.id),
                    "row_count": rendered.row_count,
                    "output_format": template.output_format,
                },
            )
            return report_run
        except Exception:
            with suppress(Exception):
                self.storage.delete_bytes(stored_info.storage_key)
            raise

    def list_report_runs_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        include_archive: bool = False,
    ) -> list[ReportRun]:
        self._require_registry_report_read(actor_user_id, registry_id)
        criteria = [ReportRun.registry_id == registry_id]
        if not include_archive:
            criteria.append(ReportRun.archived_at.is_(None))
        return list(
            self.session.scalars(
                select(ReportRun)
                .where(*criteria)
                .order_by(ReportRun.created_at.desc(), ReportRun.id.desc())
            ).all()
        )

    def read_report_run_for_actor(
        self,
        *,
        actor_user_id: UUID,
        report_run_id: UUID,
        include_archive: bool = False,
    ) -> ReportRun:
        report_run = self._get_report_run(report_run_id)
        if report_run.archived_at is not None and not include_archive:
            raise ReportServiceError("Report run is only readable in archive scope.")
        self._require_report_run_read(actor_user_id, report_run)
        return report_run

    def read_report_content_for_actor(
        self,
        *,
        actor_user_id: UUID,
        report_run_id: UUID,
        include_archive: bool = False,
    ) -> bytes:
        report_run = self.read_report_run_for_actor(
            actor_user_id=actor_user_id,
            report_run_id=report_run_id,
            include_archive=include_archive,
        )
        stored_file = self.get_stored_file_for_report_run(report_run)
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="report_run_download",
            object_type="report_run",
            object_id=report_run.id,
            new_data_json={
                "stored_file_id": str(stored_file.id),
                "content_length_bytes": stored_file.content_length_bytes,
            },
        )
        return self.storage.read_bytes(stored_file.storage_key)

    def archive_report_run_for_actor(
        self,
        *,
        actor_user_id: UUID,
        report_run_id: UUID,
        archive_reason: str | None = None,
    ) -> ReportRun:
        report_run = self._get_report_run(report_run_id)
        if report_run.archived_at is not None:
            return report_run
        self._require_report_run_read(actor_user_id, report_run)
        report_run.archived_at = datetime.now(UTC)
        report_run.archived_by = actor_user_id
        report_run.archive_reason = archive_reason
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="report_run_archive",
            object_type="report_run",
            object_id=report_run.id,
            old_data_json={"archived_at": None},
            new_data_json={"archive_reason": archive_reason},
        )
        return report_run

    def get_stored_file_for_report_run(self, report_run: ReportRun) -> StoredFile:
        if report_run.stored_file_id is None:
            raise ReportServiceError("Report output file was not found.")
        stored_file = self.session.get(StoredFile, report_run.stored_file_id)
        if stored_file is None:
            raise ReportServiceError("Report output file was not found.")
        return stored_file

    def _render_report(
        self,
        *,
        actor_user_id: UUID,
        template: ReportTemplate,
        parameters: dict[str, Any],
    ) -> _RenderedReport:
        if template.report_type == "registry_cards":
            return self._render_registry_cards_report(
                actor_user_id=actor_user_id,
                template=template,
                parameters=parameters,
            )
        if template.report_type == "card_detail":
            return self._render_card_detail_report(
                actor_user_id=actor_user_id,
                template=template,
                parameters=parameters,
            )
        if template.report_type == "period_summary":
            return self._render_period_summary_report(
                actor_user_id=actor_user_id,
                template=template,
                parameters=parameters,
            )
        raise ReportServiceError(f"Unsupported report type: {template.report_type}")

    def _render_report_output(
        self,
        *,
        template: ReportTemplate,
        rendered: _RenderedReport,
    ) -> _ReportOutput:
        if template.output_format == "json":
            return _ReportOutput(
                content=json.dumps(
                    rendered.content,
                    ensure_ascii=False,
                    sort_keys=True,
                    default=_serialize_report_value,
                ).encode("utf-8"),
                filename=self._output_filename(template),
                content_type="application/json",
            )
        if template.output_format == "csv":
            return _ReportOutput(
                content=self._render_csv_report(rendered),
                filename=self._output_filename(template),
                content_type="text/csv; charset=utf-8",
            )
        raise ReportServiceError(f"Unsupported report output format: {template.output_format}")

    def _render_csv_report(self, rendered: _RenderedReport) -> bytes:
        if rendered.report_type == "registry_cards":
            return self._render_registry_cards_csv(rendered)
        if rendered.report_type == "card_detail":
            return self._render_card_detail_csv(rendered)
        if rendered.report_type == "period_summary":
            return self._render_period_summary_csv(rendered)
        raise ReportServiceError(f"Unsupported report type: {rendered.report_type}")

    def _render_registry_cards_csv(self, rendered: _RenderedReport) -> bytes:
        fieldnames = [
            "id",
            "registry_id",
            "organization_id",
            "org_unit_id",
            "display_name",
            "lifecycle_status",
            "created_at",
        ]
        rows = [
            {fieldname: _csv_cell(card.get(fieldname)) for fieldname in fieldnames}
            for card in rendered.content.get("cards", [])
            if isinstance(card, dict)
        ]
        return _write_csv(fieldnames, rows)

    def _render_card_detail_csv(self, rendered: _RenderedReport) -> bytes:
        fieldnames = [
            "card_id",
            "block_code",
            "block_instance_id",
            "ordinal",
            "field_code",
            "field_type",
            "value",
        ]
        card = rendered.content.get("card")
        if not isinstance(card, dict):
            return _write_csv(fieldnames, [])
        card_id = card.get("id")
        blocks = card.get("blocks")
        rows: list[dict[str, str]] = []
        if isinstance(blocks, dict):
            for block_code, block in blocks.items():
                if not isinstance(block, dict):
                    continue
                instances = block.get("instances")
                if not isinstance(instances, list):
                    continue
                for instance in instances:
                    if not isinstance(instance, dict):
                        continue
                    fields = instance.get("fields")
                    if not isinstance(fields, dict):
                        continue
                    for field_code, field in fields.items():
                        if not isinstance(field, dict):
                            continue
                        rows.append(
                            {
                                "card_id": _csv_cell(card_id),
                                "block_code": _csv_cell(block_code),
                                "block_instance_id": _csv_cell(instance.get("block_instance_id")),
                                "ordinal": _csv_cell(instance.get("ordinal")),
                                "field_code": _csv_cell(field_code),
                                "field_type": _csv_cell(field.get("field_type")),
                                "value": _csv_cell(field.get("value")),
                            }
                        )
        return _write_csv(fieldnames, rows)

    def _render_period_summary_csv(self, rendered: _RenderedReport) -> bytes:
        fieldnames = ["metric", "key", "value"]
        summary = rendered.summary
        rows = [
            {
                "metric": "card_count",
                "key": "",
                "value": _csv_cell(summary.get("card_count")),
            }
        ]
        status_counts = summary.get("lifecycle_status_counts")
        if isinstance(status_counts, dict):
            rows.extend(
                {
                    "metric": "lifecycle_status_count",
                    "key": _csv_cell(status),
                    "value": _csv_cell(count),
                }
                for status, count in sorted(status_counts.items())
            )
        return _write_csv(fieldnames, rows)

    def _render_registry_cards_report(
        self,
        *,
        actor_user_id: UUID,
        template: ReportTemplate,
        parameters: dict[str, Any],
    ) -> _RenderedReport:
        cards = self._visible_cards(actor_user_id, template.registry_id, parameters)
        content = self._base_report_content(template=template, parameters=parameters)
        content["cards"] = [self._card_summary(card) for card in cards]
        summary = {"card_count": len(cards)}
        content["summary"] = summary
        return _RenderedReport(
            report_type=template.report_type,
            card_id=None,
            content=content,
            summary=summary,
            row_count=len(cards),
        )

    def _render_card_detail_report(
        self,
        *,
        actor_user_id: UUID,
        template: ReportTemplate,
        parameters: dict[str, Any],
    ) -> _RenderedReport:
        card_id = self._required_uuid_parameter(parameters, "card_id")
        try:
            card_read = CardService(self.session).read_card_for_actor(
                actor_user_id=actor_user_id,
                card_id=card_id,
                include_archive=bool(parameters.get("include_archive", False)),
            )
        except CardServiceError as exc:
            raise ReportServiceError(str(exc)) from exc
        if card_read.registry_id != template.registry_id:
            raise ReportServiceError("Card does not belong to the report registry.")
        content = self._base_report_content(template=template, parameters=parameters)
        content["card"] = self._card_read_to_report(card_read)
        summary = {"card_count": 1}
        content["summary"] = summary
        return _RenderedReport(
            report_type=template.report_type,
            card_id=card_read.card_id,
            content=content,
            summary=summary,
            row_count=1,
        )

    def _render_period_summary_report(
        self,
        *,
        actor_user_id: UUID,
        template: ReportTemplate,
        parameters: dict[str, Any],
    ) -> _RenderedReport:
        cards = self._visible_cards(actor_user_id, template.registry_id, parameters)
        created_from = self._optional_datetime_parameter(parameters, "created_from")
        created_to = self._optional_datetime_parameter(parameters, "created_to")
        if created_from is not None:
            cards = [card for card in cards if card.created_at >= created_from]
        if created_to is not None:
            cards = [card for card in cards if card.created_at <= created_to]
        status_counts: dict[str, int] = {}
        for card in cards:
            status_counts[card.lifecycle_status] = status_counts.get(card.lifecycle_status, 0) + 1
        summary = {
            "card_count": len(cards),
            "lifecycle_status_counts": dict(sorted(status_counts.items())),
        }
        content = self._base_report_content(template=template, parameters=parameters)
        content["summary"] = summary
        return _RenderedReport(
            report_type=template.report_type,
            card_id=None,
            content=content,
            summary=summary,
            row_count=len(cards),
        )

    def _visible_cards(
        self,
        actor_user_id: UUID,
        registry_id: UUID,
        parameters: dict[str, Any],
    ) -> list[Card]:
        organization_id = self._optional_uuid_parameter(parameters, "organization_id")
        include_archive = bool(parameters.get("include_archive", False))
        query = parameters.get("q")
        return CardService(self.session).list_visible_cards(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            organization_id=organization_id,
            include_archive=include_archive,
            query=query if isinstance(query, str) and query else None,
        )

    def _base_report_content(
        self,
        *,
        template: ReportTemplate,
        parameters: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "format_version": "report_run_v1",
            "report_template_id": template.id,
            "registry_id": template.registry_id,
            "report_type": template.report_type,
            "generated_at": datetime.now(UTC),
            "parameters": parameters,
        }

    def _card_summary(self, card: Card) -> dict[str, Any]:
        return {
            "id": card.id,
            "registry_id": card.registry_id,
            "organization_id": card.organization_id,
            "org_unit_id": card.org_unit_id,
            "display_name": card.display_name,
            "lifecycle_status": card.lifecycle_status,
            "created_at": card.created_at,
        }

    def _card_read_to_report(self, card_read: CardRead) -> dict[str, Any]:
        return {
            "id": card_read.card_id,
            "registry_id": card_read.registry_id,
            "organization_id": card_read.organization_id,
            "display_name": card_read.display_name,
            "blocks": {
                block_code: {
                    "block_id": block.block_id,
                    "code": block.code,
                    "instances": [
                        self._block_instance_to_report(instance) for instance in block.instances
                    ],
                }
                for block_code, block in card_read.blocks.items()
            },
        }

    def _block_instance_to_report(self, instance: CardBlockInstanceRead) -> dict[str, Any]:
        return {
            "block_instance_id": instance.block_instance_id,
            "ordinal": instance.ordinal,
            "fields": {
                field_code: self._field_to_report(field)
                for field_code, field in instance.fields.items()
            },
        }

    def _field_to_report(self, field: CardFieldRead) -> dict[str, Any]:
        return {
            "field_id": field.field_id,
            "code": field.code,
            "field_type": field.field_type,
            "value": field.value,
        }

    def _output_filename(self, template: ReportTemplate) -> str:
        timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
        return normalize_attachment_filename(
            f"{template.code}-{timestamp}.{template.output_format}"
        )

    def _get_active_template(self, template_id: UUID) -> ReportTemplate:
        template = self.session.get(ReportTemplate, template_id)
        if template is None or template.archived_at is not None or not template.is_active:
            raise ReportServiceError("Report template was not found.")
        return template

    def _get_report_run(self, report_run_id: UUID) -> ReportRun:
        report_run = self.session.get(ReportRun, report_run_id)
        if report_run is None:
            raise ReportServiceError("Report run was not found.")
        return report_run

    def _get_active_registry(self, registry_id: UUID) -> Registry:
        registry = self.session.get(Registry, registry_id)
        if (
            registry is None
            or registry.archived_at is not None
            or registry.lifecycle_status == "archived"
        ):
            raise ReportServiceError("Registry was not found.")
        return registry

    def _require_schema_permission(self, actor_user_id: UUID, registry_id: UUID) -> None:
        if not PermissionService(self.session).has_permission(
            actor_user_id,
            "registry.schema.manage",
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot manage report templates.")

    def _require_registry_report_read(self, actor_user_id: UUID, registry_id: UUID) -> None:
        permissions = PermissionService(self.session)
        if permissions.has_permission(
            actor_user_id,
            "registry.schema.manage",
            registry_id=registry_id,
        ) or permissions.has_permission(
            actor_user_id,
            "cards.manage",
            registry_id=registry_id,
        ):
            return
        raise PermissionDeniedError("Actor cannot read reports in this registry.")

    def _require_report_run_read(self, actor_user_id: UUID, report_run: ReportRun) -> None:
        if report_run.card_id is not None:
            CardService(self.session).read_card_for_actor(
                actor_user_id=actor_user_id,
                card_id=report_run.card_id,
                include_archive=report_run.archived_at is not None,
            )
            return
        self._require_registry_report_read(actor_user_id, report_run.registry_id)

    def _validate_report_type(self, report_type: str) -> None:
        if report_type not in REPORT_TYPES:
            raise ReportServiceError(f"Unsupported report type: {report_type}")

    def _validate_output_format(self, output_format: str) -> None:
        if output_format not in REPORT_OUTPUT_FORMATS:
            raise ReportServiceError(f"Unsupported report output format: {output_format}")

    def _clean_required_text(self, value: str, label: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ReportServiceError(f"Report template {label} must not be empty.")
        return cleaned

    def _optional_uuid_parameter(
        self,
        parameters: dict[str, Any],
        name: str,
    ) -> UUID | None:
        value = parameters.get(name)
        if value in (None, ""):
            return None
        return self._coerce_uuid(value, f"Report parameter {name} must be a UUID string.")

    def _required_uuid_parameter(self, parameters: dict[str, Any], name: str) -> UUID:
        value = self._optional_uuid_parameter(parameters, name)
        if value is None:
            raise ReportServiceError(f"Report parameter {name} is required.")
        return value

    def _coerce_uuid(self, value: Any, message: str) -> UUID:
        if isinstance(value, UUID):
            return value
        if not isinstance(value, str):
            raise ReportServiceError(message)
        try:
            return UUID(value)
        except ValueError as exc:
            raise ReportServiceError(message) from exc

    def _optional_datetime_parameter(
        self,
        parameters: dict[str, Any],
        name: str,
    ) -> datetime | None:
        value = parameters.get(name)
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            return value
        if not isinstance(value, str):
            raise ReportServiceError(f"Report parameter {name} must be an ISO datetime string.")
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ReportServiceError(
                f"Report parameter {name} must be an ISO datetime string."
            ) from exc
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed


def _serialize_report_value(value: object) -> object:
    if isinstance(value, FileRefValueRead):
        return {
            "attachment_id": str(value.attachment_id),
            "title": value.title,
            "original_filename": value.original_filename,
            "content_type": value.content_type,
            "content_length_bytes": value.content_length_bytes,
            "scanner_status": value.scanner_status,
            "archived_at": _serialize_report_value(value.archived_at),
        }
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


def _csv_cell(value: object) -> str:
    if value is None:
        return ""
    try:
        serialized = _serialize_report_value(value)
    except TypeError:
        serialized = value
    if isinstance(serialized, dict | list):
        return json.dumps(serialized, ensure_ascii=False, sort_keys=True)
    return str(serialized)


def _write_csv(fieldnames: list[str], rows: list[dict[str, str]]) -> bytes:
    output = StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode("utf-8")
