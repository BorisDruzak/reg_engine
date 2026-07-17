import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from typing import Literal
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import FormField, OrganizationClosure, ReferenceItem, ReferenceList
from app.services.audit import AuditService
from app.services.permissions import PermissionDeniedError, PermissionService


class ReferenceListError(ValueError):
    """Raised when reference list operations reference invalid list state."""


UNSET_OWNER_ORGANIZATION = object()


@dataclass(frozen=True)
class ImportReferenceResolution:
    status: Literal["existing", "create"]
    normalized_label: str
    display_label: str
    reference_item_id: UUID | None = None


class ReferenceListService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_reference_list_for_actor(
        self,
        *,
        actor_user_id: UUID,
        code: str,
        name: str,
        registry_id: UUID | None = None,
        owner_organization_id: UUID | None = None,
        description: str | None = None,
        inherit_to_descendants: bool = True,
        locked_for_descendants: bool = True,
        managed_by_system_only: bool = False,
    ) -> ReferenceList:
        self._require_reference_create_permission(
            actor_user_id,
            registry_id=registry_id,
            owner_organization_id=owner_organization_id,
        )

        reference_list = ReferenceList(
            registry_id=registry_id,
            owner_organization_id=owner_organization_id,
            code=code,
            name=name,
            description=description,
            inherit_to_descendants=inherit_to_descendants,
            locked_for_descendants=locked_for_descendants,
            managed_by_system_only=managed_by_system_only,
            created_by=actor_user_id,
        )
        self.session.add(reference_list)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="reference_list",
            object_id=reference_list.id,
            new_data_json={"code": code, "name": name},
        )
        return reference_list

    def update_reference_list_for_actor(
        self,
        *,
        actor_user_id: UUID,
        list_id: UUID,
        name: str | None = None,
        description: str | None = None,
        owner_organization_id: UUID | None | object = UNSET_OWNER_ORGANIZATION,
        inherit_to_descendants: bool | None = None,
        locked_for_descendants: bool | None = None,
        managed_by_system_only: bool | None = None,
    ) -> ReferenceList:
        reference_list = self._get_active_reference_list(list_id)
        self._require_reference_edit_permission(actor_user_id, reference_list)
        old_data = {
            "name": reference_list.name,
            "description": reference_list.description,
            "owner_organization_id": (
                str(reference_list.owner_organization_id)
                if reference_list.owner_organization_id is not None
                else None
            ),
            "inherit_to_descendants": reference_list.inherit_to_descendants,
            "locked_for_descendants": reference_list.locked_for_descendants,
            "managed_by_system_only": reference_list.managed_by_system_only,
        }
        if name is not None:
            reference_list.name = name
        if description is not None:
            reference_list.description = description
        if owner_organization_id is not UNSET_OWNER_ORGANIZATION:
            new_owner_id = (
                owner_organization_id if isinstance(owner_organization_id, UUID) else None
            )
            self._require_reference_create_permission(
                actor_user_id,
                registry_id=reference_list.registry_id,
                owner_organization_id=new_owner_id,
            )
            reference_list.owner_organization_id = new_owner_id
        if inherit_to_descendants is not None:
            reference_list.inherit_to_descendants = inherit_to_descendants
        if locked_for_descendants is not None:
            reference_list.locked_for_descendants = locked_for_descendants
        if managed_by_system_only is not None:
            reference_list.managed_by_system_only = managed_by_system_only
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="reference_list",
            object_id=reference_list.id,
            old_data_json=old_data,
            new_data_json={
                "name": reference_list.name,
                "description": reference_list.description,
                "owner_organization_id": (
                    str(reference_list.owner_organization_id)
                    if reference_list.owner_organization_id is not None
                    else None
                ),
                "inherit_to_descendants": reference_list.inherit_to_descendants,
                "locked_for_descendants": reference_list.locked_for_descendants,
                "managed_by_system_only": reference_list.managed_by_system_only,
            },
        )
        return reference_list

    def archive_reference_list_for_actor(
        self,
        *,
        actor_user_id: UUID,
        list_id: UUID,
    ) -> ReferenceList:
        reference_list = self._get_active_reference_list(list_id)
        self._require_reference_edit_permission(actor_user_id, reference_list)
        reference_list.archived_at = datetime.now(UTC)
        reference_list.is_active = False
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="archive",
            object_type="reference_list",
            object_id=reference_list.id,
        )
        return reference_list

    def read_reference_list_for_actor(
        self,
        *,
        actor_user_id: UUID,
        list_id: UUID,
    ) -> ReferenceList:
        reference_list = self._get_active_reference_list(list_id)
        self._require_reference_read_permission(actor_user_id, reference_list)
        return reference_list

    def list_reference_lists_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        organization_id: UUID | None = None,
    ) -> list[ReferenceList]:
        if organization_id is not None:
            return self.list_available_reference_lists_for_actor(
                actor_user_id=actor_user_id,
                registry_id=registry_id,
                organization_id=organization_id,
            )

        permissions = PermissionService(self.session)
        can_manage_schema = permissions.has_permission(
            actor_user_id,
            "registry.schema.manage",
            registry_id=registry_id,
        )
        can_read_cards = permissions.has_permission(
            actor_user_id,
            "cards.manage",
            registry_id=registry_id,
        )
        if not can_manage_schema and not can_read_cards:
            raise PermissionDeniedError("Actor cannot read reference lists.")

        reference_lists = list(
            self.session.scalars(
                select(ReferenceList)
                .where(
                    ReferenceList.registry_id == registry_id,
                    ReferenceList.archived_at.is_(None),
                    ReferenceList.is_active.is_(True),
                )
                .order_by(ReferenceList.code, ReferenceList.id)
            ).all()
        )
        if can_manage_schema:
            return reference_lists
        return [
            reference_list
            for reference_list in reference_lists
            if self._can_read_reference_list(actor_user_id, reference_list)
        ]

    def create_reference_item_for_actor(
        self,
        *,
        actor_user_id: UUID,
        list_id: UUID,
        code: str,
        label: str,
        parent_id: UUID | None = None,
        description: str | None = None,
        position: int = 0,
    ) -> ReferenceItem:
        reference_list = self._get_active_reference_list(list_id)
        self._require_reference_edit_permission(actor_user_id, reference_list)

        if parent_id is not None:
            parent = self._get_active_reference_item(parent_id)
            if parent.list_id != list_id:
                raise ReferenceListError("Parent reference item belongs to another list.")

        item = ReferenceItem(
            list_id=list_id,
            parent_id=parent_id,
            code=code,
            label=label,
            description=description,
            position=position,
            created_by=actor_user_id,
        )
        self.session.add(item)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="reference_item",
            object_id=item.id,
            new_data_json={"list_id": str(list_id), "code": code, "label": label},
        )
        return item

    def resolve_or_plan_global_import_item_for_actor(
        self,
        *,
        actor_user_id: UUID,
        list_id: UUID,
        raw_label: object,
    ) -> ImportReferenceResolution:
        """Resolve one flat global reference value without mutating the list."""
        reference_list = self._get_active_reference_list(list_id)
        self._require_reference_edit_permission(actor_user_id, reference_list)
        if (
            reference_list.owner_organization_id is not None
            or getattr(reference_list, "scope_mode", "global") != "global"
        ):
            raise ReferenceListError("Only global reference lists can be enriched by import.")

        normalized_label, display_label = self._normalize_import_label(raw_label)
        items = self.list_items(list_id)
        if any(item.parent_id is not None for item in items):
            raise ReferenceListError("Hierarchical reference lists cannot be enriched by import.")
        matches = [
            item
            for item in items
            if self._normalize_import_label(item.label)[0] == normalized_label
        ]
        if len(matches) > 1:
            raise ReferenceListError("Import reference label is ambiguous.")
        if matches:
            return ImportReferenceResolution(
                status="existing",
                normalized_label=normalized_label,
                display_label=display_label,
                reference_item_id=matches[0].id,
            )
        return ImportReferenceResolution(
            status="create",
            normalized_label=normalized_label,
            display_label=display_label,
        )

    def create_global_import_item_for_actor(
        self,
        *,
        actor_user_id: UUID,
        list_id: UUID,
        normalized_label: str,
        display_label: str,
    ) -> ReferenceItem:
        """Create a root item planned by the XLSX import in an eligible global list."""
        reference_list = self._get_active_reference_list(list_id)
        self._require_reference_edit_permission(actor_user_id, reference_list)
        if (
            reference_list.owner_organization_id is not None
            or getattr(reference_list, "scope_mode", "global") != "global"
        ):
            raise ReferenceListError("Only global reference lists can be enriched by import.")
        if any(item.parent_id is not None for item in self.list_items(list_id)):
            raise ReferenceListError("Hierarchical reference lists cannot be enriched by import.")

        expected_normalized, cleaned_display = self._normalize_import_label(display_label)
        if normalized_label != expected_normalized:
            raise ReferenceListError(
                "Import reference label normalization does not match the display label."
            )
        code = f"import-{sha256(normalized_label.encode('utf-8')).hexdigest()[:16]}"
        item = ReferenceItem(
            list_id=list_id,
            parent_id=None,
            code=code,
            label=cleaned_display,
            created_by=actor_user_id,
        )
        try:
            # The stable code is unique per list. Keep a concurrent duplicate
            # insert inside a savepoint so the surrounding import transaction
            # can reuse the winner instead of becoming unusable.
            with self.session.begin_nested():
                self.session.add(item)
                self.session.flush()
        except IntegrityError:
            items = self.list_items(list_id)
            if any(existing_item.parent_id is not None for existing_item in items):
                raise ReferenceListError(
                    "Hierarchical reference lists cannot be enriched by import."
                ) from None
            matches = [
                existing_item
                for existing_item in items
                if self._normalize_import_label(existing_item.label)[0] == normalized_label
            ]
            if len(matches) > 1:
                raise ReferenceListError("Import reference label is ambiguous.") from None
            if matches:
                return matches[0]
            raise
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="reference_item",
            object_id=item.id,
            new_data_json={
                "list_id": str(list_id),
                "code": code,
                "label": cleaned_display,
                "source": "xlsx_import",
            },
        )
        return item

    def read_reference_item_for_actor(
        self,
        *,
        actor_user_id: UUID,
        item_id: UUID,
    ) -> ReferenceItem:
        item = self._get_active_reference_item(item_id)
        self.read_reference_list_for_actor(
            actor_user_id=actor_user_id,
            list_id=item.list_id,
        )
        return item

    def list_items_for_actor(
        self,
        *,
        actor_user_id: UUID,
        list_id: UUID,
    ) -> list[ReferenceItem]:
        self.read_reference_list_for_actor(actor_user_id=actor_user_id, list_id=list_id)
        return self.list_items(list_id)

    def update_reference_item_for_actor(
        self,
        *,
        actor_user_id: UUID,
        item_id: UUID,
        label: str | None = None,
        description: str | None = None,
        position: int | None = None,
    ) -> ReferenceItem:
        item = self._get_active_reference_item(item_id)
        reference_list = self._get_active_reference_list(item.list_id)
        self._require_reference_edit_permission(actor_user_id, reference_list)
        old_data = {
            "label": item.label,
            "description": item.description,
            "position": item.position,
        }
        if label is not None:
            item.label = label
        if description is not None:
            item.description = description
        if position is not None:
            item.position = position
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="reference_item",
            object_id=item.id,
            old_data_json=old_data,
            new_data_json={
                "label": item.label,
                "description": item.description,
                "position": item.position,
            },
        )
        return item

    def archive_reference_item_for_actor(
        self,
        *,
        actor_user_id: UUID,
        item_id: UUID,
    ) -> ReferenceItem:
        item = self._get_active_reference_item(item_id)
        reference_list = self._get_active_reference_list(item.list_id)
        self._require_reference_edit_permission(actor_user_id, reference_list)
        item.archived_at = datetime.now(UTC)
        item.is_active = False
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="archive",
            object_type="reference_item",
            object_id=item.id,
        )
        return item

    def list_items(self, list_id: UUID) -> list[ReferenceItem]:
        return list(
            self.session.scalars(
                select(ReferenceItem)
                .where(
                    ReferenceItem.list_id == list_id,
                    ReferenceItem.archived_at.is_(None),
                    ReferenceItem.is_active.is_(True),
                )
                .order_by(ReferenceItem.position, ReferenceItem.code)
            ).all()
        )

    def ensure_item_belongs_to_list(self, item_id: UUID, list_id: UUID) -> ReferenceItem:
        item = self._get_active_reference_item(item_id)
        if item.list_id != list_id:
            raise ReferenceListError("Reference item does not belong to the configured list.")
        return item

    def list_effective_items_for_field(
        self,
        *,
        field_model: FormField,
        registry_id: UUID,
        organization_id: UUID,
    ) -> list[ReferenceItem]:
        reference_list = self.resolve_effective_reference_list_for_field(
            field_model=field_model,
            registry_id=registry_id,
            organization_id=organization_id,
        )
        return self.list_items(reference_list.id)

    def ensure_item_belongs_to_effective_list(
        self,
        *,
        item_id: UUID,
        field_model: FormField,
        registry_id: UUID,
        organization_id: UUID,
    ) -> ReferenceItem:
        reference_list = self.resolve_effective_reference_list_for_field(
            field_model=field_model,
            registry_id=registry_id,
            organization_id=organization_id,
        )
        item = self._get_active_reference_item(item_id)
        if item.list_id != reference_list.id:
            raise ReferenceListError(
                "Reference item does not belong to the effective reference list."
            )
        return item

    def resolve_effective_reference_list_for_field(
        self,
        *,
        field_model: FormField,
        registry_id: UUID,
        organization_id: UUID,
    ) -> ReferenceList:
        if (
            field_model.options_source_type != "reference_list"
            or field_model.options_source_id is None
        ):
            raise ReferenceListError("Reference field is not configured with a reference list.")

        base_list = self._get_active_reference_list(field_model.options_source_id)
        if not self._uses_organization_reference_resolution(field_model):
            return base_list

        exact_list = self._reference_list_for_owner(
            base_list=base_list,
            owner_organization_id=organization_id,
        )
        if exact_list is not None:
            return exact_list

        inherited_list = self._nearest_inherited_reference_list(
            base_list=base_list,
            organization_id=organization_id,
        )
        return inherited_list or base_list

    def list_available_reference_lists_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        organization_id: UUID,
    ) -> list[ReferenceList]:
        if not PermissionService(self.session).can_see_organization(
            actor_user_id,
            organization_id,
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot use references in this organization scope.")

        inherited_owner_ids = self.session.scalars(
            select(OrganizationClosure.ancestor_id).where(
                OrganizationClosure.descendant_id == organization_id,
                OrganizationClosure.ancestor_id != organization_id,
            )
        ).all()

        return list(
            self.session.scalars(
                select(ReferenceList)
                .where(
                    ReferenceList.archived_at.is_(None),
                    ReferenceList.is_active.is_(True),
                    or_(
                        ReferenceList.registry_id.is_(None),
                        ReferenceList.registry_id == registry_id,
                    ),
                    or_(
                        ReferenceList.owner_organization_id.is_(None),
                        ReferenceList.owner_organization_id == organization_id,
                        ReferenceList.owner_organization_id.in_(inherited_owner_ids),
                    ),
                    or_(
                        ReferenceList.owner_organization_id.is_(None),
                        ReferenceList.owner_organization_id == organization_id,
                        ReferenceList.inherit_to_descendants.is_(True),
                    ),
                )
                .order_by(ReferenceList.code, ReferenceList.id)
            ).all()
        )

    def _require_reference_create_permission(
        self,
        actor_user_id: UUID,
        *,
        registry_id: UUID | None,
        owner_organization_id: UUID | None,
    ) -> None:
        permissions = PermissionService(self.session)
        if registry_id is None:
            if not permissions.is_superuser(actor_user_id):
                raise PermissionDeniedError("Only a system admin can manage global references.")
            return

        if owner_organization_id is not None:
            if not permissions.has_permission(
                actor_user_id,
                "registry.schema.manage",
                organization_id=owner_organization_id,
                registry_id=registry_id,
            ):
                raise PermissionDeniedError("Actor cannot manage this reference list owner scope.")
            return

        if not permissions.has_permission(
            actor_user_id,
            "registry.schema.manage",
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot manage reference lists.")

    def _require_reference_edit_permission(
        self,
        actor_user_id: UUID,
        reference_list: ReferenceList,
    ) -> None:
        permissions = PermissionService(self.session)
        if reference_list.managed_by_system_only and not permissions.is_superuser(actor_user_id):
            raise PermissionDeniedError("Only a system admin can manage this reference list.")

        registry_id = reference_list.registry_id
        owner_id = reference_list.owner_organization_id
        if registry_id is None:
            if not permissions.is_superuser(actor_user_id):
                raise PermissionDeniedError("Only a system admin can manage global references.")
            return

        if owner_id is None:
            if not permissions.has_permission(
                actor_user_id,
                "registry.schema.manage",
                registry_id=registry_id,
            ):
                raise PermissionDeniedError("Actor cannot manage reference lists.")
            return

        if permissions.has_permission(
            actor_user_id,
            "registry.schema.manage",
            organization_id=owner_id,
            registry_id=registry_id,
        ):
            return

        if reference_list.locked_for_descendants:
            raise PermissionDeniedError("Inherited locked reference lists cannot be edited here.")

        actor_scope = permissions.get_organization_scope_ids(actor_user_id, registry_id=registry_id)
        descendant_ids = set(
            self.session.scalars(
                select(OrganizationClosure.descendant_id).where(
                    OrganizationClosure.ancestor_id == owner_id,
                    OrganizationClosure.depth > 0,
                )
            ).all()
        )
        if actor_scope & descendant_ids:
            return

        raise PermissionDeniedError("Actor cannot manage this reference list owner scope.")

    def _require_reference_read_permission(
        self,
        actor_user_id: UUID,
        reference_list: ReferenceList,
    ) -> None:
        permissions = PermissionService(self.session)
        if permissions.is_superuser(actor_user_id):
            return

        registry_id = reference_list.registry_id
        if registry_id is None:
            raise PermissionDeniedError("Only a system admin can read global references.")

        if permissions.has_permission(
            actor_user_id,
            "registry.schema.manage",
            registry_id=registry_id,
        ):
            return

        if not permissions.has_permission(
            actor_user_id,
            "cards.manage",
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot read reference lists.")

        owner_id = reference_list.owner_organization_id
        if owner_id is None:
            return

        actor_scope = permissions.get_organization_scope_ids(actor_user_id, registry_id=registry_id)
        if owner_id in actor_scope:
            return

        if not reference_list.inherit_to_descendants:
            raise PermissionDeniedError("Actor cannot read this reference list owner scope.")

        inherited_scope_match = self.session.scalar(
            select(OrganizationClosure.descendant_id).where(
                OrganizationClosure.ancestor_id == owner_id,
                OrganizationClosure.descendant_id.in_(actor_scope),
            )
        )
        if inherited_scope_match is not None:
            return

        raise PermissionDeniedError("Actor cannot read this reference list owner scope.")

    def _can_read_reference_list(self, actor_user_id: UUID, reference_list: ReferenceList) -> bool:
        try:
            self._require_reference_read_permission(actor_user_id, reference_list)
        except PermissionDeniedError:
            return False
        return True

    def _get_active_reference_list(self, list_id: UUID) -> ReferenceList:
        reference_list = self.session.get(ReferenceList, list_id)
        if (
            reference_list is None
            or reference_list.archived_at is not None
            or not reference_list.is_active
        ):
            raise ReferenceListError("Reference list was not found.")
        return reference_list

    @staticmethod
    def _normalize_import_label(raw_label: object) -> tuple[str, str]:
        display_label = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(raw_label))).strip()
        if not display_label:
            raise ReferenceListError("Import reference label cannot be blank.")
        return display_label.casefold(), display_label

    def _get_active_reference_item(self, item_id: UUID) -> ReferenceItem:
        item = self.session.get(ReferenceItem, item_id)
        if item is None or item.archived_at is not None or not item.is_active:
            raise ReferenceListError("Reference item was not found.")
        return item

    def _uses_organization_reference_resolution(self, field_model: FormField) -> bool:
        config = field_model.options_config_json or {}
        return (
            config.get("reference_resolution") == "by_card_organization"
            or config.get("allow_owner_override") is True
        )

    def _reference_list_for_owner(
        self,
        *,
        base_list: ReferenceList,
        owner_organization_id: UUID,
    ) -> ReferenceList | None:
        return self.session.scalar(
            select(ReferenceList)
            .where(
                ReferenceList.registry_id == base_list.registry_id,
                ReferenceList.code == base_list.code,
                ReferenceList.owner_organization_id == owner_organization_id,
                ReferenceList.archived_at.is_(None),
                ReferenceList.is_active.is_(True),
            )
            .order_by(ReferenceList.id)
            .limit(1)
        )

    def _nearest_inherited_reference_list(
        self,
        *,
        base_list: ReferenceList,
        organization_id: UUID,
    ) -> ReferenceList | None:
        return self.session.scalar(
            select(ReferenceList)
            .join(
                OrganizationClosure,
                OrganizationClosure.ancestor_id == ReferenceList.owner_organization_id,
            )
            .where(
                ReferenceList.registry_id == base_list.registry_id,
                ReferenceList.code == base_list.code,
                ReferenceList.owner_organization_id.is_not(None),
                ReferenceList.inherit_to_descendants.is_(True),
                ReferenceList.archived_at.is_(None),
                ReferenceList.is_active.is_(True),
                OrganizationClosure.descendant_id == organization_id,
                OrganizationClosure.depth > 0,
            )
            .order_by(OrganizationClosure.depth.asc(), ReferenceList.id)
            .limit(1)
        )
