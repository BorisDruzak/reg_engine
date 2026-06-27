from dataclasses import dataclass
from typing import Protocol, cast
from uuid import UUID

from app.services.permissions import AccessDeniedError, ActorContext


@dataclass(frozen=True)
class ReferenceListCreate:
    code: str
    name: str
    registry_id: UUID | None = None
    owner_organization_id: UUID | None = None
    locked_for_descendants: bool = True
    inherit_to_descendants: bool = True


@dataclass(frozen=True)
class ReferenceItemCreate:
    code: str
    label: str


class ReferenceListRepository(Protocol):
    def create_reference_list(
        self,
        *,
        registry_id: UUID | None,
        owner_organization_id: UUID | None,
        code: str,
        name: str,
        locked_for_descendants: bool,
        inherit_to_descendants: bool,
        created_by: UUID | None,
    ) -> UUID:
        """Create a reference list and return its id."""

    def create_reference_item(
        self,
        *,
        list_id: UUID,
        code: str,
        label: str,
        created_by: UUID | None,
    ) -> UUID:
        """Create a reference item and return its id."""

    def get_reference_list(self, list_id: UUID) -> dict[str, object]:
        """Return reference list attributes."""

    def get_reference_item(self, item_id: UUID) -> dict[str, object]:
        """Return reference item attributes."""

    def inherited_list_ids_for(self, organization_id: UUID) -> set[UUID]:
        """Return lists visible to an organization."""

    def archive_reference_list(self, list_id: UUID) -> None:
        """Archive a reference list without deleting it."""

    def archive_reference_item(self, item_id: UUID) -> None:
        """Archive a reference item without deleting it."""


class ReferenceListService:
    def __init__(self, repository: ReferenceListRepository) -> None:
        self.repository = repository

    def create_list(self, actor: ActorContext, data: ReferenceListCreate) -> UUID:
        if not actor.is_superuser and data.owner_organization_id is None:
            raise AccessDeniedError(
                "Only a system administrator can create global reference lists."
            )
        return self.repository.create_reference_list(
            registry_id=data.registry_id,
            owner_organization_id=data.owner_organization_id,
            code=data.code,
            name=data.name,
            locked_for_descendants=data.locked_for_descendants,
            inherit_to_descendants=data.inherit_to_descendants,
            created_by=actor.user_id,
        )

    def create_item(
        self,
        actor: ActorContext,
        *,
        list_id: UUID,
        data: ReferenceItemCreate,
    ) -> UUID:
        self._ensure_can_edit_list(actor, list_id)
        return self.repository.create_reference_item(
            list_id=list_id,
            code=data.code,
            label=data.label,
            created_by=actor.user_id,
        )

    def available_list_ids_for_organization(self, organization_id: UUID) -> set[UUID]:
        return self.repository.inherited_list_ids_for(organization_id)

    def archive_list(self, actor: ActorContext, list_id: UUID) -> None:
        self._ensure_can_edit_list(actor, list_id)
        self.repository.archive_reference_list(list_id)

    def archive_item(self, actor: ActorContext, item_id: UUID) -> None:
        reference_item = self.repository.get_reference_item(item_id)
        list_id = cast(UUID, reference_item["list_id"])
        self._ensure_can_edit_list(actor, list_id)
        self.repository.archive_reference_item(item_id)

    def _ensure_can_edit_list(self, actor: ActorContext, list_id: UUID) -> None:
        if actor.is_superuser:
            return

        reference_list = self.repository.get_reference_list(list_id)
        owner_organization_id = reference_list["owner_organization_id"]
        locked_for_descendants = bool(reference_list["locked_for_descendants"])

        actor_organization_ids = {
            grant.organization_id for grant in actor.grants if grant.organization_id is not None
        }
        if owner_organization_id in actor_organization_ids:
            return
        if locked_for_descendants:
            raise AccessDeniedError(
                "Descendant admins cannot edit locked inherited reference lists."
            )
