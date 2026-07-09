import json
import re
from contextlib import suppress
from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from uuid import UUID
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile

from reportlab.lib.pagesizes import A4  # type: ignore[import-untyped]
from reportlab.lib.units import mm  # type: ignore[import-untyped]
from reportlab.pdfbase import pdfmetrics  # type: ignore[import-untyped]
from reportlab.pdfbase.ttfonts import TTFont  # type: ignore[import-untyped]
from reportlab.pdfgen import canvas  # type: ignore[import-untyped]
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.constants import DOCUMENT_TEMPLATE_FORMATS
from app.models import (
    Card,
    CardTemplate,
    DocumentTemplate,
    DocumentTemplateVersion,
    FormBlock,
    FormField,
    GeneratedDocument,
    Registry,
    StoredFile,
)
from app.schemas.card_template_layouts import CardTemplateFormLayoutRead
from app.services.attachments import (
    AttachmentStorage,
    StoredObjectInfo,
    normalize_attachment_filename,
)
from app.services.audit import AuditService
from app.services.card_print import CARD_PRINT_LAYOUT_VERSION, validate_card_print_layout
from app.services.card_template_projection import expand_linked_card_layout
from app.services.cards import (
    CardFieldRead,
    CardRead,
    CardService,
    CardServiceError,
    FileRefValueRead,
)
from app.services.permissions import PermissionDeniedError, PermissionService


class DocumentServiceError(ValueError):
    """Raised when document template or generation state is invalid."""


@dataclass(frozen=True)
class _RenderContext:
    card: CardRead


@dataclass(frozen=True)
class RenderedDocumentDownload:
    content: bytes
    filename: str
    content_type: str


_PLACEHOLDER_PATTERN = re.compile(r"{{\s*([A-Za-z0-9_.]+)\s*}}")
_DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_PDF_CONTENT_TYPE = "application/pdf"
_CARD_PRINT_DECORATIVE_KINDS = {"divider", "line", "rectangle", "container", "panel"}
_PDF_FONT_NAME = "RegEngineDejaVuSans"
_PDF_FONT_CANDIDATES = (
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
    Path("C:/Windows/Fonts/DejaVuSans.ttf"),
    Path("C:/Windows/Fonts/arial.ttf"),
)


class DocumentService:
    def __init__(
        self,
        session: Session,
        *,
        storage: AttachmentStorage,
        template_storage: AttachmentStorage | None = None,
    ) -> None:
        self.session = session
        self.storage = storage
        self.template_storage = template_storage or storage

    def create_template_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        code: str,
        name: str,
        template_body: str,
        description: str | None = None,
        template_format: str = "docx_text_v1",
        output_filename_template: str = "{{ card.display_name }}.docx",
        output_content_type: str = _DOCX_CONTENT_TYPE,
    ) -> DocumentTemplate:
        self._require_schema_permission(actor_user_id, registry_id)
        self._validate_template_format(template_format)
        template = DocumentTemplate(
            registry_id=registry_id,
            code=self._clean_required_text(code, "code"),
            name=self._clean_required_text(name, "name"),
            description=description,
            template_format=template_format,
            template_body=self._clean_required_text(template_body, "body"),
            output_filename_template=self._clean_required_text(
                output_filename_template,
                "output filename template",
            ),
            output_content_type=self._clean_required_text(
                output_content_type,
                "output content type",
            ),
            created_by=actor_user_id,
            updated_by=actor_user_id,
        )
        self.session.add(template)
        self.session.flush()
        version = self._create_text_template_version(
            template_id=template.id,
            template_body=template.template_body or "",
            created_by=actor_user_id,
            version_number=1,
        )
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="document_template_create",
            object_type="document_template",
            object_id=template.id,
            new_data_json={
                "registry_id": str(registry_id),
                "code": template.code,
                "template_format": template.template_format,
                "version_id": str(version.id),
                "version_number": version.version_number,
            },
        )
        return template

    def create_binary_template_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        code: str,
        name: str,
        original_filename: str,
        content_type: str,
        content: bytes,
        description: str | None = None,
        output_filename_template: str = "{{ card.display_name }}.docx",
    ) -> tuple[DocumentTemplate, DocumentTemplateVersion]:
        self._require_schema_permission(actor_user_id, registry_id)
        clean_filename = normalize_attachment_filename(original_filename)
        clean_content_type = self._clean_required_text(content_type, "content type")
        self._validate_binary_docx_template(
            original_filename=clean_filename,
            content_type=clean_content_type,
            content=content,
        )
        stored_info = self.template_storage.write_bytes(content)
        try:
            stored_file = self._create_template_stored_file(
                actor_user_id=actor_user_id,
                stored_info=stored_info,
                original_filename=clean_filename,
                content_type=clean_content_type,
            )
            template = DocumentTemplate(
                registry_id=registry_id,
                code=self._clean_required_text(code, "code"),
                name=self._clean_required_text(name, "name"),
                description=description,
                template_format="docx_binary_v1",
                template_body=None,
                output_filename_template=self._clean_required_text(
                    output_filename_template,
                    "output filename template",
                ),
                output_content_type=_DOCX_CONTENT_TYPE,
                created_by=actor_user_id,
                updated_by=actor_user_id,
            )
            self.session.add(template)
            self.session.flush()
            version = DocumentTemplateVersion(
                template_id=template.id,
                version_number=1,
                template_format="docx_binary_v1",
                stored_file_id=stored_file.id,
                original_filename=stored_file.original_filename,
                content_type=stored_file.content_type,
                content_length_bytes=stored_file.content_length_bytes,
                created_by=actor_user_id,
            )
            self.session.add(version)
            self.session.flush()
            audit_service = AuditService(self.session)
            audit_service.record_user_event(
                actor_user_id=actor_user_id,
                action="document_template_create",
                object_type="document_template",
                object_id=template.id,
                new_data_json={
                    "registry_id": str(registry_id),
                    "code": template.code,
                    "template_format": template.template_format,
                    "version_id": str(version.id),
                    "version_number": version.version_number,
                },
            )
            self._record_template_version_audit(
                audit_service=audit_service,
                actor_user_id=actor_user_id,
                version=version,
                stored_file=stored_file,
            )
            return template, version
        except Exception:
            with suppress(Exception):
                self.template_storage.delete_bytes(stored_info.storage_key)
            raise

    def create_binary_template_version_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
        original_filename: str,
        content_type: str,
        content: bytes,
    ) -> DocumentTemplateVersion:
        template = self._get_active_template(template_id)
        self._require_schema_permission(actor_user_id, template.registry_id)
        clean_filename = normalize_attachment_filename(original_filename)
        clean_content_type = self._clean_required_text(content_type, "content type")
        self._validate_binary_docx_template(
            original_filename=clean_filename,
            content_type=clean_content_type,
            content=content,
        )
        stored_info = self.template_storage.write_bytes(content)
        try:
            stored_file = self._create_template_stored_file(
                actor_user_id=actor_user_id,
                stored_info=stored_info,
                original_filename=clean_filename,
                content_type=clean_content_type,
            )
            version = DocumentTemplateVersion(
                template_id=template.id,
                version_number=self._next_template_version_number(template.id),
                template_format="docx_binary_v1",
                stored_file_id=stored_file.id,
                original_filename=stored_file.original_filename,
                content_type=stored_file.content_type,
                content_length_bytes=stored_file.content_length_bytes,
                created_by=actor_user_id,
            )
            template.template_format = "docx_binary_v1"
            template.template_body = None
            template.updated_by = actor_user_id
            self.session.add(version)
            self.session.flush()
            self._record_template_version_audit(
                audit_service=AuditService(self.session),
                actor_user_id=actor_user_id,
                version=version,
                stored_file=stored_file,
            )
            return version
        except Exception:
            with suppress(Exception):
                self.template_storage.delete_bytes(stored_info.storage_key)
            raise

    def create_card_print_template_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        code: str,
        name: str,
        layout_json: dict[str, object],
        card_template_id: UUID | None = None,
        description: str | None = None,
        output_filename_template: str = "{{ card.display_name }}.docx",
    ) -> DocumentTemplate:
        self._require_schema_permission(actor_user_id, registry_id)
        self._get_active_registry(registry_id)
        normalized_layout = self._validate_card_print_layout_for_template(
            registry_id=registry_id,
            card_template_id=card_template_id,
            layout_json=layout_json,
        )
        template = DocumentTemplate(
            registry_id=registry_id,
            card_template_id=card_template_id,
            code=self._clean_required_text(code, "code"),
            name=self._clean_required_text(name, "name"),
            description=description,
            template_format=CARD_PRINT_LAYOUT_VERSION,
            template_body=None,
            output_filename_template=self._clean_required_text(
                output_filename_template,
                "output filename template",
            ),
            output_content_type=_DOCX_CONTENT_TYPE,
            created_by=actor_user_id,
            updated_by=actor_user_id,
        )
        self.session.add(template)
        self.session.flush()
        version = self._create_card_print_template_version(
            template_id=template.id,
            layout_json=normalized_layout,
            created_by=actor_user_id,
            version_number=1,
        )
        audit_service = AuditService(self.session)
        audit_service.record_user_event(
            actor_user_id=actor_user_id,
            action="document_template_create",
            object_type="document_template",
            object_id=template.id,
            new_data_json={
                "registry_id": str(registry_id),
                "card_template_id": str(card_template_id) if card_template_id else None,
                "code": template.code,
                "template_format": template.template_format,
                "version_id": str(version.id),
                "version_number": version.version_number,
            },
        )
        self._record_card_print_template_version_audit(
            audit_service=audit_service,
            actor_user_id=actor_user_id,
            version=version,
        )
        return template

    def create_card_print_template_version_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
        layout_json: dict[str, object],
    ) -> DocumentTemplateVersion:
        template = self._get_active_template(template_id)
        if template.template_format != CARD_PRINT_LAYOUT_VERSION:
            raise DocumentServiceError("Document template is not a card print layout template.")
        self._require_schema_permission(actor_user_id, template.registry_id)
        normalized_layout = self._validate_card_print_layout_for_template(
            registry_id=template.registry_id,
            card_template_id=template.card_template_id,
            layout_json=layout_json,
        )
        version = self._create_card_print_template_version(
            template_id=template.id,
            layout_json=normalized_layout,
            created_by=actor_user_id,
            version_number=self._next_template_version_number(template.id),
        )
        template.template_format = CARD_PRINT_LAYOUT_VERSION
        template.template_body = None
        template.output_content_type = _DOCX_CONTENT_TYPE
        template.updated_by = actor_user_id
        self.session.flush()
        self._record_card_print_template_version_audit(
            audit_service=AuditService(self.session),
            actor_user_id=actor_user_id,
            version=version,
        )
        return version

    def convert_print_view_to_linked_card_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
    ) -> DocumentTemplateVersion:
        template = self._get_active_template(template_id)
        if template.template_format != CARD_PRINT_LAYOUT_VERSION:
            raise DocumentServiceError("Document template is not a card print layout template.")
        self._require_schema_permission(actor_user_id, template.registry_id)
        if template.card_template_id is None:
            raise DocumentServiceError("Card print layout is not linked to a card template.")
        current_version = self._latest_template_version(template.id)
        if current_version is None or current_version.layout_json is None:
            raise DocumentServiceError("Card print layout template version was not found.")
        converted_layout = self._linked_card_conversion_layout(
            current_version.layout_json,
            card_template_id=template.card_template_id,
        )
        return self.create_card_print_template_version_for_actor(
            actor_user_id=actor_user_id,
            template_id=template.id,
            layout_json=converted_layout,
        )

    def list_template_versions_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
        include_archive: bool = False,
    ) -> list[DocumentTemplateVersion]:
        template = self._get_template(template_id)
        self._require_registry_read_permission(actor_user_id, template.registry_id)
        criteria = [DocumentTemplateVersion.template_id == template.id]
        if not include_archive:
            criteria.append(DocumentTemplateVersion.archived_at.is_(None))
        return list(
            self.session.scalars(
                select(DocumentTemplateVersion)
                .where(*criteria)
                .order_by(DocumentTemplateVersion.version_number)
            ).all()
        )

    def get_current_template_version(
        self,
        template_id: UUID,
        *,
        include_archive: bool = False,
    ) -> DocumentTemplateVersion | None:
        return self._latest_template_version(template_id, include_archive=include_archive)

    def read_template_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
        include_archive: bool = False,
    ) -> DocumentTemplate:
        template = self._get_template(template_id)
        if template.archived_at is not None and not include_archive:
            raise DocumentServiceError("Document template is only readable in archive scope.")
        self._require_registry_read_permission(actor_user_id, template.registry_id)
        return template

    def archive_template_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
        archive_reason: str | None = None,
    ) -> DocumentTemplate:
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
            action="document_template_archive",
            object_type="document_template",
            object_id=template.id,
            old_data_json={"archived_at": None, "is_active": True},
            new_data_json={"archive_reason": archive_reason},
        )
        return template

    def list_templates_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        include_archive: bool = False,
    ) -> list[DocumentTemplate]:
        self._require_registry_read_permission(actor_user_id, registry_id)
        self._get_active_registry(registry_id)
        criteria = [DocumentTemplate.registry_id == registry_id]
        if not include_archive:
            criteria.append(DocumentTemplate.archived_at.is_(None))
            criteria.append(DocumentTemplate.is_active.is_(True))
        return list(
            self.session.scalars(
                select(DocumentTemplate).where(*criteria).order_by(DocumentTemplate.name)
            ).all()
        )

    def list_card_print_templates_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        card_template_id: UUID | None = None,
        include_archive: bool = False,
    ) -> list[DocumentTemplate]:
        self._require_registry_read_permission(actor_user_id, registry_id)
        self._get_active_registry(registry_id)
        criteria = [
            DocumentTemplate.registry_id == registry_id,
            DocumentTemplate.template_format == CARD_PRINT_LAYOUT_VERSION,
        ]
        if card_template_id is not None:
            self._validate_card_template_scope(registry_id, card_template_id)
            criteria.append(DocumentTemplate.card_template_id == card_template_id)
        if not include_archive:
            criteria.append(DocumentTemplate.archived_at.is_(None))
            criteria.append(DocumentTemplate.is_active.is_(True))
        return list(
            self.session.scalars(
                select(DocumentTemplate).where(*criteria).order_by(DocumentTemplate.name)
            ).all()
        )

    def generate_document_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
        card_id: UUID,
        title: str | None = None,
    ) -> GeneratedDocument:
        template = self._get_active_template(template_id)
        try:
            card_read = CardService(self.session).read_card_for_actor(
                actor_user_id=actor_user_id,
                card_id=card_id,
            )
        except CardServiceError as exc:
            raise DocumentServiceError(str(exc)) from exc
        if template.registry_id != card_read.registry_id:
            raise DocumentServiceError("Document template does not belong to the card registry.")
        self._require_card_manage_permission(
            actor_user_id,
            card_read.organization_id,
            registry_id=card_read.registry_id,
        )

        template_version = self._latest_template_version(template.id)
        render_context = _RenderContext(card=card_read)
        output_filename = normalize_attachment_filename(
            self._render_plain_text_template(
                template.output_filename_template,
                render_context,
            )
        )
        content = self._render_template_content(template, template_version, render_context)
        stored_info = self.storage.write_bytes(content)
        try:
            stored_file = StoredFile(
                storage_backend=self.storage.backend_name,
                storage_key=stored_info.storage_key,
                original_filename=output_filename,
                content_type=template.output_content_type,
                content_length_bytes=stored_info.content_length_bytes,
                checksum_sha256=stored_info.checksum_sha256,
                scanner_status="deferred",
                scanner_details_json={"source": "generated_document_v1"},
                created_by=actor_user_id,
            )
            self.session.add(stored_file)
            self.session.flush()
            generated = GeneratedDocument(
                card_id=card_read.card_id,
                template_id=template.id,
                template_version_id=template_version.id if template_version is not None else None,
                stored_file_id=stored_file.id,
                title=self._document_title(title, template.name),
                output_filename=output_filename,
                content_type=template.output_content_type,
                render_status="generated",
                generated_by=actor_user_id,
            )
            self.session.add(generated)
            self.session.flush()
            AuditService(self.session).record_user_event(
                actor_user_id=actor_user_id,
                action="generated_document_generate",
                object_type="generated_document",
                object_id=generated.id,
                new_data_json={
                    "card_id": str(card_read.card_id),
                    "template_id": str(template.id),
                    "template_version_id": (
                        str(template_version.id) if template_version is not None else None
                    ),
                    "stored_file_id": str(stored_file.id),
                    "content_type": stored_file.content_type,
                },
            )
            return generated
        except Exception:
            with suppress(Exception):
                self.storage.delete_bytes(stored_info.storage_key)
            raise

    def render_blank_card_print_template_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
        output_format: str,
    ) -> RenderedDocumentDownload:
        template = self._get_active_template(template_id)
        if template.template_format != CARD_PRINT_LAYOUT_VERSION:
            raise DocumentServiceError("Document template is not a card print layout template.")
        self._require_registry_read_permission(actor_user_id, template.registry_id)

        template_version = self._latest_template_version(template.id)
        if template_version is None or template_version.layout_json is None:
            raise DocumentServiceError("Card print layout template version was not found.")

        render_context = _RenderContext(card=self._blank_card_print_context_card(template))
        if output_format == "docx":
            output_filename = normalize_attachment_filename(
                self._render_plain_text_template(
                    template.output_filename_template,
                    render_context,
                )
            )
            return RenderedDocumentDownload(
                content=self._build_docx_from_card_print_layout(
                    template_version.layout_json,
                    render_context,
                ),
                filename=output_filename,
                content_type=_DOCX_CONTENT_TYPE,
            )
        if output_format == "pdf":
            output_filename = self._pdf_output_filename(
                self._render_plain_text_template(
                    template.output_filename_template,
                    render_context,
                )
            )
            return RenderedDocumentDownload(
                content=self._build_pdf_from_card_print_layout(
                    template_version.layout_json,
                    render_context,
                ),
                filename=output_filename,
                content_type=_PDF_CONTENT_TYPE,
            )
        raise DocumentServiceError("Unsupported card print template output format.")

    def render_blank_card_print_layout_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        layout_json: dict[str, object],
        output_format: str,
        name: str,
        card_template_id: UUID | None = None,
        output_filename_template: str = "{{ card.display_name }}.docx",
    ) -> RenderedDocumentDownload:
        self._require_schema_permission(actor_user_id, registry_id)
        self._get_active_registry(registry_id)
        normalized_layout = self._validate_card_print_layout_for_template(
            registry_id=registry_id,
            card_template_id=card_template_id,
            layout_json=layout_json,
        )
        render_context = _RenderContext(
            card=self._blank_card_print_context_card_from_values(
                registry_id=registry_id,
                card_template_id=card_template_id,
                display_name=self._clean_required_text(name, "name"),
            )
        )
        clean_output_template = self._clean_required_text(
            output_filename_template,
            "output filename template",
        )
        if output_format == "docx":
            output_filename = normalize_attachment_filename(
                self._render_plain_text_template(clean_output_template, render_context)
            )
            return RenderedDocumentDownload(
                content=self._build_docx_from_card_print_layout(normalized_layout, render_context),
                filename=output_filename,
                content_type=_DOCX_CONTENT_TYPE,
            )
        if output_format == "pdf":
            output_filename = self._pdf_output_filename(
                self._render_plain_text_template(clean_output_template, render_context)
            )
            return RenderedDocumentDownload(
                content=self._build_pdf_from_card_print_layout(normalized_layout, render_context),
                filename=output_filename,
                content_type=_PDF_CONTENT_TYPE,
            )
        raise DocumentServiceError("Unsupported card print template output format.")

    def preview_card_print_layout_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        layout_json: dict[str, object],
        card_template_id: UUID | None = None,
        card_id: UUID | None = None,
        sample: bool = True,
    ) -> dict[str, object]:
        self._require_registry_read_permission(actor_user_id, registry_id)
        self._get_active_registry(registry_id)
        allowed_field_ids = self._card_print_allowed_field_ids(
            registry_id=registry_id,
            card_template_id=card_template_id,
        )
        allowed_block_ids = self._card_print_allowed_block_ids(registry_id=registry_id)
        result = validate_card_print_layout(
            layout_json,
            allowed_field_ids=allowed_field_ids,
            allowed_block_ids=allowed_block_ids,
        )
        if result.errors:
            raise DocumentServiceError("; ".join(result.errors))
        if card_id is not None and not sample:
            try:
                card_read = CardService(self.session).read_card_for_actor(
                    actor_user_id=actor_user_id,
                    card_id=card_id,
                )
            except CardServiceError as exc:
                raise DocumentServiceError(str(exc)) from exc
            if card_read.registry_id != registry_id:
                raise DocumentServiceError("Card does not belong to the preview registry.")
        else:
            card_read = self._blank_card_print_context_card_from_values(
                registry_id=registry_id,
                card_template_id=card_template_id,
                display_name="Печатная форма",
            )
        context = _RenderContext(card=card_read)
        return {
            "layout_json": result.normalized_layout,
            "warnings": result.warnings,
            "view": {
                "card_id": str(card_read.card_id),
                "display_name": card_read.display_name,
                "items": [
                    {
                        "id": str(item.get("id") or ""),
                        "kind": str(item.get("kind") or ""),
                        "text": self._card_print_item_text(item, context),
                    }
                    for item in self._card_print_items(result.normalized_layout)
                ],
            },
        }

    def generate_pdf_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
        card_id: UUID,
        title: str | None = None,
    ) -> GeneratedDocument:
        template = self._get_active_template(template_id)
        try:
            card_read = CardService(self.session).read_card_for_actor(
                actor_user_id=actor_user_id,
                card_id=card_id,
            )
        except CardServiceError as exc:
            raise DocumentServiceError(str(exc)) from exc
        if template.registry_id != card_read.registry_id:
            raise DocumentServiceError("Document template does not belong to the card registry.")
        self._require_card_manage_permission(
            actor_user_id,
            card_read.organization_id,
            registry_id=card_read.registry_id,
        )

        template_version = self._latest_template_version(template.id)
        template_format = (
            template_version.template_format
            if template_version is not None
            else template.template_format
        )
        if template_format not in {"docx_text_v1", CARD_PRINT_LAYOUT_VERSION}:
            raise DocumentServiceError(
                "PDF conversion supports docx_text_v1 and card_print_layout_v1 templates."
            )

        render_context = _RenderContext(card=card_read)
        output_filename = self._pdf_output_filename(
            self._render_plain_text_template(
                template.output_filename_template,
                render_context,
            )
        )
        template_body = (
            template_version.template_body
            if template_version is not None
            else template.template_body
        )
        if template_format == CARD_PRINT_LAYOUT_VERSION:
            if template_version is None or template_version.layout_json is None:
                raise DocumentServiceError("Card print layout template version was not found.")
            content = self._build_pdf_from_card_print_layout(
                template_version.layout_json,
                render_context,
            )
        else:
            rendered_text = self._render_plain_text_template(template_body or "", render_context)
            content = self._build_pdf_from_text(rendered_text)
        stored_info = self.storage.write_bytes(content)
        try:
            stored_file = StoredFile(
                storage_backend=self.storage.backend_name,
                storage_key=stored_info.storage_key,
                original_filename=output_filename,
                content_type=_PDF_CONTENT_TYPE,
                content_length_bytes=stored_info.content_length_bytes,
                checksum_sha256=stored_info.checksum_sha256,
                scanner_status="deferred",
                scanner_details_json={"source": "generated_document_pdf_v1"},
                created_by=actor_user_id,
            )
            self.session.add(stored_file)
            self.session.flush()
            generated = GeneratedDocument(
                card_id=card_read.card_id,
                template_id=template.id,
                template_version_id=(template_version.id if template_version is not None else None),
                stored_file_id=stored_file.id,
                title=self._document_title(title, template.name),
                output_filename=output_filename,
                content_type=_PDF_CONTENT_TYPE,
                render_status="generated",
                generated_by=actor_user_id,
            )
            self.session.add(generated)
            self.session.flush()
            AuditService(self.session).record_user_event(
                actor_user_id=actor_user_id,
                action="generated_document_pdf_generate",
                object_type="generated_document",
                object_id=generated.id,
                new_data_json={
                    "card_id": str(card_read.card_id),
                    "template_id": str(template.id),
                    "template_version_id": (
                        str(template_version.id) if template_version is not None else None
                    ),
                    "stored_file_id": str(stored_file.id),
                    "content_type": stored_file.content_type,
                },
            )
            return generated
        except Exception:
            with suppress(Exception):
                self.storage.delete_bytes(stored_info.storage_key)
            raise

    def read_generated_document_content_for_actor(
        self,
        *,
        actor_user_id: UUID,
        generated_document_id: UUID,
        include_archive: bool = False,
    ) -> bytes:
        generated = self._get_generated_document(generated_document_id)
        if generated.archived_at is not None and not include_archive:
            raise DocumentServiceError("Generated document is only readable in archive scope.")
        card = self._get_readable_card(generated.card_id, include_archive=include_archive)
        if not PermissionService(self.session).can_see_organization(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        ):
            raise PermissionDeniedError("Actor cannot read generated document in this card scope.")
        stored_file = self.session.get(StoredFile, generated.stored_file_id)
        if stored_file is None:
            raise DocumentServiceError("Generated document file was not found.")
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="generated_document_download",
            object_type="generated_document",
            object_id=generated.id,
            new_data_json={
                "stored_file_id": str(stored_file.id),
                "content_length_bytes": stored_file.content_length_bytes,
            },
        )
        return self.storage.read_bytes(stored_file.storage_key)

    def list_generated_documents_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        include_archive: bool = False,
    ) -> list[GeneratedDocument]:
        card = self._get_readable_card(card_id, include_archive=include_archive)
        if not PermissionService(self.session).can_see_organization(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        ):
            raise PermissionDeniedError("Actor cannot read generated documents in this card scope.")
        criteria = [GeneratedDocument.card_id == card.id]
        if not include_archive:
            criteria.append(GeneratedDocument.archived_at.is_(None))
        return list(
            self.session.scalars(
                select(GeneratedDocument)
                .where(*criteria)
                .order_by(GeneratedDocument.created_at.desc(), GeneratedDocument.id)
            ).all()
        )

    def read_generated_document_for_actor(
        self,
        *,
        actor_user_id: UUID,
        generated_document_id: UUID,
        include_archive: bool = False,
    ) -> GeneratedDocument:
        generated = self._get_generated_document(generated_document_id)
        if generated.archived_at is not None and not include_archive:
            raise DocumentServiceError("Generated document is only readable in archive scope.")
        card = self._get_readable_card(generated.card_id, include_archive=include_archive)
        if not PermissionService(self.session).can_see_organization(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        ):
            raise PermissionDeniedError("Actor cannot read generated document in this card scope.")
        return generated

    def get_stored_file_for_generated_document(self, generated: GeneratedDocument) -> StoredFile:
        stored_file = self.session.get(StoredFile, generated.stored_file_id)
        if stored_file is None:
            raise DocumentServiceError("Generated document file was not found.")
        return stored_file

    def archive_generated_document_for_actor(
        self,
        *,
        actor_user_id: UUID,
        generated_document_id: UUID,
        archive_reason: str | None = None,
    ) -> GeneratedDocument:
        generated = self._get_generated_document(generated_document_id)
        if generated.archived_at is not None:
            return generated

        card = self._get_readable_card(generated.card_id, include_archive=False)
        self._require_card_manage_permission(
            actor_user_id,
            card.organization_id,
            registry_id=card.registry_id,
        )
        generated.archived_at = datetime.now(UTC)
        generated.archived_by = actor_user_id
        generated.archive_reason = archive_reason
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="generated_document_archive",
            object_type="generated_document",
            object_id=generated.id,
            old_data_json={"archived_at": None},
            new_data_json={
                "card_id": str(generated.card_id),
                "stored_file_id": str(generated.stored_file_id),
                "archive_reason": archive_reason,
            },
        )
        return generated

    def _create_text_template_version(
        self,
        *,
        template_id: UUID,
        template_body: str,
        created_by: UUID,
        version_number: int,
    ) -> DocumentTemplateVersion:
        version = DocumentTemplateVersion(
            template_id=template_id,
            version_number=version_number,
            template_format="docx_text_v1",
            template_body=self._clean_required_text(template_body, "body"),
            created_by=created_by,
        )
        self.session.add(version)
        self.session.flush()
        return version

    def _create_card_print_template_version(
        self,
        *,
        template_id: UUID,
        layout_json: dict[str, object],
        created_by: UUID,
        version_number: int,
    ) -> DocumentTemplateVersion:
        version = DocumentTemplateVersion(
            template_id=template_id,
            version_number=version_number,
            template_format=CARD_PRINT_LAYOUT_VERSION,
            layout_json=layout_json,
            created_by=created_by,
        )
        self.session.add(version)
        self.session.flush()
        return version

    def _create_template_stored_file(
        self,
        *,
        actor_user_id: UUID,
        stored_info: StoredObjectInfo,
        original_filename: str,
        content_type: str,
    ) -> StoredFile:
        stored_file = StoredFile(
            storage_backend=self.template_storage.backend_name,
            storage_key=stored_info.storage_key,
            original_filename=original_filename,
            content_type=content_type,
            content_length_bytes=stored_info.content_length_bytes,
            checksum_sha256=stored_info.checksum_sha256,
            scanner_status="deferred",
            scanner_details_json={"source": "document_template_binary_v1"},
            created_by=actor_user_id,
        )
        self.session.add(stored_file)
        self.session.flush()
        return stored_file

    def _record_template_version_audit(
        self,
        *,
        audit_service: AuditService,
        actor_user_id: UUID,
        version: DocumentTemplateVersion,
        stored_file: StoredFile,
    ) -> None:
        audit_service.record_user_event(
            actor_user_id=actor_user_id,
            action="document_template_version_create",
            object_type="document_template",
            object_id=version.template_id,
            new_data_json={
                "version_id": str(version.id),
                "version_number": version.version_number,
                "template_format": version.template_format,
                "stored_file_id": str(stored_file.id),
                "content_type": stored_file.content_type,
                "content_length_bytes": stored_file.content_length_bytes,
            },
        )

    def _record_card_print_template_version_audit(
        self,
        *,
        audit_service: AuditService,
        actor_user_id: UUID,
        version: DocumentTemplateVersion,
    ) -> None:
        audit_service.record_user_event(
            actor_user_id=actor_user_id,
            action="document_template_version_create",
            object_type="document_template",
            object_id=version.template_id,
            new_data_json={
                "version_id": str(version.id),
                "version_number": version.version_number,
                "template_format": version.template_format,
            },
        )

    def _render_template_content(
        self,
        template: DocumentTemplate,
        version: DocumentTemplateVersion | None,
        context: _RenderContext,
    ) -> bytes:
        template_format = (
            version.template_format if version is not None else template.template_format
        )
        if template_format == "docx_binary_v1":
            if version is None or version.stored_file_id is None:
                raise DocumentServiceError("Binary document template version file was not found.")
            stored_file = self.session.get(StoredFile, version.stored_file_id)
            if stored_file is None:
                raise DocumentServiceError("Binary document template file was not found.")
            content = self.template_storage.read_bytes(stored_file.storage_key)
            return self._render_binary_docx_template(content, context)
        if template_format == CARD_PRINT_LAYOUT_VERSION:
            if version is None or version.layout_json is None:
                raise DocumentServiceError("Card print layout template version was not found.")
            return self._build_docx_from_card_print_layout(version.layout_json, context)
        template_body = version.template_body if version is not None else template.template_body
        rendered_text = self._render_plain_text_template(template_body or "", context)
        return self._build_docx_from_text(rendered_text)

    def _render_binary_docx_template(self, content: bytes, context: _RenderContext) -> bytes:
        output = BytesIO()
        try:
            with ZipFile(BytesIO(content), "r") as source:
                names = set(source.namelist())
                if "word/document.xml" not in names:
                    raise DocumentServiceError(
                        "Binary document template must contain word/document.xml."
                    )
                with ZipFile(output, "w", compression=ZIP_DEFLATED) as target:
                    for item in source.infolist():
                        item_content = source.read(item.filename)
                        if item.filename.endswith(".xml"):
                            xml_text = item_content.decode("utf-8")
                            item_content = self._render_plain_text_template(
                                xml_text,
                                context,
                            ).encode("utf-8")
                        target.writestr(item, item_content)
        except UnicodeDecodeError as exc:
            raise DocumentServiceError("Binary document template XML must be UTF-8.") from exc
        except BadZipFile as exc:
            raise DocumentServiceError(
                "Binary document template must be a valid .docx file."
            ) from exc
        return output.getvalue()

    def _validate_binary_docx_template(
        self,
        *,
        original_filename: str,
        content_type: str,
        content: bytes,
    ) -> None:
        if not content:
            raise DocumentServiceError("Binary document template file must not be empty.")
        if not original_filename.lower().endswith(".docx"):
            raise DocumentServiceError("Binary document template filename must end with .docx.")
        if content_type not in {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/octet-stream",
        }:
            raise DocumentServiceError("Binary document template content type is not allowed.")
        try:
            with ZipFile(BytesIO(content), "r") as archive:
                names = set(archive.namelist())
                if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                    raise DocumentServiceError(
                        "Binary document template must be a valid .docx file."
                    )
        except BadZipFile as exc:
            raise DocumentServiceError(
                "Binary document template must be a valid .docx file."
            ) from exc

    def _latest_template_version(
        self,
        template_id: UUID,
        *,
        include_archive: bool = False,
    ) -> DocumentTemplateVersion | None:
        criteria = [DocumentTemplateVersion.template_id == template_id]
        if not include_archive:
            criteria.append(DocumentTemplateVersion.archived_at.is_(None))
        return self.session.scalars(
            select(DocumentTemplateVersion)
            .where(*criteria)
            .order_by(DocumentTemplateVersion.version_number.desc(), DocumentTemplateVersion.id)
            .limit(1)
        ).one_or_none()

    def _next_template_version_number(self, template_id: UUID) -> int:
        current_max = self.session.scalar(
            select(func.max(DocumentTemplateVersion.version_number)).where(
                DocumentTemplateVersion.template_id == template_id
            )
        )
        return 1 if current_max is None else current_max + 1

    def _render_plain_text_template(self, template_body: str, context: _RenderContext) -> str:
        def replace(match: re.Match[str]) -> str:
            return self._format_render_value(self._resolve_placeholder(match.group(1), context))

        return _PLACEHOLDER_PATTERN.sub(replace, template_body)

    def _blank_card_print_context_card(self, template: DocumentTemplate) -> CardRead:
        return self._blank_card_print_context_card_from_values(
            registry_id=template.registry_id,
            card_template_id=template.card_template_id,
            display_name=template.name,
        )

    def _blank_card_print_context_card_from_values(
        self,
        *,
        registry_id: UUID,
        card_template_id: UUID | None,
        display_name: str,
    ) -> CardRead:
        return CardRead(
            card_id=UUID(int=0),
            registry_id=registry_id,
            organization_id=UUID(int=0),
            display_name=display_name,
            card_template_id=card_template_id or UUID(int=0),
            card_template_name=None,
            blocks={},
            fields={},
        )

    def _resolve_placeholder(self, placeholder: str, context: _RenderContext) -> object | None:
        if placeholder == "card.id":
            return context.card.card_id
        if placeholder == "card.display_name":
            return context.card.display_name
        if placeholder == "card.registry_id":
            return context.card.registry_id
        if placeholder == "card.organization_id":
            return context.card.organization_id
        if placeholder.startswith("fields."):
            field_key = placeholder.removeprefix("fields.")
            field_read: CardFieldRead | None = context.card.fields.get(field_key)
            if field_read is None:
                raise DocumentServiceError(f"Unknown document template placeholder: {placeholder}")
            return field_read.value
        raise DocumentServiceError(f"Unknown document template placeholder: {placeholder}")

    def _format_render_value(self, value: object | None) -> str:
        if value is None:
            return ""
        if isinstance(value, FileRefValueRead):
            return self._format_file_ref_value(value)
        if isinstance(value, UUID):
            return str(value)
        if isinstance(value, datetime | date):
            return value.isoformat()
        if isinstance(value, Decimal):
            return str(value)
        if isinstance(value, list):
            return ", ".join(self._format_render_value(item) for item in value)
        if isinstance(value, dict):
            return json.dumps(value, ensure_ascii=False, sort_keys=True)
        return str(value)

    def _format_file_ref_value(self, value: FileRefValueRead) -> str:
        title = value.title.strip()
        original_filename = value.original_filename.strip()
        if title and original_filename and title != original_filename:
            rendered = f"{title} ({original_filename})"
        else:
            rendered = title or original_filename
        if value.archived_at is not None:
            return f"{rendered} (архив)" if rendered else "(архив)"
        return rendered

    def _build_docx_from_text(self, rendered_text: str) -> bytes:
        body = "\n".join(self._paragraph_xml(line) for line in rendered_text.splitlines())
        if not body:
            body = self._paragraph_xml("")
        return self._build_docx_package(body)

    def _build_docx_package(self, body: str) -> bytes:
        document_xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body>{body}"
            '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
            '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" '
            'w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>'
            "</w:body></w:document>"
        )
        buffer = BytesIO()
        with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
            archive.writestr(
                "[Content_Types].xml",
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                '<Default Extension="rels" '
                'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                '<Default Extension="xml" ContentType="application/xml"/>'
                '<Override PartName="/word/document.xml" '
                'ContentType="application/vnd.openxmlformats-officedocument.'
                'wordprocessingml.document.main+xml"/>'
                "</Types>",
            )
            archive.writestr(
                "_rels/.rels",
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/'
                'relationships"><Relationship Id="rId1" '
                'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
                'officeDocument" Target="word/document.xml"/></Relationships>',
            )
            archive.writestr("word/document.xml", document_xml)
        return buffer.getvalue()

    def _linked_card_conversion_layout(
        self,
        layout_json: dict[str, object],
        *,
        card_template_id: UUID,
    ) -> dict[str, object]:
        page = deepcopy(layout_json.get("page"))
        if not isinstance(page, dict):
            page = {"format": "A4", "width_mm": 210, "height_mm": 297}
        margins = page.get("margin_mm")
        if not isinstance(margins, dict):
            margins = {"top": 12, "right": 12, "bottom": 12, "left": 12}
        width_mm = self._layout_item_float(page, "width_mm", default=210)
        height_mm = self._layout_item_float(page, "height_mm", default=297)
        left_mm = self._layout_item_float(margins, "left", default=12)
        right_mm = self._layout_item_float(margins, "right", default=12)
        top_mm = self._layout_item_float(margins, "top", default=12)
        bottom_mm = self._layout_item_float(margins, "bottom", default=12)
        linked_item: dict[str, object] = {
            "id": "linked-card-layout",
            "kind": "card_layout",
            "card_template_id": str(card_template_id),
            "page": 1,
            "x_mm": left_mm,
            "y_mm": top_mm,
            "width_mm": width_mm - left_mm - right_mm,
            "height_mm": height_mm - top_mm - bottom_mm,
        }
        converted = {
            key: deepcopy(value)
            for key, value in layout_json.items()
            if key not in {"items", "sections", "overlays"}
        }
        converted["version"] = CARD_PRINT_LAYOUT_VERSION
        converted["page"] = page
        converted["items"] = [
            linked_item,
            *self._print_only_card_layout_items(layout_json),
        ]
        return converted

    def _expand_linked_card_layouts_for_generation(
        self,
        layout_json: dict[str, object],
        context: _RenderContext,
    ) -> dict[str, object]:
        raw_items = layout_json.get("items")
        items = (
            [item for item in raw_items if isinstance(item, dict)]
            if isinstance(raw_items, list)
            else []
        )
        linked_items = [item for item in items if item.get("kind") == "card_layout"]
        if not linked_items:
            return layout_json

        render_items: list[dict[str, object]] = []
        for linked_item in linked_items:
            try:
                card_template_id = UUID(str(linked_item.get("card_template_id")))
            except (TypeError, ValueError) as exc:
                raise DocumentServiceError("Linked card template id is invalid.") from exc
            card_template = self.session.get(CardTemplate, card_template_id)
            if (
                card_template is None
                or card_template.archived_at is not None
                or not card_template.is_active
                or card_template.registry_id != context.card.registry_id
                or card_template.id != context.card.card_template_id
            ):
                raise DocumentServiceError("Linked card template was not found for this card.")
            field_schema = card_template.field_schema_json
            raw_form_layout = (
                field_schema.get("form_layout") if isinstance(field_schema, dict) else None
            )
            if not isinstance(raw_form_layout, dict):
                raise DocumentServiceError("Linked card template form layout was not found.")
            try:
                form_layout = CardTemplateFormLayoutRead.model_validate(raw_form_layout).model_dump(
                    mode="json"
                )
            except ValueError as exc:
                raise DocumentServiceError("Linked card template form layout is invalid.") from exc
            rect = {
                "x_mm": self._layout_item_float(linked_item, "x_mm", default=12),
                "y_mm": self._layout_item_float(linked_item, "y_mm", default=12),
                "width_mm": self._layout_item_float(linked_item, "width_mm", default=186),
                "height_mm": self._layout_item_float(linked_item, "height_mm", default=273),
            }
            page_number = self._layout_item_int(linked_item, "page", default=1)
            for item in expand_linked_card_layout(form_layout, rect):
                render_items.append({**item, "page": page_number})

        render_items.extend(self._print_only_card_layout_items(layout_json))
        render_layout = deepcopy(layout_json)
        render_layout.pop("sections", None)
        render_layout.pop("overlays", None)
        render_layout["items"] = render_items
        return render_layout

    def _print_only_card_layout_items(
        self,
        layout_json: dict[str, object],
    ) -> list[dict[str, object]]:
        print_only: list[dict[str, object]] = []
        seen_ids: set[str] = set()

        def append_item(raw_item: object) -> None:
            if not isinstance(raw_item, dict):
                return
            if raw_item.get("kind") in {"field", "block", "card_layout"}:
                return
            item_id = str(raw_item.get("id") or "")
            if item_id and item_id in seen_ids:
                return
            print_only.append(deepcopy(raw_item))
            if item_id:
                seen_ids.add(item_id)

        raw_items = layout_json.get("items")
        if isinstance(raw_items, list):
            for item in raw_items:
                append_item(item)
        raw_sections = layout_json.get("sections")
        if isinstance(raw_sections, list):
            for raw_section in raw_sections:
                if not isinstance(raw_section, dict):
                    continue
                for item in self._card_print_flatten_section_items(raw_section):
                    append_item(item)
        raw_overlays = layout_json.get("overlays")
        if isinstance(raw_overlays, list):
            for overlay in raw_overlays:
                append_item(overlay)
        return print_only

    def _build_docx_from_card_print_layout(
        self,
        layout_json: dict[str, object],
        context: _RenderContext,
    ) -> bytes:
        render_layout = self._expand_linked_card_layouts_for_generation(layout_json, context)
        body_parts: list[str] = []
        current_page = 1
        for section in self._card_print_sections(render_layout):
            page_number = self._layout_item_int(section, "page", default=1)
            if page_number != current_page:
                body_parts.append(self._paragraph_xml(""))
                body_parts.append(self._paragraph_xml(f"Страница {page_number}"))
                current_page = page_number
            title = str(section.get("title") or "").strip()
            if title:
                body_parts.append(self._paragraph_xml(title))
            body_parts.append(self._card_print_section_table_xml(section, context))
        if body_parts:
            return self._build_docx_package("".join(body_parts))
        lines: list[str] = []
        current_page = 1
        for item in self._card_print_items(render_layout):
            page_number = self._layout_item_int(item, "page", default=1)
            if page_number != current_page:
                lines.append("")
                lines.append(f"Страница {page_number}")
                current_page = page_number
            text = self._card_print_item_text(item, context)
            if text:
                lines.append(text)
        return self._build_docx_from_text("\n".join(lines))

    def _build_pdf_from_card_print_layout(
        self,
        layout_json: dict[str, object],
        context: _RenderContext,
    ) -> bytes:
        render_layout = self._expand_linked_card_layouts_for_generation(layout_json, context)
        buffer = BytesIO()
        page_width = float(A4[0])
        page_height = float(A4[1])
        margins = self._card_print_margins(render_layout)
        grid = render_layout.get("grid")
        if not isinstance(grid, dict):
            grid = {}
        row_height = float(grid.get("row_height_mm") or 8) * mm
        usable_width = page_width - margins["left"] - margins["right"]
        column_width = usable_width / 12
        font_name = self._pdf_font_name()
        pdf_canvas = canvas.Canvas(buffer, pagesize=A4)
        pdf_canvas.setTitle(context.card.display_name)

        items = self._card_print_items(render_layout)
        max_page = max(
            (self._layout_item_int(item, "page", default=1) for item in items),
            default=1,
        )
        for page_number in range(1, max_page + 1):
            if page_number > 1:
                pdf_canvas.showPage()
            pdf_canvas.setFont(font_name, 10)
            page_items = [
                item
                for item in items
                if self._layout_item_int(item, "page", default=1) == page_number
            ]
            for item in page_items:
                x, y_top, width, height = self._card_print_item_rect(
                    item,
                    page_height=page_height,
                    margins=margins,
                    column_width=column_width,
                    row_height=row_height,
                )
                kind = item.get("kind")
                styles = item.get("style")
                if not isinstance(styles, dict):
                    styles = {}
                font_size = float(styles.get("font_size") or (13 if kind == "heading" else 10))
                padding = float(styles.get("padding_mm") or 1.5) * mm
                text = self._card_print_item_text(item, context)
                border = str(styles.get("border") or ("none" if kind == "heading" else "thin"))
                background_color = str(styles.get("background_color") or "")
                border_color = str(styles.get("border_color") or "#728197")
                text_color = str(styles.get("text_color") or "#17324d")

                if kind in {"container", "panel", "rectangle"}:
                    self._pdf_apply_hex_color(pdf_canvas, background_color, stroke=False)
                    self._pdf_apply_hex_color(pdf_canvas, border_color, stroke=True)
                    pdf_canvas.rect(
                        x,
                        y_top - height,
                        width,
                        height,
                        stroke=0 if border == "none" else 1,
                        fill=1 if background_color else 0,
                    )
                    continue
                if kind in {"divider", "line"}:
                    self._pdf_apply_hex_color(pdf_canvas, border_color, stroke=True)
                    pdf_canvas.line(x, y_top - (height / 2), x + width, y_top - (height / 2))
                    continue
                if not text:
                    continue

                if background_color or border != "none":
                    self._pdf_apply_hex_color(pdf_canvas, background_color, stroke=False)
                    self._pdf_apply_hex_color(pdf_canvas, border_color, stroke=True)
                    pdf_canvas.rect(
                        x,
                        y_top - height,
                        width,
                        height,
                        stroke=0 if border == "none" else 1,
                        fill=1 if background_color else 0,
                    )

                pdf_canvas.setFont(font_name, font_size)
                self._pdf_apply_hex_color(pdf_canvas, text_color, stroke=False)
                y = y_top - padding - font_size
                max_width = max(12.0, width - (padding * 2))
                for line in self._wrap_pdf_line(text, max_width, font_name, font_size):
                    if y < y_top - height + padding:
                        break
                    self._pdf_draw_aligned_line(
                        pdf_canvas,
                        line,
                        x=x + padding,
                        y=y,
                        width=max_width,
                        align=str(
                            styles.get("align") or ("center" if kind == "heading" else "left")
                        ),
                    )
                    y -= font_size + 3

        pdf_canvas.save()
        return buffer.getvalue()

    def _card_print_sections(self, layout_json: dict[str, object]) -> list[dict[str, object]]:
        normalized_layout = validate_card_print_layout(layout_json).normalized_layout
        raw_sections = normalized_layout.get("sections")
        if not isinstance(raw_sections, list):
            return []
        sections = [section for section in raw_sections if isinstance(section, dict)]
        return sorted(
            sections,
            key=lambda section: (
                self._layout_item_int(section, "page", default=1),
                self._layout_item_float(section, "y_mm", default=0),
                self._layout_item_float(section, "x_mm", default=0),
                str(section.get("id") or ""),
            ),
        )

    def _card_print_section_table_xml(
        self,
        section: dict[str, object],
        context: _RenderContext,
    ) -> str:
        raw_items = section.get("items")
        if not isinstance(raw_items, list):
            return "<w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>"
        items = [item for item in raw_items if isinstance(item, dict)]
        if not items:
            return "<w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>"
        table_rows: list[str] = []
        row_numbers = sorted({self._layout_item_int(item, "row", default=1) for item in items})
        for row_number in row_numbers:
            row_items = sorted(
                [
                    item
                    for item in items
                    if self._layout_item_int(item, "row", default=1) == row_number
                ],
                key=lambda item: (
                    self._layout_item_int(item, "column", default=1),
                    str(item.get("id") or ""),
                ),
            )
            cells: list[str] = []
            current_column = 1
            for item in row_items:
                column = self._layout_item_int(item, "column", default=1)
                while current_column < column and current_column <= 12:
                    cells.append(self._docx_table_cell_xml("", 1))
                    current_column += 1
                span = min(
                    self._layout_item_int(item, "column_span", default=1),
                    max(1, 13 - current_column),
                )
                cells.append(
                    self._docx_table_cell_xml(self._card_print_item_text(item, context), span)
                )
                current_column += span
            while current_column <= 12:
                cells.append(self._docx_table_cell_xml("", 1))
                current_column += 1
            table_rows.append(f"<w:tr>{''.join(cells)}</w:tr>")
        return (
            "<w:tbl>"
            '<w:tblPr><w:tblW w:w="0" w:type="auto"/>'
            "<w:tblBorders>"
            '<w:top w:val="single" w:sz="4" w:space="0" w:color="B8C2D0"/>'
            '<w:left w:val="single" w:sz="4" w:space="0" w:color="B8C2D0"/>'
            '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="B8C2D0"/>'
            '<w:right w:val="single" w:sz="4" w:space="0" w:color="B8C2D0"/>'
            '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="D7DEE8"/>'
            '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="D7DEE8"/>'
            "</w:tblBorders></w:tblPr>"
            f"{self._docx_table_grid_xml(12)}"
            f"{''.join(table_rows)}</w:tbl>"
        )

    def _docx_table_grid_xml(self, columns: int) -> str:
        return (
            "<w:tblGrid>"
            + "".join('<w:gridCol w:w="900"/>' for _ in range(columns))
            + "</w:tblGrid>"
        )

    def _docx_table_cell_xml(self, text: str, grid_span: int) -> str:
        grid_span_xml = f'<w:gridSpan w:val="{grid_span}"/>' if grid_span > 1 else ""
        return (
            f'<w:tc><w:tcPr>{grid_span_xml}<w:vAlign w:val="top"/></w:tcPr>'
            f"{self._paragraph_xml(text)}</w:tc>"
        )

    def _card_print_items(self, layout_json: dict[str, object]) -> list[dict[str, object]]:
        normalized_layout = validate_card_print_layout(layout_json).normalized_layout
        section_items = [
            item
            for section in self._card_print_sections(layout_json)
            for item in self._card_print_flatten_section_items(section)
        ]
        overlay_items = []
        raw_overlays = normalized_layout.get("overlays")
        if isinstance(raw_overlays, list):
            overlay_items = [overlay for overlay in raw_overlays if isinstance(overlay, dict)]
        if section_items or overlay_items:
            items = [*overlay_items, *section_items]
            return sorted(
                items,
                key=lambda item: (
                    self._layout_item_int(item, "page", default=1),
                    self._layout_item_float(item, "y_mm", default=0),
                    self._layout_item_float(item, "x_mm", default=0),
                    str(item.get("id") or ""),
                ),
            )

        raw_items = normalized_layout.get("items")
        if not isinstance(raw_items, list):
            return []
        items = [item for item in raw_items if isinstance(item, dict)]
        return sorted(
            items,
            key=lambda item: (
                self._layout_item_int(item, "page", default=1),
                self._layout_item_int(item, "row", default=1),
                self._layout_item_int(item, "column", default=1),
                str(item.get("id") or ""),
            ),
        )

    def _card_print_flatten_section_items(
        self,
        section: dict[str, object],
    ) -> list[dict[str, object]]:
        raw_items = section.get("items")
        if not isinstance(raw_items, list):
            return []
        flattened: list[dict[str, object]] = []
        for raw_item in raw_items:
            if not isinstance(raw_item, dict):
                continue
            item = dict(raw_item)
            x_mm, y_mm, item_width_mm, item_height_mm = self._card_print_section_item_rect(
                section,
                item,
            )
            item.update(
                {
                    "page": self._layout_item_int(section, "page", default=1),
                    "x_mm": x_mm,
                    "y_mm": y_mm,
                    "width_mm": item_width_mm,
                    "height_mm": item_height_mm,
                }
            )
            flattened.append(item)
        return flattened

    def _card_print_section_item_rect(
        self,
        section: dict[str, object],
        item: dict[str, object],
    ) -> tuple[float, float, float, float]:
        section_x = self._layout_item_float(section, "x_mm", default=0)
        section_y = self._layout_item_float(section, "y_mm", default=0)
        section_width = self._layout_item_float(section, "width_mm", default=1)
        grid_columns = self._layout_item_int(section, "grid_columns", default=12)
        column_width = section_width / max(1, grid_columns)
        row_height = 8.0
        row = self._layout_item_int(item, "row", default=1)
        column = self._layout_item_int(item, "column", default=1)
        row_span = self._layout_item_int(item, "row_span", default=1)
        column_span = self._layout_item_int(item, "column_span", default=1)
        return (
            section_x + ((column - 1) * column_width),
            section_y + ((row - 1) * row_height),
            column_span * column_width,
            row_span * row_height,
        )

    def _card_print_item_text(
        self,
        item: dict[str, object],
        context: _RenderContext,
    ) -> str:
        kind = item.get("kind")
        if kind in _CARD_PRINT_DECORATIVE_KINDS:
            return ""
        if kind in {"static_text", "heading"}:
            return str(item.get("text") or "")
        if kind == "field":
            return self._card_print_field_text(item, context)
        if kind == "metadata":
            key = str(item.get("metadata_key") or "")
            if key == "card.display_name":
                return context.card.display_name
            if key == "card.id":
                return str(context.card.card_id)
            if key == "card.registry_id":
                return str(context.card.registry_id)
            if key == "card.organization_id":
                return str(context.card.organization_id)
            return ""
        if kind == "page_number":
            return f"Страница {self._layout_item_int(item, 'page', default=1)}"
        if kind == "print_date":
            return date.today().isoformat()
        if kind == "qr_code":
            return str(item.get("text") or context.card.card_id)
        if kind == "image":
            return str(item.get("alt") or "")
        return str(item.get("text") or "")

    def _card_print_field_text(
        self,
        item: dict[str, object],
        context: _RenderContext,
    ) -> str:
        raw_field_id = item.get("field_id")
        try:
            field_id = UUID(str(raw_field_id))
        except (TypeError, ValueError):
            return ""
        field_read = self._card_print_field_reads_by_id(context).get(field_id)
        value = self._format_render_value(field_read.value if field_read is not None else None)
        label = str(item.get("label") or "").strip()
        if not label:
            field = self.session.get(FormField, field_id)
            label = field.label if field is not None else ""
        if item.get("show_label") is False or not label:
            return value
        return f"{label}: {value}"

    def _card_print_field_reads_by_id(self, context: _RenderContext) -> dict[UUID, CardFieldRead]:
        return {field.field_id: field for field in context.card.fields.values()}

    def _card_print_margins(self, layout_json: dict[str, object]) -> dict[str, float]:
        page = layout_json.get("page")
        if not isinstance(page, dict):
            page = {}
        raw_margins = page.get("margin_mm")
        if not isinstance(raw_margins, dict):
            raw_margins = {}
        return {
            "top": float(raw_margins.get("top") or 12) * mm,
            "right": float(raw_margins.get("right") or 12) * mm,
            "bottom": float(raw_margins.get("bottom") or 12) * mm,
            "left": float(raw_margins.get("left") or 12) * mm,
        }

    def _card_print_item_rect(
        self,
        item: dict[str, object],
        *,
        page_height: float,
        margins: dict[str, float],
        column_width: float,
        row_height: float,
    ) -> tuple[float, float, float, float]:
        if all(key in item for key in ("x_mm", "y_mm", "width_mm", "height_mm")):
            x_mm = self._layout_item_float(item, "x_mm", default=0)
            y_mm = self._layout_item_float(item, "y_mm", default=0)
            width_mm = self._layout_item_float(item, "width_mm", default=10)
            height_mm = self._layout_item_float(item, "height_mm", default=8)
            return (x_mm * mm, page_height - (y_mm * mm), width_mm * mm, height_mm * mm)
        row = self._layout_item_int(item, "row", default=1)
        column = self._layout_item_int(item, "column", default=1)
        row_span = self._layout_item_int(item, "row_span", default=1)
        column_span = self._layout_item_int(item, "column_span", default=1)
        x = margins["left"] + ((column - 1) * column_width)
        y_top = page_height - margins["top"] - ((row - 1) * row_height)
        return (x, y_top, column_span * column_width, row_span * row_height)

    def _layout_item_float(
        self,
        item: dict[str, object],
        key: str,
        *,
        default: float,
    ) -> float:
        value = item.get(key)
        if isinstance(value, bool):
            return default
        try:
            return float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return default

    def _pdf_apply_hex_color(
        self, pdf_canvas: canvas.Canvas, raw_color: str, *, stroke: bool
    ) -> None:
        match = re.fullmatch(r"#?([0-9A-Fa-f]{6})", raw_color.strip())
        if not match:
            if stroke:
                pdf_canvas.setStrokeColorRGB(0.45, 0.5, 0.55)
            else:
                pdf_canvas.setFillColorRGB(0.09, 0.2, 0.3)
            return
        hex_color = match.group(1)
        red = int(hex_color[0:2], 16) / 255
        green = int(hex_color[2:4], 16) / 255
        blue = int(hex_color[4:6], 16) / 255
        if stroke:
            pdf_canvas.setStrokeColorRGB(red, green, blue)
        else:
            pdf_canvas.setFillColorRGB(red, green, blue)

    def _pdf_draw_aligned_line(
        self,
        pdf_canvas: canvas.Canvas,
        line: str,
        *,
        x: float,
        y: float,
        width: float,
        align: str,
    ) -> None:
        if align == "center":
            pdf_canvas.drawCentredString(x + (width / 2), y, line)
        elif align == "right":
            pdf_canvas.drawRightString(x + width, y, line)
        else:
            pdf_canvas.drawString(x, y, line)

    def _layout_item_int(
        self,
        item: dict[str, object],
        key: str,
        *,
        default: int,
    ) -> int:
        value = item.get(key)
        if isinstance(value, bool):
            return default
        if not isinstance(value, int | float | str):
            return default
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return default
        return parsed if parsed > 0 else default

    def _build_pdf_from_text(self, rendered_text: str) -> bytes:
        buffer = BytesIO()
        page_width = float(A4[0])
        page_height = float(A4[1])
        margin_x = float(20 * mm)
        margin_y = float(20 * mm)
        font_name = self._pdf_font_name()
        font_size = 11.0
        line_height = 15.0
        max_width = page_width - (margin_x * 2)
        y_position = page_height - margin_y

        pdf_canvas = canvas.Canvas(buffer, pagesize=A4)
        pdf_canvas.setTitle("Generated document")
        pdf_canvas.setFont(font_name, font_size)

        source_lines = rendered_text.splitlines() or [""]
        for source_line in source_lines:
            for line in self._wrap_pdf_line(source_line, max_width, font_name, font_size):
                if y_position < margin_y:
                    pdf_canvas.showPage()
                    pdf_canvas.setFont(font_name, font_size)
                    y_position = page_height - margin_y
                pdf_canvas.drawString(margin_x, y_position, line)
                y_position -= line_height

        pdf_canvas.save()
        return buffer.getvalue()

    def _pdf_font_name(self) -> str:
        with suppress(KeyError):
            pdfmetrics.getFont(_PDF_FONT_NAME)
            return _PDF_FONT_NAME
        for candidate in _PDF_FONT_CANDIDATES:
            if candidate.is_file():
                pdfmetrics.registerFont(TTFont(_PDF_FONT_NAME, str(candidate)))
                return _PDF_FONT_NAME
        return "Helvetica"

    def _wrap_pdf_line(
        self,
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
            chunks = self._split_pdf_word(word, max_width, font_name, font_size)
            wrapped.extend(chunks[:-1])
            current = chunks[-1] if chunks else ""

        if current or not wrapped:
            wrapped.append(current)
        return wrapped

    def _split_pdf_word(
        self,
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

    def _paragraph_xml(self, text: str) -> str:
        return f'<w:p><w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'

    def _get_active_template(self, template_id: UUID) -> DocumentTemplate:
        template = self.session.get(DocumentTemplate, template_id)
        if template is None or template.archived_at is not None or not template.is_active:
            raise DocumentServiceError("Document template was not found.")
        return template

    def _get_template(self, template_id: UUID) -> DocumentTemplate:
        template = self.session.get(DocumentTemplate, template_id)
        if template is None:
            raise DocumentServiceError("Document template was not found.")
        return template

    def _get_active_registry(self, registry_id: UUID) -> Registry:
        registry = self.session.get(Registry, registry_id)
        if (
            registry is None
            or registry.archived_at is not None
            or registry.lifecycle_status == "archived"
        ):
            raise DocumentServiceError("Registry was not found.")
        return registry

    def _get_generated_document(self, generated_document_id: UUID) -> GeneratedDocument:
        generated = self.session.get(GeneratedDocument, generated_document_id)
        if generated is None:
            raise DocumentServiceError("Generated document was not found.")
        return generated

    def _get_readable_card(self, card_id: UUID, *, include_archive: bool) -> Card:
        card = self.session.get(Card, card_id)
        if card is None:
            raise DocumentServiceError("Card was not found.")
        if card.lifecycle_status in {"archived", "superseded"} and not include_archive:
            raise DocumentServiceError("Card is only readable in archive scope.")
        if card.archived_at is not None and not include_archive:
            raise DocumentServiceError("Card is only readable in archive scope.")
        return card

    def _require_schema_permission(self, actor_user_id: UUID, registry_id: UUID) -> None:
        if not PermissionService(self.session).has_permission(
            actor_user_id,
            "registry.schema.manage",
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot manage document templates.")

    def _require_registry_read_permission(self, actor_user_id: UUID, registry_id: UUID) -> None:
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
        raise PermissionDeniedError("Actor cannot read document templates.")

    def _require_card_manage_permission(
        self,
        actor_user_id: UUID,
        organization_id: UUID,
        *,
        registry_id: UUID,
    ) -> None:
        if not PermissionService(self.session).has_permission(
            actor_user_id,
            "cards.manage",
            organization_id=organization_id,
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot generate documents in this card scope.")

    def _validate_card_print_layout_for_template(
        self,
        *,
        registry_id: UUID,
        card_template_id: UUID | None,
        layout_json: dict[str, object],
    ) -> dict[str, object]:
        allowed_field_ids = self._card_print_allowed_field_ids(
            registry_id=registry_id,
            card_template_id=card_template_id,
        )
        allowed_block_ids = self._card_print_allowed_block_ids(registry_id=registry_id)
        result = validate_card_print_layout(
            layout_json,
            allowed_field_ids=allowed_field_ids,
            allowed_block_ids=allowed_block_ids,
        )
        if result.errors:
            raise DocumentServiceError("; ".join(result.errors))
        return result.normalized_layout

    def _card_print_allowed_field_ids(
        self,
        *,
        registry_id: UUID,
        card_template_id: UUID | None,
    ) -> set[UUID]:
        if card_template_id is not None:
            card_template = self._validate_card_template_scope(registry_id, card_template_id)
            raw_field_ids = card_template.field_schema_json.get("field_ids", [])
            if not isinstance(raw_field_ids, list):
                raise DocumentServiceError("Card template field schema is invalid.")
            field_ids: set[UUID] = set()
            for raw_field_id in raw_field_ids:
                try:
                    field_ids.add(UUID(str(raw_field_id)))
                except (TypeError, ValueError) as exc:
                    raise DocumentServiceError("Card template field schema is invalid.") from exc
            return field_ids
        return set(
            self.session.scalars(
                select(FormField.id)
                .join(FormBlock, FormBlock.id == FormField.block_id)
                .where(
                    FormBlock.registry_id == registry_id,
                    FormBlock.archived_at.is_(None),
                    FormBlock.is_active.is_(True),
                    FormField.archived_at.is_(None),
                    FormField.is_active.is_(True),
                )
            ).all()
        )

    def _card_print_allowed_block_ids(self, *, registry_id: UUID) -> set[UUID]:
        return set(
            self.session.scalars(
                select(FormBlock.id).where(
                    FormBlock.registry_id == registry_id,
                    FormBlock.archived_at.is_(None),
                    FormBlock.is_active.is_(True),
                )
            ).all()
        )

    def _validate_card_template_scope(
        self,
        registry_id: UUID,
        card_template_id: UUID,
    ) -> CardTemplate:
        card_template = self.session.get(CardTemplate, card_template_id)
        if (
            card_template is None
            or card_template.registry_id != registry_id
            or card_template.archived_at is not None
            or not card_template.is_active
        ):
            raise DocumentServiceError("Card template was not found in this registry.")
        return card_template

    def _validate_template_format(self, template_format: str) -> None:
        if template_format not in DOCUMENT_TEMPLATE_FORMATS:
            raise DocumentServiceError(f"Unsupported document template format: {template_format}")

    def _document_title(self, title: str | None, template_name: str) -> str:
        if title is not None and title.strip():
            return title.strip()
        return template_name

    def _pdf_output_filename(self, rendered_output_filename: str) -> str:
        clean_filename = normalize_attachment_filename(rendered_output_filename)
        lower_filename = clean_filename.lower()
        if lower_filename.endswith(".docx"):
            base_name = clean_filename[:-5]
        elif lower_filename.endswith(".pdf"):
            base_name = clean_filename[:-4]
        else:
            base_name = clean_filename
        if not base_name.strip("._ "):
            base_name = "document"
        return normalize_attachment_filename(f"{base_name}.pdf")

    def _clean_required_text(self, value: str, label: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise DocumentServiceError(f"Document template {label} must not be empty.")
        return cleaned
