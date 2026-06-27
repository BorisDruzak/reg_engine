from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ReferenceItem, ReferenceList
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
    ) -> ReferenceList:
        self._require_reference_permission(actor_user_id, registry_id)

        reference_list = ReferenceList(
            registry_id=registry_id,
            owner_organization_id=owner_organization_id,
            code=code,
            name=name,
            description=description,
            created_by=actor_user_id,
        )
        self.session.add(reference_list)
        self.session.flush()
        return reference_list

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
        self._require_reference_permission(actor_user_id, reference_list.registry_id)

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

    def _require_reference_permission(
        self,
        actor_user_id: UUID,
        registry_id: UUID | None,
    ) -> None:
        permissions = PermissionService(self.session)
        if registry_id is None:
            if not permissions.is_superuser(actor_user_id):
                raise PermissionDeniedError("Only a system admin can manage global references.")
            return

        if not permissions.has_permission(
            actor_user_id,
            "registry.schema.manage",
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot manage reference lists.")

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
