from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.constants import FIELD_TYPES, REQUIRED_MODES
from app.models import (
    Card,
    CardTemplate,
    FormBlock,
    FormField,
    Organization,
    OrganizationClosure,
    Registry,
)
from app.models.registry_schema import DEFAULT_CARD_TITLE_LABEL
from app.services.audit import AuditService
from app.services.permissions import PermissionDeniedError, PermissionService

DEFAULT_CARD_REGISTRY_NAME = "Реестр карточек"


class RegistrySchemaError(ValueError):
    """Raised when registry schema operations reference invalid schema state."""


class RegistrySchemaService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_registries_for_actor(
        self,
        *,
        actor_user_id: UUID,
        include_archive: bool = False,
    ) -> list[Registry]:
        criteria = []
        if not include_archive:
            criteria = [
                Registry.archived_at.is_(None),
                Registry.lifecycle_status != "archived",
            ]
        statement = select(Registry).where(*criteria).order_by(Registry.code, Registry.id)
        registries = list(self.session.scalars(statement).all())
        permissions = PermissionService(self.session)
        if permissions.is_superuser(actor_user_id):
            return registries

        return [
            registry
            for registry in registries
            if permissions.has_permission(
                actor_user_id,
                "registry.schema.manage",
                registry_id=registry.id,
            )
            or permissions.has_permission(
                actor_user_id,
                "cards.manage",
                registry_id=registry.id,
            )
        ]

    def create_registry_for_actor(
        self,
        *,
        actor_user_id: UUID,
        code: str,
        name: str,
        description: str | None = None,
        card_title_label: str = DEFAULT_CARD_TITLE_LABEL,
    ) -> Registry:
        if not PermissionService(self.session).is_superuser(actor_user_id):
            raise PermissionDeniedError("Only a system admin can create registries.")

        cleaned_card_title_label = self._clean_card_title_label(card_title_label)
        registry = Registry(
            code=code,
            name=name,
            description=description,
            card_title_label=cleaned_card_title_label,
            created_by=actor_user_id,
        )
        self.session.add(registry)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="registry",
            object_id=registry.id,
            new_data_json={
                "code": code,
                "name": name,
                "card_title_label": cleaned_card_title_label,
            },
        )
        return registry

    def ensure_default_registry_for_root_organization(
        self,
        *,
        root_organization_id: UUID,
        root_organization_code: str,
        actor_user_id: UUID | None = None,
    ) -> Registry:
        existing = self.session.scalar(
            select(Registry).where(
                Registry.owner_organization_id == root_organization_id,
                Registry.is_default_for_owner_tree.is_(True),
                Registry.archived_at.is_(None),
                Registry.lifecycle_status != "archived",
            )
        )
        if existing is not None:
            return existing

        registry = Registry(
            code=self._default_registry_code(root_organization_code, root_organization_id),
            name=DEFAULT_CARD_REGISTRY_NAME,
            owner_organization_id=root_organization_id,
            is_default_for_owner_tree=True,
            created_by=actor_user_id,
        )
        self.session.add(registry)
        self.session.flush()
        if actor_user_id is not None:
            AuditService(self.session).record_user_event(
                actor_user_id=actor_user_id,
                action="create",
                object_type="registry",
                object_id=registry.id,
                new_data_json={
                    "code": registry.code,
                    "name": registry.name,
                    "owner_organization_id": str(root_organization_id),
                    "is_default_for_owner_tree": True,
                },
            )
        return registry

    def ensure_single_root_default_registry(
        self,
        *,
        actor_user_id: UUID | None = None,
    ) -> Registry:
        roots = list(
            self.session.scalars(
                select(Organization)
                .where(
                    Organization.parent_id.is_(None),
                    Organization.archived_at.is_(None),
                    Organization.is_active.is_(True),
                )
                .order_by(Organization.code, Organization.id)
            ).all()
        )
        if len(roots) != 1:
            raise RegistrySchemaError(
                "Default registry repair requires exactly one active root organization."
            )
        root = roots[0]

        active_defaults = list(
            self.session.scalars(
                select(Registry)
                .where(
                    Registry.is_default_for_owner_tree.is_(True),
                    Registry.archived_at.is_(None),
                    Registry.lifecycle_status != "archived",
                )
                .order_by(Registry.code, Registry.id)
            ).all()
        )
        if len(active_defaults) == 1 and active_defaults[0].owner_organization_id == root.id:
            return active_defaults[0]
        if active_defaults:
            raise RegistrySchemaError(
                "Active default registry must be unique and owned by the single active root "
                "organization."
            )

        active_registries = list(
            self.session.scalars(
                select(Registry)
                .where(
                    Registry.archived_at.is_(None),
                    Registry.lifecycle_status != "archived",
                )
                .order_by(Registry.code, Registry.id)
            ).all()
        )
        if not active_registries:
            return self.ensure_default_registry_for_root_organization(
                root_organization_id=root.id,
                root_organization_code=root.code,
                actor_user_id=actor_user_id,
            )
        if len(active_registries) > 1:
            raise RegistrySchemaError(
                "Cannot infer the default card registry because multiple active registries exist."
            )

        registry = active_registries[0]
        old_data = {
            "owner_organization_id": (
                str(registry.owner_organization_id)
                if registry.owner_organization_id is not None
                else None
            ),
            "is_default_for_owner_tree": registry.is_default_for_owner_tree,
        }
        registry.owner_organization_id = root.id
        registry.is_default_for_owner_tree = True
        self.session.flush()
        if actor_user_id is not None:
            AuditService(self.session).record_user_event(
                actor_user_id=actor_user_id,
                action="update",
                object_type="registry",
                object_id=registry.id,
                old_data_json=old_data,
                new_data_json={
                    "owner_organization_id": str(root.id),
                    "is_default_for_owner_tree": True,
                },
            )
        return registry

    def resolve_default_registry_for_organization(self, organization_id: UUID) -> Registry:
        registry = self.session.scalar(
            select(Registry)
            .join(
                OrganizationClosure,
                OrganizationClosure.ancestor_id == Registry.owner_organization_id,
            )
            .where(
                OrganizationClosure.descendant_id == organization_id,
                Registry.is_default_for_owner_tree.is_(True),
                Registry.owner_organization_id.is_not(None),
                Registry.archived_at.is_(None),
                Registry.lifecycle_status != "archived",
            )
            .order_by(OrganizationClosure.depth.asc(), Registry.code, Registry.id)
            .limit(1)
        )
        if registry is None:
            raise RegistrySchemaError(
                "Default card registry is not configured for this organization."
            )
        return registry

    def read_registry_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        include_archive: bool = False,
    ) -> Registry:
        registry = self._get_registry(registry_id, include_archive=include_archive)
        self._require_registry_read_permission(actor_user_id, registry.id)
        return registry

    def update_registry_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        name: str | None = None,
        description: str | None = None,
        card_title_label: str | None = None,
        lifecycle_status: str | None = None,
    ) -> Registry:
        registry = self._get_active_registry(registry_id)
        self._require_schema_permission(actor_user_id, registry.id)
        if lifecycle_status == "archived":
            raise RegistrySchemaError("Use archive endpoint to archive registries.")
        if lifecycle_status is not None and lifecycle_status not in {"draft", "active"}:
            raise RegistrySchemaError(f"Unsupported registry lifecycle status: {lifecycle_status}")

        old_data = {
            "name": registry.name,
            "description": registry.description,
            "card_title_label": registry.card_title_label,
            "lifecycle_status": registry.lifecycle_status,
        }
        if name is not None:
            registry.name = name
        if description is not None:
            registry.description = description
        if card_title_label is not None:
            registry.card_title_label = self._clean_card_title_label(card_title_label)
        if lifecycle_status is not None:
            registry.lifecycle_status = lifecycle_status
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="registry",
            object_id=registry.id,
            old_data_json=old_data,
            new_data_json={
                "name": registry.name,
                "description": registry.description,
                "card_title_label": registry.card_title_label,
                "lifecycle_status": registry.lifecycle_status,
            },
        )
        return registry

    def archive_registry_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
    ) -> Registry:
        registry = self._get_active_registry(registry_id)
        self._require_schema_permission(actor_user_id, registry.id)
        self._ensure_default_registry_archive_allowed(registry)
        registry.archived_at = datetime.now(UTC)
        registry.lifecycle_status = "archived"
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="archive",
            object_type="registry",
            object_id=registry.id,
        )
        return registry

    def read_schema_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
    ) -> tuple[Registry, list[FormBlock], list[FormField], list[CardTemplate]]:
        registry = self.read_registry_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
        )
        blocks = list(
            self.session.scalars(
                select(FormBlock)
                .where(
                    FormBlock.registry_id == registry.id,
                    FormBlock.archived_at.is_(None),
                    FormBlock.is_active.is_(True),
                )
                .order_by(FormBlock.position, FormBlock.code, FormBlock.id)
            ).all()
        )
        block_ids = [block.id for block in blocks]
        fields = []
        if block_ids:
            fields = list(
                self.session.scalars(
                    select(FormField)
                    .where(
                        FormField.block_id.in_(block_ids),
                        FormField.archived_at.is_(None),
                        FormField.is_active.is_(True),
                    )
                    .order_by(FormField.position, FormField.code, FormField.id)
                ).all()
            )
        templates = list(
            self.session.scalars(
                select(CardTemplate)
                .where(
                    CardTemplate.registry_id == registry.id,
                    CardTemplate.archived_at.is_(None),
                    CardTemplate.is_active.is_(True),
                )
                .order_by(CardTemplate.position, CardTemplate.name, CardTemplate.id)
            ).all()
        )
        return registry, blocks, fields, templates

    def create_block_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        code: str,
        title: str,
        description: str | None = None,
        position: int = 0,
        is_repeatable: bool = False,
        is_system: bool = False,
        is_locked: bool = False,
        public_visible: bool = True,
        public_editable: bool = False,
    ) -> FormBlock:
        self._require_schema_permission(actor_user_id, registry_id)
        self._get_active_registry(registry_id)

        block = FormBlock(
            registry_id=registry_id,
            code=code,
            title=title,
            description=description,
            position=position,
            is_repeatable=is_repeatable,
            is_system=is_system,
            is_locked=is_locked,
            public_visible=public_visible,
            public_editable=public_editable,
            created_by=actor_user_id,
        )
        self.session.add(block)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="form_block",
            object_id=block.id,
            new_data_json={"registry_id": str(registry_id), "code": code},
        )
        return block

    def read_block_for_actor(self, *, actor_user_id: UUID, block_id: UUID) -> FormBlock:
        block = self._get_active_block(block_id)
        self._require_schema_permission(actor_user_id, block.registry_id)
        return block

    def update_block_for_actor(
        self,
        *,
        actor_user_id: UUID,
        block_id: UUID,
        title: str | None = None,
        description: str | None = None,
        position: int | None = None,
    ) -> FormBlock:
        block = self._get_active_block(block_id)
        self._ensure_mutable_block(block)
        self._require_schema_permission(actor_user_id, block.registry_id)
        old_data = {
            "title": block.title,
            "description": block.description,
            "position": block.position,
        }

        if title is not None:
            block.title = title
        if description is not None:
            block.description = description
        if position is not None:
            block.position = position
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="form_block",
            object_id=block.id,
            old_data_json=old_data,
            new_data_json={
                "title": block.title,
                "description": block.description,
                "position": block.position,
            },
        )
        return block

    def archive_block_for_actor(
        self,
        *,
        actor_user_id: UUID,
        block_id: UUID,
    ) -> FormBlock:
        block = self._get_active_block(block_id)
        self._ensure_mutable_block(block)
        self._require_schema_permission(actor_user_id, block.registry_id)

        block.archived_at = datetime.now(UTC)
        block.is_active = False
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="archive",
            object_type="form_block",
            object_id=block.id,
        )
        return block

    def create_field_for_actor(
        self,
        *,
        actor_user_id: UUID,
        block_id: UUID,
        code: str,
        label: str,
        field_type: str,
        description: str | None = None,
        position: int = 0,
        required_mode: str = "not_required",
        options_source_type: str | None = None,
        options_source_id: UUID | None = None,
        options_config_json: dict[str, object] | None = None,
        is_system: bool = False,
        is_locked: bool = False,
        is_list_display: bool = False,
        public_visible: bool = True,
        public_editable: bool = False,
    ) -> FormField:
        block = self._get_active_block(block_id)
        self._require_schema_permission(actor_user_id, block.registry_id)
        self._validate_field_type(field_type)
        self._validate_required_mode(required_mode)

        field = FormField(
            block_id=block_id,
            code=code,
            label=label,
            description=description,
            field_type=field_type,
            position=position,
            required_mode=required_mode,
            options_source_type=options_source_type,
            options_source_id=options_source_id,
            options_config_json=options_config_json,
            is_system=is_system,
            is_locked=is_locked,
            is_list_display=is_list_display,
            public_visible=public_visible,
            public_editable=public_editable,
            created_by=actor_user_id,
        )
        self.session.add(field)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="form_field",
            object_id=field.id,
            new_data_json={
                "block_id": str(block_id),
                "code": code,
                "field_type": field_type,
                "required_mode": required_mode,
                "is_list_display": is_list_display,
            },
        )
        return field

    def read_field_for_actor(self, *, actor_user_id: UUID, field_id: UUID) -> FormField:
        field = self._get_active_field(field_id)
        block = self._get_active_block(field.block_id)
        self._require_schema_permission(actor_user_id, block.registry_id)
        return field

    def update_field_for_actor(
        self,
        *,
        actor_user_id: UUID,
        field_id: UUID,
        label: str | None = None,
        description: str | None = None,
        position: int | None = None,
        required_mode: str | None = None,
        is_active: bool | None = None,
        is_list_display: bool | None = None,
    ) -> FormField:
        field = self._get_active_field(field_id)
        block = self._get_active_block(field.block_id)
        self._ensure_mutable_field(field)
        self._require_schema_permission(actor_user_id, block.registry_id)
        old_data = {
            "label": field.label,
            "description": field.description,
            "position": field.position,
            "required_mode": field.required_mode,
            "is_active": field.is_active,
            "is_list_display": field.is_list_display,
        }
        if required_mode is not None:
            self._validate_required_mode(required_mode)

        if label is not None:
            field.label = label
        if description is not None:
            field.description = description
        if position is not None:
            field.position = position
        if required_mode is not None:
            field.required_mode = required_mode
        if is_active is not None:
            field.is_active = is_active
        if is_list_display is not None:
            field.is_list_display = is_list_display
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="form_field",
            object_id=field.id,
            old_data_json=old_data,
            new_data_json={
                "label": field.label,
                "description": field.description,
                "position": field.position,
                "required_mode": field.required_mode,
                "is_active": field.is_active,
                "is_list_display": field.is_list_display,
            },
        )
        return field

    def archive_field_for_actor(
        self,
        *,
        actor_user_id: UUID,
        field_id: UUID,
    ) -> FormField:
        field = self._get_active_field(field_id)
        block = self._get_active_block(field.block_id)
        self._ensure_mutable_field(field)
        self._require_schema_permission(actor_user_id, block.registry_id)

        field.archived_at = datetime.now(UTC)
        field.is_active = False
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="archive",
            object_type="form_field",
            object_id=field.id,
        )
        return field

    def list_card_templates_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        include_archive: bool = False,
    ) -> list[CardTemplate]:
        self.read_registry_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            include_archive=False,
        )
        criteria = [CardTemplate.registry_id == registry_id]
        if not include_archive:
            criteria.extend(
                [
                    CardTemplate.archived_at.is_(None),
                    CardTemplate.is_active.is_(True),
                ]
            )
        return list(
            self.session.scalars(
                select(CardTemplate)
                .where(*criteria)
                .order_by(CardTemplate.position, CardTemplate.name, CardTemplate.id)
            ).all()
        )

    def create_card_template_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        code: str,
        name: str,
        description: str | None = None,
        position: int = 0,
        field_schema_json: dict[str, Any] | None = None,
        default_values_json: list[dict[str, Any]] | None = None,
        is_active: bool = True,
    ) -> CardTemplate:
        self._require_schema_permission(actor_user_id, registry_id)
        self._get_active_registry(registry_id)
        normalized_schema, normalized_defaults = self._normalize_card_template_payload(
            registry_id=registry_id,
            field_schema_json=field_schema_json,
            default_values_json=default_values_json,
        )

        template = CardTemplate(
            registry_id=registry_id,
            code=code,
            name=name,
            description=description,
            position=position,
            field_schema_json=normalized_schema,
            default_values_json=normalized_defaults,
            is_active=is_active,
            created_by=actor_user_id,
            updated_by=actor_user_id,
        )
        self.session.add(template)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="card_template",
            object_id=template.id,
            new_data_json={
                "registry_id": str(registry_id),
                "code": code,
                "name": name,
                "field_schema_json": normalized_schema,
            },
        )
        return template

    def update_card_template_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
        name: str | None = None,
        description: str | None = None,
        position: int | None = None,
        field_schema_json: dict[str, Any] | None = None,
        default_values_json: list[dict[str, Any]] | None = None,
        is_active: bool | None = None,
    ) -> CardTemplate:
        template = self._get_card_template(template_id, include_archive=False)
        self._require_schema_permission(actor_user_id, template.registry_id)
        old_data = {
            "name": template.name,
            "description": template.description,
            "position": template.position,
            "field_schema_json": template.field_schema_json,
            "default_values_json": template.default_values_json,
            "is_active": template.is_active,
        }

        if field_schema_json is not None or default_values_json is not None:
            normalized_schema, normalized_defaults = self._normalize_card_template_payload(
                registry_id=template.registry_id,
                field_schema_json=(
                    field_schema_json
                    if field_schema_json is not None
                    else template.field_schema_json
                ),
                default_values_json=(
                    default_values_json
                    if default_values_json is not None
                    else template.default_values_json
                ),
            )
            template.field_schema_json = normalized_schema
            template.default_values_json = normalized_defaults
        if name is not None:
            template.name = name
        if description is not None:
            template.description = description
        if position is not None:
            template.position = position
        if is_active is not None:
            template.is_active = is_active
        template.updated_by = actor_user_id
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="card_template",
            object_id=template.id,
            old_data_json=old_data,
            new_data_json={
                "name": template.name,
                "description": template.description,
                "position": template.position,
                "field_schema_json": template.field_schema_json,
                "default_values_json": template.default_values_json,
                "is_active": template.is_active,
            },
        )
        return template

    def archive_card_template_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
    ) -> CardTemplate:
        template = self._get_card_template(template_id, include_archive=False)
        self._require_schema_permission(actor_user_id, template.registry_id)
        template.archived_at = datetime.now(UTC)
        template.archived_by = actor_user_id
        template.is_active = False
        template.updated_by = actor_user_id
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="archive",
            object_type="card_template",
            object_id=template.id,
        )
        return template

    def _require_schema_permission(self, actor_user_id: UUID, registry_id: UUID) -> None:
        permissions = PermissionService(self.session)
        if not permissions.has_permission(
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

    def _get_active_registry(self, registry_id: UUID) -> Registry:
        return self._get_registry(registry_id, include_archive=False)

    def _get_registry(self, registry_id: UUID, *, include_archive: bool) -> Registry:
        registry = self.session.get(Registry, registry_id)
        if registry is None or (
            not include_archive
            and (registry.archived_at is not None or registry.lifecycle_status == "archived")
        ):
            raise RegistrySchemaError("Registry was not found.")
        return registry

    def _get_card_template(
        self,
        template_id: UUID,
        *,
        include_archive: bool,
    ) -> CardTemplate:
        template = self.session.get(CardTemplate, template_id)
        if template is None or (
            not include_archive and (template.archived_at is not None or not template.is_active)
        ):
            raise RegistrySchemaError("Card template was not found.")
        return template

    def _get_active_block(self, block_id: UUID) -> FormBlock:
        block = self.session.get(FormBlock, block_id)
        if block is None or block.archived_at is not None or not block.is_active:
            raise RegistrySchemaError("Form block was not found.")
        return block

    def _get_active_field(self, field_id: UUID) -> FormField:
        field = self.session.get(FormField, field_id)
        if field is None or field.archived_at is not None or not field.is_active:
            raise RegistrySchemaError("Form field was not found.")
        return field

    def _ensure_mutable_block(self, block: FormBlock) -> None:
        if block.is_locked or block.is_system:
            raise RegistrySchemaError("Locked or system form blocks cannot be changed here.")

    def _ensure_mutable_field(self, field: FormField) -> None:
        if field.is_locked or field.is_system:
            raise RegistrySchemaError("Locked or system form fields cannot be changed here.")

    def _normalize_card_template_payload(
        self,
        *,
        registry_id: UUID,
        field_schema_json: dict[str, Any] | None,
        default_values_json: list[dict[str, Any]] | None,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        raw_schema = field_schema_json or {}
        raw_field_ids = raw_schema.get("field_ids", [])
        if not isinstance(raw_field_ids, list):
            raise RegistrySchemaError("Card template field schema must contain a field_ids list.")

        field_ids: list[UUID] = []
        for raw_field_id in raw_field_ids:
            try:
                field_ids.append(UUID(str(raw_field_id)))
            except (TypeError, ValueError) as exc:
                raise RegistrySchemaError("Card template field ids must be UUID values.") from exc

        known_field_ids = self._active_field_ids_for_registry(registry_id)
        unknown_field_ids = [field_id for field_id in field_ids if field_id not in known_field_ids]
        if unknown_field_ids:
            raise RegistrySchemaError("Card template fields must belong to the registry schema.")

        normalized_field_ids = [str(field_id) for field_id in field_ids]
        allowed_field_ids = set(normalized_field_ids)
        normalized_schema = {**raw_schema, "field_ids": normalized_field_ids}

        normalized_defaults: list[dict[str, Any]] = []
        for raw_default in default_values_json or []:
            if not isinstance(raw_default, dict):
                raise RegistrySchemaError("Card template defaults must be objects.")
            try:
                default_field_id = str(UUID(str(raw_default["field_id"])))
            except (KeyError, TypeError, ValueError) as exc:
                raise RegistrySchemaError("Card template defaults require field_id UUID.") from exc
            if default_field_id not in allowed_field_ids:
                raise RegistrySchemaError(
                    "Card template default fields must be included in the template field schema."
                )
            if "value" not in raw_default:
                raise RegistrySchemaError("Card template defaults require value.")
            normalized_defaults.append(
                {
                    "field_id": default_field_id,
                    "value": raw_default["value"],
                }
            )

        return normalized_schema, normalized_defaults

    def _active_field_ids_for_registry(self, registry_id: UUID) -> set[UUID]:
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

    def _validate_field_type(self, field_type: str) -> None:
        if field_type not in FIELD_TYPES:
            raise RegistrySchemaError(f"Unsupported field type: {field_type}")

    def _validate_required_mode(self, required_mode: str) -> None:
        if required_mode not in REQUIRED_MODES:
            raise RegistrySchemaError(f"Unsupported required mode: {required_mode}")

    def _ensure_default_registry_archive_allowed(self, registry: Registry) -> None:
        if not registry.is_default_for_owner_tree:
            return

        active_card_count = self.session.scalar(
            select(func.count())
            .select_from(Card)
            .where(
                Card.registry_id == registry.id,
                Card.archived_at.is_(None),
                Card.lifecycle_status.in_(("draft", "active")),
            )
        )
        if active_card_count:
            raise RegistrySchemaError("Default registry has active or draft cards.")

    def _default_registry_code(
        self, root_organization_code: str, root_organization_id: UUID
    ) -> str:
        base_code = f"{root_organization_code}_cards"
        if not self.session.scalar(select(Registry.id).where(Registry.code == base_code)):
            return base_code
        return f"{base_code}_{str(root_organization_id).split('-', maxsplit=1)[0]}"

    @staticmethod
    def _clean_card_title_label(card_title_label: str) -> str:
        cleaned = card_title_label.strip()
        if not cleaned:
            raise RegistrySchemaError("Card title label must not be empty.")
        return cleaned
