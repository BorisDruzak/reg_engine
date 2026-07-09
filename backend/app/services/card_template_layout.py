import hashlib
import json
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    CardTemplate,
    DocumentTemplate,
    DocumentTemplateVersion,
    FormBlock,
    FormField,
    GeneratedDocument,
)
from app.schemas.card_template_layouts import (
    CardTemplateExportSettingsRead,
    CardTemplateFormLayoutRead,
    CardTemplateLayoutRead,
    CardTemplateLayoutSyncStatusRead,
    CardTemplatePrintViewRead,
    CardTemplatePrintViewUpdate,
    CardTemplateStructureRead,
)
from app.schemas.registries import FormBlockRead, FormFieldRead
from app.services.audit import AuditService
from app.services.card_print import CARD_PRINT_LAYOUT_VERSION
from app.services.card_template_projection import (
    DEFAULT_A4_PAGE,
    build_mapping_table,
    default_form_layout_for_blocks,
    sync_print_view,
    virtual_default_print_view,
)
from app.services.documents import DocumentService, DocumentServiceError
from app.services.permissions import PermissionDeniedError, PermissionService
from app.services.registry_schema import RegistrySchemaError

CARD_TEMPLATE_LAYOUT_VERSION = "card_template_layout_v1"
DEFAULT_OUTPUT_FILENAME = "{{ card.display_name }}.docx"
QUARTER_COLUMN_SPANS = {3, 6, 9, 12}


class CardTemplateLayoutError(ValueError):
    """Raised when card template layout operations reference invalid state."""


class CardTemplateLayoutConflictError(CardTemplateLayoutError):
    """Raised when an update is based on a stale layout revision."""


def form_layout_revision(form_layout: dict[str, Any]) -> str:
    canonical = json.dumps(form_layout, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _grid_rect(item: dict[str, Any]) -> tuple[int, int, int, int]:
    left = int(item["column"])
    top = int(item["row"])
    return (
        left,
        top,
        left + int(item["column_span"]),
        top + int(item["row_span"]),
    )


def _grid_rects_overlap(
    left: tuple[int, int, int, int],
    right: tuple[int, int, int, int],
) -> bool:
    return not (
        left[2] <= right[0] or right[2] <= left[0] or left[3] <= right[1] or right[3] <= left[1]
    )


def reject_overlaps(form_layout: dict[str, Any]) -> None:
    sections = form_layout["sections"]
    for index, section in enumerate(sections):
        if any(
            _grid_rects_overlap(_grid_rect(section), _grid_rect(other))
            for other in sections[index + 1 :]
        ):
            raise CardTemplateLayoutError("Card blocks cannot overlap.")
        items = section["items"]
        for item_index, item in enumerate(items):
            if any(
                _grid_rects_overlap(_grid_rect(item), _grid_rect(other))
                for other in items[item_index + 1 :]
            ):
                raise CardTemplateLayoutError("Fields inside a block cannot overlap.")


def validate_form_layout_geometry(form_layout: dict[str, Any]) -> dict[str, Any]:
    try:
        normalized = CardTemplateFormLayoutRead.model_validate(form_layout).model_dump(mode="json")
    except ValidationError as exc:
        raise CardTemplateLayoutError("Card layout geometry is invalid.") from exc
    if normalized["columns"] != 12:
        raise CardTemplateLayoutError("Card layout must use exactly 12 columns.")
    for section in normalized["sections"]:
        if section["column_span"] not in QUARTER_COLUMN_SPANS:
            raise CardTemplateLayoutError("Block width must use a quarter-grid span.")
        if section["column"] + section["column_span"] - 1 > 12:
            raise CardTemplateLayoutError("Block exceeds the card width.")
        if section["row"] + section["row_span"] - 1 > 4:
            raise CardTemplateLayoutError("Block exceeds the card height.")
        for item in section["items"]:
            if item["column_span"] not in QUARTER_COLUMN_SPANS:
                raise CardTemplateLayoutError("Field width must use a quarter-grid span.")
            if item["column"] + item["column_span"] - 1 > 12:
                raise CardTemplateLayoutError("Field exceeds its block width.")
            if item["row"] + item["row_span"] - 1 > 4:
                raise CardTemplateLayoutError("Field exceeds its block height.")
    reject_overlaps(normalized)
    return normalized


class CardTemplateLayoutService:
    def __init__(
        self,
        session: Session,
        *,
        document_service: DocumentService | None = None,
    ) -> None:
        self.session = session
        self.document_service = document_service

    def read_layout_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_template_id: UUID,
    ) -> CardTemplateLayoutRead:
        template = self._get_active_card_template(card_template_id)
        self._require_registry_read_permission(actor_user_id, template.registry_id)
        blocks, fields = self._template_structure(template)
        form_layout = self._form_layout(template, blocks, fields)
        print_views = self._print_views_for_template(template, form_layout)
        sync_status = self._layout_sync_status(form_layout, print_views, fields)
        return CardTemplateLayoutRead(
            revision=form_layout_revision(form_layout),
            card_template_id=template.id,
            registry_id=template.registry_id,
            structure=CardTemplateStructureRead(
                blocks=[FormBlockRead.model_validate(block) for block in blocks],
                fields=[FormFieldRead.model_validate(field) for field in fields],
            ),
            form_layout=CardTemplateFormLayoutRead.model_validate(form_layout),
            print_views=print_views,
            export_settings=CardTemplateExportSettingsRead(
                default_print_view_id=print_views[0].id if print_views else None,
                output_filename_template=(
                    print_views[0].output_filename_template
                    if print_views
                    else DEFAULT_OUTPUT_FILENAME
                ),
            ),
            sync_status=CardTemplateLayoutSyncStatusRead.model_validate(sync_status),
        )

    def update_form_layout_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_template_id: UUID,
        expected_revision: str,
        form_layout: dict[str, Any],
    ) -> CardTemplateLayoutRead:
        template = self._get_active_card_template(card_template_id, lock_for_update=True)
        self._require_schema_permission(actor_user_id, template.registry_id)
        blocks, fields = self._template_structure(template)
        current = self._form_layout(template, blocks, fields)
        if expected_revision != form_layout_revision(current):
            raise CardTemplateLayoutConflictError("Card layout changed. Reload before saving.")
        normalized = validate_form_layout_geometry(form_layout)
        old_schema = dict(template.field_schema_json or {})
        template.field_schema_json = {**old_schema, "form_layout": normalized}
        template.updated_by = actor_user_id
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="card_template_layout",
            object_id=template.id,
            old_data_json={"form_layout": old_schema.get("form_layout")},
            new_data_json={"form_layout": normalized},
        )
        return self.read_layout_for_actor(
            actor_user_id=actor_user_id,
            card_template_id=template.id,
        )

    def create_print_view_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_template_id: UUID,
        payload: CardTemplatePrintViewUpdate,
    ) -> CardTemplatePrintViewRead:
        template = self._get_active_card_template(card_template_id)
        self._require_schema_permission(actor_user_id, template.registry_id)
        document_service = self._document_service()
        document_template = document_service.create_card_print_template_for_actor(
            actor_user_id=actor_user_id,
            registry_id=template.registry_id,
            card_template_id=template.id,
            code=self._next_print_view_code(template),
            name=payload.name or "Основная A4",
            layout_json=payload.layout_json,
            output_filename_template=payload.output_filename_template,
        )
        return self._print_view_from_template(document_template, is_default=payload.is_default)

    def update_print_view_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_template_id: UUID,
        print_view_id: str,
        payload: CardTemplatePrintViewUpdate,
    ) -> CardTemplatePrintViewRead:
        template = self._get_active_card_template(card_template_id)
        self._require_schema_permission(actor_user_id, template.registry_id)
        document_template = self._get_print_view_template(
            template,
            print_view_id,
            include_archive=False,
        )
        if payload.name is not None:
            document_template.name = payload.name
        document_template.output_filename_template = payload.output_filename_template
        document_template.updated_by = actor_user_id
        version = self._document_service().create_card_print_template_version_for_actor(
            actor_user_id=actor_user_id,
            template_id=document_template.id,
            layout_json=payload.layout_json,
        )
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="card_template_print_view",
            object_id=document_template.id,
            new_data_json={"version_id": str(version.id), "card_template_id": str(template.id)},
        )
        return self._print_view_from_template(document_template, is_default=payload.is_default)

    def sync_print_view_from_form_layout(
        self,
        *,
        actor_user_id: UUID,
        card_template_id: UUID,
        print_view_id: str,
    ) -> CardTemplatePrintViewRead:
        template = self._get_active_card_template(card_template_id)
        self._require_schema_permission(actor_user_id, template.registry_id)
        blocks, fields = self._template_structure(template)
        form_layout = self._form_layout(template, blocks, fields)
        document_template = self._get_print_view_template(
            template,
            print_view_id,
            include_archive=False,
        )
        current_layout = self._current_layout_json(document_template)
        current_view = self._raw_print_view(document_template, current_layout, is_default=True)
        result = sync_print_view(
            current_view,
            form_layout,
            current_view.get("page") if isinstance(current_view.get("page"), dict) else None,
            archived_field_ids={
                field.id for field in fields if not field.is_active or field.archived_at is not None
            },
        )
        next_layout = {**current_layout, "items": result.print_view["items"]}
        version = self._document_service().create_card_print_template_version_for_actor(
            actor_user_id=actor_user_id,
            template_id=document_template.id,
            layout_json=next_layout,
        )
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="sync",
            object_type="card_template_print_view",
            object_id=document_template.id,
            new_data_json={"version_id": str(version.id), "card_template_id": str(template.id)},
        )
        return self._print_view_from_template(document_template, is_default=True)

    def generate_docx_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        card_template_id: UUID,
        print_view_id: str | None = None,
        title: str | None = None,
    ) -> GeneratedDocument:
        document_template = self._ensure_generation_print_view(
            actor_user_id=actor_user_id,
            card_template_id=card_template_id,
            print_view_id=print_view_id,
        )
        return self._document_service().generate_document_for_actor(
            actor_user_id=actor_user_id,
            template_id=document_template.id,
            card_id=card_id,
            title=title,
        )

    def generate_pdf_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        card_template_id: UUID,
        print_view_id: str | None = None,
        title: str | None = None,
    ) -> GeneratedDocument:
        document_template = self._ensure_generation_print_view(
            actor_user_id=actor_user_id,
            card_template_id=card_template_id,
            print_view_id=print_view_id,
        )
        return self._document_service().generate_pdf_for_actor(
            actor_user_id=actor_user_id,
            template_id=document_template.id,
            card_id=card_id,
            title=title,
        )

    def _ensure_generation_print_view(
        self,
        *,
        actor_user_id: UUID,
        card_template_id: UUID,
        print_view_id: str | None,
    ) -> DocumentTemplate:
        template = self._get_active_card_template(card_template_id)
        if print_view_id:
            return self._get_print_view_template(template, print_view_id, include_archive=False)
        existing = self._print_view_templates(template)
        if existing:
            return existing[0]
        blocks, fields = self._template_structure(template)
        form_layout = self._form_layout(template, blocks, fields)
        virtual_view = virtual_default_print_view(form_layout)
        layout_json = self._layout_json_from_print_view(virtual_view)
        return self._document_service().create_card_print_template_for_actor(
            actor_user_id=actor_user_id,
            registry_id=template.registry_id,
            card_template_id=template.id,
            code=self._next_print_view_code(template),
            name="Основная A4",
            layout_json=layout_json,
            output_filename_template=DEFAULT_OUTPUT_FILENAME,
        )

    def _template_structure(
        self,
        template: CardTemplate,
    ) -> tuple[list[FormBlock], list[FormField]]:
        field_ids = self._template_field_ids(template)
        block_statement = (
            select(FormBlock)
            .where(FormBlock.registry_id == template.registry_id)
            .order_by(FormBlock.position, FormBlock.title, FormBlock.id)
        )
        blocks = list(self.session.scalars(block_statement).all())
        field_statement = (
            select(FormField)
            .join(FormBlock, FormBlock.id == FormField.block_id)
            .where(FormBlock.registry_id == template.registry_id)
            .order_by(FormBlock.position, FormField.position, FormField.label, FormField.id)
        )
        if field_ids:
            field_statement = field_statement.where(FormField.id.in_(field_ids))
        fields = list(self.session.scalars(field_statement).all())
        block_ids_with_fields = {field.block_id for field in fields}
        blocks = [block for block in blocks if block.id in block_ids_with_fields]
        return blocks, fields

    def _form_layout(
        self,
        template: CardTemplate,
        blocks: list[FormBlock],
        fields: list[FormField],
    ) -> dict[str, Any]:
        raw_layout = (template.field_schema_json or {}).get("form_layout")
        if isinstance(raw_layout, dict):
            return CardTemplateFormLayoutRead.model_validate(raw_layout).model_dump(mode="json")
        return default_form_layout_for_blocks(
            [FormBlockRead.model_validate(block).model_dump(mode="json") for block in blocks],
            [FormFieldRead.model_validate(field).model_dump(mode="json") for field in fields],
        )

    def _print_views_for_template(
        self,
        template: CardTemplate,
        form_layout: dict[str, Any],
    ) -> list[CardTemplatePrintViewRead]:
        templates = self._print_view_templates(template)
        if not templates:
            return [
                CardTemplatePrintViewRead.model_validate(
                    {
                        **virtual_default_print_view(form_layout),
                        "output_filename_template": DEFAULT_OUTPUT_FILENAME,
                        "layout_json": self._layout_json_from_print_view(
                            virtual_default_print_view(form_layout)
                        ),
                    }
                )
            ]
        return [
            self._print_view_from_template(document_template, is_default=index == 0)
            for index, document_template in enumerate(templates)
        ]

    def _print_view_from_template(
        self,
        document_template: DocumentTemplate,
        *,
        is_default: bool,
    ) -> CardTemplatePrintViewRead:
        layout_json = self._current_layout_json(document_template)
        return CardTemplatePrintViewRead.model_validate(
            self._raw_print_view(document_template, layout_json, is_default=is_default)
        )

    def _raw_print_view(
        self,
        document_template: DocumentTemplate,
        layout_json: dict[str, Any],
        *,
        is_default: bool,
    ) -> dict[str, Any]:
        current_version = self._current_version(document_template.id)
        page = (
            layout_json.get("page")
            if isinstance(layout_json.get("page"), dict)
            else DEFAULT_A4_PAGE
        )
        return {
            "id": str(document_template.id),
            "name": document_template.name,
            "is_default": is_default,
            "document_template_id": document_template.id,
            "current_version_id": current_version.id if current_version is not None else None,
            "source": "form_layout",
            "page": page,
            "items": self._print_items(layout_json),
            "layout_json": layout_json,
            "output_filename_template": document_template.output_filename_template,
        }

    def _print_items(self, layout_json: dict[str, Any]) -> list[dict[str, Any]]:
        items = layout_json.get("items")
        if isinstance(items, list):
            return [dict(item) for item in items if isinstance(item, dict)]
        flattened: list[dict[str, Any]] = []
        sections = layout_json.get("sections")
        if isinstance(sections, list):
            for section in sections:
                if not isinstance(section, dict):
                    continue
                section_items = section.get("items")
                if isinstance(section_items, list):
                    flattened.extend(dict(item) for item in section_items if isinstance(item, dict))
        return flattened

    def _layout_sync_status(
        self,
        form_layout: dict[str, Any],
        print_views: list[CardTemplatePrintViewRead],
        fields: list[FormField],
    ) -> dict[str, Any]:
        archived_field_ids = {
            field.id for field in fields if not field.is_active or field.archived_at is not None
        }
        errors: list[str] = []
        warnings: list[str] = []
        mapping: dict[str, list[str]] = {
            "missing_print_items": [],
            "missing_source_items": [],
            "manual_items": [],
            "overridden_items": [],
            "archived_field_items": [],
        }
        if any(
            int(section["row"]) + int(section.get("row_span", 1)) - 1 > 4
            or any(
                int(item["row"]) + int(item.get("row_span", 1)) - 1 > 4 for item in section["items"]
            )
            for section in form_layout["sections"]
        ):
            warnings.append(
                "Сохранённый макет выходит за пределы 4 строк; преобразуйте его перед сохранением."
            )
        for print_view in print_views:
            view_mapping = build_mapping_table(
                form_layout,
                print_view.model_dump(mode="json"),
                archived_field_ids=archived_field_ids,
            )
            for key, values in view_mapping.items():
                mapping.setdefault(key, [])
                mapping[key].extend(str(value) for value in values)
            if view_mapping["missing_print_items"]:
                warnings.append("Есть поля формы, не размещённые на A4.")
            if view_mapping["missing_source_items"]:
                warnings.append("Есть элементы A4 без исходного элемента формы.")
            if view_mapping["overridden_items"]:
                warnings.append("Есть элементы A4 с ручным положением.")
            if view_mapping["archived_field_items"]:
                errors.append("Есть элементы A4, связанные с архивированными полями.")
        return {
            "has_errors": bool(errors),
            "errors": errors,
            "warnings": warnings,
            "mapping": mapping,
        }

    def _layout_json_from_print_view(self, print_view: dict[str, Any]) -> dict[str, Any]:
        return {
            "version": CARD_PRINT_LAYOUT_VERSION,
            "page": print_view.get("page") or DEFAULT_A4_PAGE,
            "grid": {"columns": 12, "row_height_mm": 8, "snap_mm": 2},
            "items": print_view.get("items") or [],
        }

    def _print_view_templates(self, template: CardTemplate) -> list[DocumentTemplate]:
        return list(
            self.session.scalars(
                select(DocumentTemplate)
                .where(
                    DocumentTemplate.registry_id == template.registry_id,
                    DocumentTemplate.card_template_id == template.id,
                    DocumentTemplate.template_format == CARD_PRINT_LAYOUT_VERSION,
                    DocumentTemplate.archived_at.is_(None),
                    DocumentTemplate.is_active.is_(True),
                )
                .order_by(DocumentTemplate.created_at, DocumentTemplate.name, DocumentTemplate.id)
            ).all()
        )

    def _get_print_view_template(
        self,
        template: CardTemplate,
        print_view_id: str,
        *,
        include_archive: bool,
    ) -> DocumentTemplate:
        try:
            document_template_id = UUID(str(print_view_id))
        except ValueError as exc:
            raise CardTemplateLayoutError("Print view was not found.") from exc
        document_template = self.session.get(DocumentTemplate, document_template_id)
        if (
            document_template is None
            or document_template.registry_id != template.registry_id
            or document_template.card_template_id != template.id
            or document_template.template_format != CARD_PRINT_LAYOUT_VERSION
            or (not include_archive and document_template.archived_at is not None)
        ):
            raise CardTemplateLayoutError("Print view was not found.")
        return document_template

    def _current_layout_json(self, document_template: DocumentTemplate) -> dict[str, Any]:
        version = self._current_version(document_template.id)
        if version is None or not isinstance(version.layout_json, dict):
            return {
                "version": CARD_PRINT_LAYOUT_VERSION,
                "page": DEFAULT_A4_PAGE,
                "grid": {"columns": 12, "row_height_mm": 8, "snap_mm": 2},
                "items": [],
            }
        return dict(version.layout_json)

    def _current_version(self, document_template_id: UUID) -> DocumentTemplateVersion | None:
        return self.session.scalar(
            select(DocumentTemplateVersion)
            .where(
                DocumentTemplateVersion.template_id == document_template_id,
                DocumentTemplateVersion.archived_at.is_(None),
            )
            .order_by(DocumentTemplateVersion.version_number.desc())
            .limit(1)
        )

    def _template_field_ids(self, template: CardTemplate) -> set[UUID]:
        raw_field_ids = (template.field_schema_json or {}).get("field_ids", [])
        field_ids: set[UUID] = set()
        if not isinstance(raw_field_ids, list):
            return field_ids
        for raw_field_id in raw_field_ids:
            try:
                field_ids.add(UUID(str(raw_field_id)))
            except (TypeError, ValueError):
                continue
        return field_ids

    def _next_print_view_code(self, template: CardTemplate) -> str:
        prefix = f"{template.code}_a4"
        existing_codes = {
            code
            for code in self.session.scalars(
                select(DocumentTemplate.code).where(
                    DocumentTemplate.registry_id == template.registry_id
                )
            ).all()
        }
        if prefix not in existing_codes:
            return prefix
        suffix = 2
        while f"{prefix}_{suffix}" in existing_codes:
            suffix += 1
        return f"{prefix}_{suffix}"

    def _get_active_card_template(
        self,
        card_template_id: UUID,
        *,
        lock_for_update: bool = False,
    ) -> CardTemplate:
        if lock_for_update:
            statement = (
                select(CardTemplate)
                .where(CardTemplate.id == card_template_id)
                .execution_options(populate_existing=True)
                .with_for_update()
            )
            template = self.session.scalars(statement).one_or_none()
        else:
            template = self.session.get(CardTemplate, card_template_id)
        if template is None or template.archived_at is not None or not template.is_active:
            raise RegistrySchemaError("Card template was not found.")
        return template

    def _require_schema_permission(self, actor_user_id: UUID, registry_id: UUID) -> None:
        if not PermissionService(self.session).has_permission(
            actor_user_id,
            "registry.schema.manage",
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot manage registry schema.")

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
        raise PermissionDeniedError("Actor cannot read registry.")

    def _document_service(self) -> DocumentService:
        if self.document_service is None:
            raise DocumentServiceError("Document service is required for this layout operation.")
        return self.document_service
