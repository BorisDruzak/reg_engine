from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import OrganizationClosure, ReferenceItem, ReferenceList
from app.services.audit import AuditService
from app.services.permissions import PermissionDeniedError, PermissionService


class ReferenceListError(ValueError):
    """Raised when reference list operations reference invalid list state."""


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
    ) -> ReferenceList:
        reference_list = self._get_active_reference_list(list_id)
        self._require_reference_edit_permission(actor_user_id, reference_list)
        old_data = {"name": reference_list.name, "description": reference_list.description}
        if name is not None:
            reference_list.name = name
        if description is not None:
            reference_list.description = description
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
        if not permissions.has_permission(
            actor_user_id,
            "registry.schema.manage",
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot read reference lists.")

        return list(
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

    def _get_active_reference_list(self, list_id: UUID) -> ReferenceList:
        reference_list = self.session.get(ReferenceList, list_id)
        if (
            reference_list is None
            or reference_list.archived_at is not None
            or not reference_list.is_active
        ):
            raise ReferenceListError("Reference list was not found.")
        return reference_list

    def _get_active_reference_item(self, item_id: UUID) -> ReferenceItem:
        item = self.session.get(ReferenceItem, item_id)
        if item is None or item.archived_at is not None or not item.is_active:
            raise ReferenceListError("Reference item was not found.")
        return item
