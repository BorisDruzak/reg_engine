import json
import re
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO
from uuid import UUID
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.constants import DOCUMENT_TEMPLATE_FORMATS
from app.models import (
    Card,
    DocumentTemplate,
    DocumentTemplateVersion,
    GeneratedDocument,
    Registry,
    StoredFile,
)
from app.services.attachments import (
    AttachmentStorage,
    StoredObjectInfo,
    normalize_attachment_filename,
)
from app.services.audit import AuditService
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


_PLACEHOLDER_PATTERN = re.compile(r"{{\s*([A-Za-z0-9_.]+)\s*}}")


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
                output_content_type=(
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                ),
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
