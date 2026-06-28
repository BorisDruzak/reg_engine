import json
import re
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO
from uuid import UUID
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from sqlalchemy.orm import Session

from app.domain.constants import DOCUMENT_TEMPLATE_FORMATS
from app.models import Card, DocumentTemplate, GeneratedDocument, StoredFile
from app.services.attachments import AttachmentStorage, normalize_attachment_filename
from app.services.audit import AuditService
from app.services.cards import CardFieldRead, CardRead, CardService, CardServiceError
from app.services.permissions import PermissionDeniedError, PermissionService


class DocumentServiceError(ValueError):
    """Raised when document template or generation state is invalid."""


@dataclass(frozen=True)
class _RenderContext:
    card: CardRead


_PLACEHOLDER_PATTERN = re.compile(r"{{\s*([A-Za-z0-9_.]+)\s*}}")


class DocumentService:
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
        template_body: str,
        description: str | None = None,
        template_format: str = "docx_text_v1",
        output_filename_template: str = "{{ card.display_name }}.docx",
        output_content_type: str = (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ),
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
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="document_template_create",
            object_type="document_template",
            object_id=template.id,
            new_data_json={
                "registry_id": str(registry_id),
                "code": template.code,
                "template_format": template.template_format,
            },
        )
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

        render_context = _RenderContext(card=card_read)
        output_filename = normalize_attachment_filename(
            self._render_plain_text_template(
                template.output_filename_template,
                render_context,
            )
        )
        rendered_text = self._render_plain_text_template(template.template_body, render_context)
        content = self._build_docx_from_text(rendered_text)
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
        return self.storage.read_bytes(stored_file.storage_key)

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

    def _render_plain_text_template(self, template_body: str, context: _RenderContext) -> str:
        def replace(match: re.Match[str]) -> str:
            return self._format_render_value(self._resolve_placeholder(match.group(1), context))

        return _PLACEHOLDER_PATTERN.sub(replace, template_body)

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

    def _build_docx_from_text(self, rendered_text: str) -> bytes:
        body = "\n".join(self._paragraph_xml(line) for line in rendered_text.splitlines())
        if not body:
            body = self._paragraph_xml("")
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

    def _paragraph_xml(self, text: str) -> str:
        return f'<w:p><w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'

    def _get_active_template(self, template_id: UUID) -> DocumentTemplate:
        template = self.session.get(DocumentTemplate, template_id)
        if template is None or template.archived_at is not None or not template.is_active:
            raise DocumentServiceError("Document template was not found.")
        return template

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

    def _validate_template_format(self, template_format: str) -> None:
        if template_format not in DOCUMENT_TEMPLATE_FORMATS:
            raise DocumentServiceError(f"Unsupported document template format: {template_format}")

    def _document_title(self, title: str | None, template_name: str) -> str:
        if title is not None and title.strip():
            return title.strip()
        return template_name

    def _clean_required_text(self, value: str, label: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise DocumentServiceError(f"Document template {label} must not be empty.")
        return cleaned
