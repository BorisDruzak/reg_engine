import csv
import json
import math
import re
from collections.abc import Mapping
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from importlib import import_module
from io import BytesIO, StringIO
from pathlib import Path
from typing import Any, cast
from uuid import UUID

from reportlab.lib.pagesizes import A4  # type: ignore[import-untyped]
from reportlab.lib.units import mm  # type: ignore[import-untyped]
from reportlab.pdfbase import pdfmetrics  # type: ignore[import-untyped]
from reportlab.pdfbase.ttfonts import TTFont  # type: ignore[import-untyped]
from reportlab.pdfgen import canvas  # type: ignore[import-untyped]
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.constants import REPORT_OUTPUT_FORMATS, REPORT_TYPES
from app.models import Card, Registry, ReportRun, ReportTemplate, StoredFile
from app.services.attachments import (
    AttachmentStorage,
    _forget_pending_storage_cleanup,
    _remember_pending_storage_cleanup,
    normalize_attachment_filename,
)
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

XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PDF_CONTENT_TYPE = "application/pdf"
_PDF_FONT_NAME = "RegEngineDejaVuSans"
_REPORT_PARAMETER_TYPES = {"string", "number", "integer", "boolean"}
_PDF_FONT_CANDIDATES = (
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
    Path("C:/Windows/Fonts/DejaVuSans.ttf"),
    Path("C:/Windows/Fonts/arial.ttf"),
)


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
        self._validate_report_parameter_schema(parameters_schema_json)
        self._validate_report_default_parameters(
            schema=parameters_schema_json,
            default_parameters=default_parameters_json,
        )
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
            "report_type",
            "parameters_schema_json",
            "default_parameters_json",
            "output_format",
        }
        unexpected_fields = set(updates) - allowed_fields
        if unexpected_fields:
            raise ReportServiceError(
                f"Unsupported report template update fields: {', '.join(sorted(unexpected_fields))}"
            )

        if "parameters_schema_json" in updates or "default_parameters_json" in updates:
            candidate_schema = updates.get(
                "parameters_schema_json",
                template.parameters_schema_json,
            )
            candidate_defaults = updates.get(
                "default_parameters_json",
                template.default_parameters_json,
            )
            self._validate_report_parameter_schema(candidate_schema)
            self._validate_report_default_parameters(
                schema=candidate_schema,
                default_parameters=candidate_defaults,
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
        if "report_type" in updates:
            old_data["report_type"] = template.report_type
            report_type = updates["report_type"]
            if not isinstance(report_type, str):
                raise ReportServiceError("Report template report type must not be empty.")
            self._validate_report_type(report_type)
            template.report_type = report_type
            new_data["report_type"] = template.report_type
        if "parameters_schema_json" in updates:
            old_data["parameters_schema_json"] = template.parameters_schema_json
            template.parameters_schema_json = updates["parameters_schema_json"]
            new_data["parameters_schema_json"] = template.parameters_schema_json
        if "default_parameters_json" in updates:
            old_data["default_parameters_json"] = template.default_parameters_json
            template.default_parameters_json = updates["default_parameters_json"]
            new_data["default_parameters_json"] = template.default_parameters_json
        if "output_format" in updates:
            old_data["output_format"] = template.output_format
            output_format = updates["output_format"]
            if not isinstance(output_format, str):
                raise ReportServiceError("Report template output format must not be empty.")
            self._validate_output_format(output_format)
            template.output_format = output_format
            new_data["output_format"] = template.output_format

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
        self._validate_run_parameters(template, merged_parameters)
        rendered = self._render_report(
            actor_user_id=actor_user_id,
            template=template,
            parameters=merged_parameters,
        )
        output = self._render_report_output(template=template, rendered=rendered)
        started_at = datetime.now(UTC)
        stored_info = self.storage.write_bytes(output.content)
        pending_cleanup = _remember_pending_storage_cleanup(
            self.session,
            storage=self.storage,
            storage_key=stored_info.storage_key,
        )
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
            _forget_pending_storage_cleanup(self.session, pending_cleanup)
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
        if template.output_format == "xlsx":
            return _ReportOutput(
                content=self._render_xlsx_report(rendered),
                filename=self._output_filename(template),
                content_type=XLSX_CONTENT_TYPE,
            )
        if template.output_format == "pdf":
            return _ReportOutput(
                content=self._render_pdf_report(template=template, rendered=rendered),
                filename=self._output_filename(template),
                content_type=PDF_CONTENT_TYPE,
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

    def _render_xlsx_report(self, rendered: _RenderedReport) -> bytes:
        if rendered.report_type == "registry_cards":
            return self._render_registry_cards_xlsx(rendered)
        if rendered.report_type == "card_detail":
            return self._render_card_detail_xlsx(rendered)
        if rendered.report_type == "period_summary":
            return self._render_period_summary_xlsx(rendered)
        raise ReportServiceError(f"Unsupported report type: {rendered.report_type}")

    def _render_pdf_report(self, *, template: ReportTemplate, rendered: _RenderedReport) -> bytes:
        title = template.name or template.code
        lines = [
            title,
            f"technical_code: {template.code}",
            f"report_type: {rendered.report_type}",
            f"row_count: {rendered.row_count}",
            "",
            "summary",
        ]
        lines.extend(_flatten_pdf_summary(rendered.summary))
        lines.append("")
        lines.extend(self._render_pdf_body_lines(rendered))
        return _write_pdf(title, lines)

    def _render_pdf_body_lines(self, rendered: _RenderedReport) -> list[str]:
        if rendered.report_type == "registry_cards":
            return self._render_registry_cards_pdf_lines(rendered)
        if rendered.report_type == "card_detail":
            return self._render_card_detail_pdf_lines(rendered)
        if rendered.report_type == "period_summary":
            return self._render_period_summary_pdf_lines(rendered)
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

    def _render_registry_cards_xlsx(self, rendered: _RenderedReport) -> bytes:
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
        return _write_xlsx("registry_cards", fieldnames, rows)

    def _render_registry_cards_pdf_lines(self, rendered: _RenderedReport) -> list[str]:
        fieldnames = [
            "id",
            "display_name",
            "lifecycle_status",
            "organization_id",
            "org_unit_id",
            "created_at",
        ]
        lines = ["registry_cards", " | ".join(fieldnames)]
        for card in rendered.content.get("cards", []):
            if not isinstance(card, dict):
                continue
            lines.append(" | ".join(_csv_cell(card.get(fieldname)) for fieldname in fieldnames))
        if len(lines) == 2:
            lines.append("(empty)")
        return lines

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

    def _render_card_detail_xlsx(self, rendered: _RenderedReport) -> bytes:
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
            return _write_xlsx("card_detail", fieldnames, [])
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
        return _write_xlsx("card_detail", fieldnames, rows)

    def _render_card_detail_pdf_lines(self, rendered: _RenderedReport) -> list[str]:
        lines = ["card_detail"]
        card = rendered.content.get("card")
        if not isinstance(card, dict):
            lines.append("(empty)")
            return lines
        lines.extend(
            [
                f"card_id: {_csv_cell(card.get('id'))}",
                f"display_name: {_csv_cell(card.get('display_name'))}",
                "",
            ]
        )
        blocks = card.get("blocks")
        if not isinstance(blocks, dict):
            lines.append("(empty)")
            return lines
        for block_code, block in blocks.items():
            if not isinstance(block, dict):
                continue
            lines.append(f"block: {_csv_cell(block_code)}")
            instances = block.get("instances")
            if not isinstance(instances, list):
                continue
            for instance in instances:
                if not isinstance(instance, dict):
                    continue
                lines.append(
                    "instance: "
                    f"{_csv_cell(instance.get('block_instance_id'))} "
                    f"ordinal={_csv_cell(instance.get('ordinal'))}"
                )
                fields = instance.get("fields")
                if not isinstance(fields, dict):
                    continue
                for field_code, field in fields.items():
                    if not isinstance(field, dict):
                        continue
                    lines.append(
                        f"{_csv_cell(field_code)} "
                        f"({_csv_cell(field.get('field_type'))}): "
                        f"{_csv_cell(field.get('value'))}"
                    )
        return lines

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

    def _render_period_summary_xlsx(self, rendered: _RenderedReport) -> bytes:
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
        return _write_xlsx("period_summary", fieldnames, rows)

    def _render_period_summary_pdf_lines(self, rendered: _RenderedReport) -> list[str]:
        lines = ["period_summary"]
        lines.extend(_flatten_pdf_summary(rendered.summary))
        return lines

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
        value = field.value
        if field.field_type == "work_experience":
            value = value.get("display") if isinstance(value, dict) else None
        return {
            "field_id": field.field_id,
            "code": field.code,
            "field_type": field.field_type,
            "value": value,
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

    def _validate_run_parameters(
        self,
        template: ReportTemplate,
        parameters: Mapping[str, Any],
    ) -> None:
        self._validate_run_parameters_for_schema(template.parameters_schema_json, parameters)

    def _validate_report_parameter_schema(self, schema: Mapping[str, Any] | None) -> None:
        if schema is None:
            return

        schema_type = schema.get("type")
        if schema_type is not None and schema_type != "object":
            raise ReportServiceError("Report parameter schema type must be object.")

        properties = schema.get("properties")
        if properties is not None and not isinstance(properties, Mapping):
            raise ReportServiceError("Report parameter schema properties must be an object.")

        required = schema.get("required")
        if required is not None and (
            not isinstance(required, list)
            or any(not isinstance(code, str) or not code.strip() for code in required)
        ):
            raise ReportServiceError("Report parameter schema required must be a list of names.")

        if not isinstance(properties, Mapping):
            return
        for code, raw_config in properties.items():
            if not isinstance(code, str) or not code.strip():
                raise ReportServiceError(
                    "Report parameter schema property names must not be empty."
                )
            if not isinstance(raw_config, Mapping):
                raise ReportServiceError(
                    f"Report parameter schema property {code} must be an object."
                )
            raw_type = raw_config.get("type")
            if raw_type is not None and (
                not isinstance(raw_type, str) or raw_type not in _REPORT_PARAMETER_TYPES
            ):
                raise ReportServiceError(
                    f"Report parameter schema property {code} has unsupported type."
                )

    def _validate_report_default_parameters(
        self,
        *,
        schema: Mapping[str, Any] | None,
        default_parameters: Mapping[str, Any] | None,
    ) -> None:
        if default_parameters is None:
            return
        self._validate_run_parameters_for_schema(schema, default_parameters)

    def _validate_run_parameters_for_schema(
        self,
        schema: Mapping[str, Any] | None,
        parameters: Mapping[str, Any],
    ) -> None:
        if not isinstance(schema, Mapping):
            return

        properties = schema.get("properties")
        if not isinstance(properties, Mapping):
            return
        errors: list[str] = []
        required_codes = self._report_parameter_required_codes(schema)
        for code in sorted(required_codes):
            if self._is_report_parameter_missing(parameters.get(code)):
                errors.append(f"Report parameter {code} is required.")

        for code, raw_config in properties.items():
            if not isinstance(code, str) or not isinstance(raw_config, Mapping):
                continue
            raw_type = raw_config.get("type")
            parameter_type = raw_type if isinstance(raw_type, str) else "string"
            if parameter_type not in _REPORT_PARAMETER_TYPES:
                continue
            if code not in parameters:
                continue
            value = parameters.get(code)
            if value is None:
                continue
            errors.extend(
                self._validate_report_parameter_value(
                    code=code,
                    parameter_type=parameter_type,
                    value=value,
                    config=raw_config,
                )
            )

        if errors:
            raise ReportServiceError(f"Invalid report parameters: {'; '.join(errors)}")

    def _validate_report_parameter_value(
        self,
        *,
        code: str,
        parameter_type: str,
        value: Any,
        config: Mapping[str, Any],
    ) -> list[str]:
        option_errors = self._validate_report_parameter_options(
            code=code,
            parameter_type=parameter_type,
            value=value,
            config=config,
        )

        if parameter_type == "string":
            if not isinstance(value, str):
                return [f"Report parameter {code} must be a string.", *option_errors]
            return [
                *self._validate_report_string_parameter(code=code, value=value, config=config),
                *option_errors,
            ]

        if parameter_type == "boolean":
            if not isinstance(value, bool):
                return [f"Report parameter {code} must be a boolean.", *option_errors]
            return option_errors

        if not self._is_json_number(value):
            return [f"Report parameter {code} must be a number.", *option_errors]
        number_value = float(value)
        numeric_errors = []
        if parameter_type == "integer" and not self._is_json_integer(value):
            numeric_errors.append(f"Report parameter {code} must be an integer.")
        numeric_errors.extend(
            self._validate_report_numeric_parameter(
                code=code,
                value=number_value,
                config=config,
            )
        )
        return [*numeric_errors, *option_errors]

    def _validate_report_string_parameter(
        self,
        *,
        code: str,
        value: str,
        config: Mapping[str, Any],
    ) -> list[str]:
        errors: list[str] = []
        min_length = self._non_negative_integer_constraint(config.get("minLength"))
        max_length = self._non_negative_integer_constraint(config.get("maxLength"))
        pattern = config.get("pattern")
        if min_length is not None and len(value) < min_length:
            errors.append(f"Report parameter {code} must be at least {min_length} characters.")
        if max_length is not None and len(value) > max_length:
            errors.append(f"Report parameter {code} must be at most {max_length} characters.")
        if isinstance(pattern, str) and not self._matches_report_parameter_pattern(value, pattern):
            errors.append(f"Report parameter {code} must match pattern.")
        return errors

    def _validate_report_numeric_parameter(
        self,
        *,
        code: str,
        value: float,
        config: Mapping[str, Any],
    ) -> list[str]:
        errors: list[str] = []
        minimum = self._finite_number_constraint(config.get("minimum"))
        maximum = self._finite_number_constraint(config.get("maximum"))
        exclusive_minimum = self._finite_number_constraint(config.get("exclusiveMinimum"))
        exclusive_maximum = self._finite_number_constraint(config.get("exclusiveMaximum"))
        multiple_of = self._positive_number_constraint(config.get("multipleOf"))
        if minimum is not None and value < minimum:
            errors.append(
                f"Report parameter {code} must be at least {self._format_number(minimum)}."
            )
        if maximum is not None and value > maximum:
            errors.append(
                f"Report parameter {code} must be at most {self._format_number(maximum)}."
            )
        if exclusive_minimum is not None and value <= exclusive_minimum:
            errors.append(
                f"Report parameter {code} must be greater than "
                f"{self._format_number(exclusive_minimum)}."
            )
        if exclusive_maximum is not None and value >= exclusive_maximum:
            errors.append(
                f"Report parameter {code} must be less than "
                f"{self._format_number(exclusive_maximum)}."
            )
        if multiple_of is not None and not self._is_multiple_of(value, multiple_of):
            errors.append(
                f"Report parameter {code} must be a multiple of {self._format_number(multiple_of)}."
            )
        return errors

    def _validate_report_parameter_options(
        self,
        *,
        code: str,
        parameter_type: str,
        value: Any,
        config: Mapping[str, Any],
    ) -> list[str]:
        options = self._report_parameter_options(config, parameter_type)
        if not options or value in options:
            return []
        formatted_options = ", ".join(self._format_option(option) for option in options)
        return [f"Report parameter {code} must be one of: {formatted_options}."]

    def _report_parameter_options(
        self,
        config: Mapping[str, Any],
        parameter_type: str,
    ) -> list[Any]:
        one_of = config.get("oneOf")
        if isinstance(one_of, list):
            options = [
                option["const"]
                for option in one_of
                if isinstance(option, Mapping)
                and "const" in option
                and self._matches_report_parameter_type(option["const"], parameter_type)
            ]
            if options:
                return options

        enum = config.get("enum")
        if not isinstance(enum, list):
            return []
        return [
            option for option in enum if self._matches_report_parameter_type(option, parameter_type)
        ]

    def _report_parameter_required_codes(self, schema: Mapping[str, Any]) -> set[str]:
        required = schema.get("required")
        if not isinstance(required, list):
            return set()
        return {code for code in required if isinstance(code, str) and code.strip()}

    def _is_report_parameter_missing(self, value: Any) -> bool:
        return value is None or (isinstance(value, str) and not value.strip())

    def _matches_report_parameter_type(self, value: Any, parameter_type: str) -> bool:
        if parameter_type == "string":
            return isinstance(value, str)
        if parameter_type == "boolean":
            return isinstance(value, bool)
        if parameter_type == "integer":
            return self._is_json_integer(value)
        if parameter_type == "number":
            return self._is_json_number(value)
        return False

    def _is_json_number(self, value: Any) -> bool:
        return (
            isinstance(value, int | float) and not isinstance(value, bool) and math.isfinite(value)
        )

    def _is_json_integer(self, value: Any) -> bool:
        return isinstance(value, int) and not isinstance(value, bool)

    def _finite_number_constraint(self, value: Any) -> float | None:
        if self._is_json_number(value):
            return float(value)
        return None

    def _positive_number_constraint(self, value: Any) -> float | None:
        number = self._finite_number_constraint(value)
        if number is not None and number > 0:
            return number
        return None

    def _non_negative_integer_constraint(self, value: Any) -> int | None:
        if self._is_json_integer(value) and value >= 0:
            return int(value)
        return None

    def _matches_report_parameter_pattern(self, value: str, pattern: str) -> bool:
        try:
            return re.search(pattern, value) is not None
        except re.error:
            return True

    def _is_multiple_of(self, value: float, multiple_of: float) -> bool:
        try:
            value_decimal = Decimal(str(value))
            multiple_decimal = Decimal(str(multiple_of))
            return value_decimal % multiple_decimal == 0
        except (InvalidOperation, ValueError, ZeroDivisionError):
            quotient = value / multiple_of
            return math.isclose(quotient, round(quotient), rel_tol=0, abs_tol=1e-12)

    def _format_number(self, value: float) -> str:
        if value.is_integer():
            return str(int(value))
        return str(value)

    def _format_option(self, value: Any) -> str:
        if isinstance(value, bool):
            return "true" if value else "false"
        return str(value)

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


def _write_xlsx(sheet_title: str, fieldnames: list[str], rows: list[dict[str, str]]) -> bytes:
    workbook = _openpyxl().Workbook()
    worksheet = workbook.active
    worksheet.title = sheet_title[:31]
    worksheet.append(fieldnames)
    for row in rows:
        worksheet.append([row.get(fieldname, "") for fieldname in fieldnames])
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def _flatten_pdf_summary(summary: dict[str, Any]) -> list[str]:
    if not summary:
        return ["(empty)"]
    lines: list[str] = []
    for key, value in sorted(summary.items()):
        if isinstance(value, dict):
            if not value:
                lines.append(f"{key}: {{}}")
                continue
            for child_key, child_value in sorted(value.items()):
                lines.append(f"{key}.{child_key}: {_csv_cell(child_value)}")
            continue
        lines.append(f"{key}: {_csv_cell(value)}")
    return lines


def _write_pdf(title: str, lines: list[str]) -> bytes:
    buffer = BytesIO()
    page_width = float(A4[0])
    page_height = float(A4[1])
    margin_x = float(18 * mm)
    margin_y = float(18 * mm)
    font_name = _pdf_font_name()
    font_size = 10.0
    title_font_size = 13.0
    line_height = 14.0
    max_width = page_width - (margin_x * 2)
    y_position = page_height - margin_y

    pdf_canvas = canvas.Canvas(buffer, pagesize=A4)
    pdf_canvas.setTitle(title)
    pdf_canvas.setFont(font_name, title_font_size)
    for line in _wrap_pdf_line(title, max_width, font_name, title_font_size):
        if y_position < margin_y:
            pdf_canvas.showPage()
            y_position = page_height - margin_y
        pdf_canvas.drawString(margin_x, y_position, line)
        y_position -= line_height + 2
    pdf_canvas.setFont(font_name, font_size)
    y_position -= line_height

    for source_line in lines[1:] or [""]:
        for line in _wrap_pdf_line(source_line, max_width, font_name, font_size):
            if y_position < margin_y:
                pdf_canvas.showPage()
                pdf_canvas.setFont(font_name, font_size)
                y_position = page_height - margin_y
            pdf_canvas.drawString(margin_x, y_position, line)
            y_position -= line_height

    pdf_canvas.save()
    return buffer.getvalue()


def _pdf_font_name() -> str:
    with suppress(KeyError):
        pdfmetrics.getFont(_PDF_FONT_NAME)
        return _PDF_FONT_NAME
    for candidate in _PDF_FONT_CANDIDATES:
        if candidate.is_file():
            pdfmetrics.registerFont(TTFont(_PDF_FONT_NAME, str(candidate)))
            return _PDF_FONT_NAME
    return "Helvetica"


def _wrap_pdf_line(
    line: str,
    max_width: float,
    font_name: str,
    font_size: float,
) -> list[str]:
    if not line:
        return [""]

    wrapped: list[str] = []
    current = ""
    for word in line.split(" "):
        candidate = word if not current else f"{current} {word}"
        if pdfmetrics.stringWidth(candidate, font_name, font_size) <= max_width:
            current = candidate
            continue
        if current:
            wrapped.append(current)
        if pdfmetrics.stringWidth(word, font_name, font_size) <= max_width:
            current = word
            continue
        chunks = _split_pdf_word(word, max_width, font_name, font_size)
        wrapped.extend(chunks[:-1])
        current = chunks[-1] if chunks else ""

    if current or not wrapped:
        wrapped.append(current)
    return wrapped


def _split_pdf_word(
    word: str,
    max_width: float,
    font_name: str,
    font_size: float,
) -> list[str]:
    chunks: list[str] = []
    current = ""
    for character in word:
        candidate = f"{current}{character}"
        if current and pdfmetrics.stringWidth(candidate, font_name, font_size) > max_width:
            chunks.append(current)
            current = character
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def _openpyxl() -> Any:
    return cast(Any, import_module("openpyxl"))
