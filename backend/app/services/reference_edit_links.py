import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Organization, ReferenceEditLink, ReferenceItem, ReferenceList, Registry
from app.services.audit import AuditService
from app.services.permissions import PermissionDeniedError, PermissionService


class ReferenceEditLinkError(ValueError):
    """Raised when a public reference editing link cannot be used."""


class ReferenceEditLinkReadOnlyError(ReferenceEditLinkError):
    """Raised when a closed or expired link attempts a mutation."""


@dataclass(frozen=True)
class ReferenceEditLinkToken:
    raw_token: str
    reference_edit_link: ReferenceEditLink


class ReferenceEditLinkService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        owner_organization_id: UUID | None = None,
        expires_in_days: int | None = None,
    ) -> ReferenceEditLinkToken:
        permissions = PermissionService(self.session)
        if not permissions.has_permission(
            actor_user_id, "registry.schema.manage", registry_id=registry_id
        ):
            raise PermissionDeniedError(
                "Actor cannot create public reference links for this registry."
            )
        if self.session.get(Registry, registry_id) is None:
            raise ReferenceEditLinkError("Registry was not found.")
        if owner_organization_id is not None and not permissions.can_see_organization(
            actor_user_id,
            owner_organization_id,
            registry_id=registry_id,
        ):
            raise PermissionDeniedError("Actor cannot use this owner organization.")
        if owner_organization_id is not None and not self._is_active_organization(
            owner_organization_id
        ):
            raise ReferenceEditLinkError("Owner organization was not found.")

        raw_token = secrets.token_urlsafe(32)
        reference_edit_link = ReferenceEditLink(
            registry_id=registry_id,
            owner_organization_id=owner_organization_id,
            token_hash=self._hash_token(raw_token),
            expires_at=(datetime.now(UTC) + timedelta(days=expires_in_days))
            if expires_in_days is not None
            else None,
            created_by=actor_user_id,
        )
        self.session.add(reference_edit_link)
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="reference_edit_link",
            object_id=reference_edit_link.id,
            new_data_json={
                "registry_id": str(registry_id),
                "owner_organization_id": str(owner_organization_id)
                if owner_organization_id is not None
                else None,
                "expires_at": reference_edit_link.expires_at.isoformat()
                if reference_edit_link.expires_at is not None
                else None,
            },
        )
        return ReferenceEditLinkToken(raw_token=raw_token, reference_edit_link=reference_edit_link)

    def list_for_actor(self, *, actor_user_id: UUID, registry_id: UUID) -> list[ReferenceEditLink]:
        if not PermissionService(self.session).has_permission(
            actor_user_id,
            "registry.schema.manage",
            registry_id=registry_id,
        ):
            raise PermissionDeniedError(
                "Actor cannot read public reference links for this registry."
            )
        return list(
            self.session.scalars(
                select(ReferenceEditLink)
                .where(ReferenceEditLink.registry_id == registry_id)
                .order_by(ReferenceEditLink.created_at.desc(), ReferenceEditLink.id.desc())
            ).all()
        )

    def close_for_actor(self, *, actor_user_id: UUID, link_id: UUID) -> ReferenceEditLink:
        reference_edit_link = self._get_link(link_id)
        if not PermissionService(self.session).has_permission(
            actor_user_id,
            "registry.schema.manage",
            registry_id=reference_edit_link.registry_id,
        ):
            raise PermissionDeniedError("Actor cannot close this public reference link.")
        if reference_edit_link.closed_at is None:
            reference_edit_link.closed_at = datetime.now(UTC)
            self.session.flush()
            AuditService(self.session).record_user_event(
                actor_user_id=actor_user_id,
                action="close",
                object_type="reference_edit_link",
                object_id=reference_edit_link.id,
            )
        return reference_edit_link

    def public_link_for_token(self, raw_token: str) -> ReferenceEditLink:
        reference_edit_link = self.session.scalar(
            select(ReferenceEditLink).where(
                ReferenceEditLink.token_hash == self._hash_token(raw_token)
            )
        )
        if reference_edit_link is None:
            raise ReferenceEditLinkError("Public reference link was not found.")
        return reference_edit_link

    def status_for_token(self, raw_token: str) -> tuple[ReferenceEditLink, str]:
        reference_edit_link = self.public_link_for_token(raw_token)
        return reference_edit_link, self.status(reference_edit_link)

    def status(self, reference_edit_link: ReferenceEditLink) -> str:
        if reference_edit_link.closed_at is not None:
            return "closed"
        if (
            reference_edit_link.expires_at is not None
            and reference_edit_link.expires_at <= datetime.now(UTC)
        ):
            return "expired"
        return "active"

    def list_public_reference_lists(
        self,
        *,
        raw_token: str,
        include_archived: bool = True,
    ) -> tuple[ReferenceEditLink, list[ReferenceList]]:
        reference_edit_link, _ = self.status_for_token(raw_token)
        criteria = [ReferenceList.created_via_reference_edit_link_id == reference_edit_link.id]
        if not include_archived:
            criteria.extend(
                [ReferenceList.archived_at.is_(None), ReferenceList.is_active.is_(True)]
            )
        reference_lists = list(
            self.session.scalars(
                select(ReferenceList)
                .where(*criteria)
                .order_by(ReferenceList.created_at, ReferenceList.id)
            ).all()
        )
        return reference_edit_link, reference_lists

    def list_public_reference_items(
        self,
        *,
        raw_token: str,
        list_id: UUID,
        include_archived: bool = True,
    ) -> tuple[ReferenceEditLink, list[ReferenceItem]]:
        reference_edit_link, _ = self.status_for_token(raw_token)
        self._get_link_list(reference_edit_link, list_id, include_archived=include_archived)
        criteria = [ReferenceItem.list_id == list_id]
        if not include_archived:
            criteria.extend(
                [ReferenceItem.archived_at.is_(None), ReferenceItem.is_active.is_(True)]
            )
        return reference_edit_link, list(
            self.session.scalars(
                select(ReferenceItem)
                .where(*criteria)
                .order_by(ReferenceItem.position, ReferenceItem.code)
            ).all()
        )

    def create_public_reference_list(
        self,
        *,
        raw_token: str,
        name: str,
        description: str | None = None,
    ) -> ReferenceList:
        reference_edit_link = self._require_active_token(raw_token)
        normalized_name = self._required_text(name, "Reference list name is required.")
        reference_list = ReferenceList(
            registry_id=reference_edit_link.registry_id,
            owner_organization_id=reference_edit_link.owner_organization_id,
            code=f"public-{reference_edit_link.id.hex[:8]}-{uuid4().hex[:12]}",
            name=normalized_name,
            description=self._optional_text(description),
            inherit_to_descendants=False,
            locked_for_descendants=True,
            managed_by_system_only=False,
            created_via_reference_edit_link_id=reference_edit_link.id,
        )
        self.session.add(reference_list)
        self.session.flush()
        AuditService(self.session).record_reference_edit_link_event(
            actor_reference_edit_link_id=reference_edit_link.id,
            action="create",
            object_type="reference_list",
            object_id=reference_list.id,
            new_data_json={
                "name": reference_list.name,
                "registry_id": str(reference_list.registry_id),
            },
        )
        return reference_list

    def update_public_reference_list(
        self,
        *,
        raw_token: str,
        list_id: UUID,
        name: str | None = None,
        description: str | None = None,
    ) -> ReferenceList:
        reference_edit_link = self._require_active_token(raw_token)
        reference_list = self._get_link_list(reference_edit_link, list_id, include_archived=False)
        old_data = {"name": reference_list.name, "description": reference_list.description}
        if name is not None:
            reference_list.name = self._required_text(name, "Reference list name is required.")
        if description is not None:
            reference_list.description = self._optional_text(description)
        self.session.flush()
        AuditService(self.session).record_reference_edit_link_event(
            actor_reference_edit_link_id=reference_edit_link.id,
            action="update",
            object_type="reference_list",
            object_id=reference_list.id,
            old_data_json=old_data,
            new_data_json={"name": reference_list.name, "description": reference_list.description},
        )
        return reference_list

    def archive_public_reference_list(self, *, raw_token: str, list_id: UUID) -> ReferenceList:
        reference_edit_link = self._require_active_token(raw_token)
        reference_list = self._get_link_list(reference_edit_link, list_id, include_archived=False)
        reference_list.archived_at = datetime.now(UTC)
        reference_list.is_active = False
        self.session.flush()
        AuditService(self.session).record_reference_edit_link_event(
            actor_reference_edit_link_id=reference_edit_link.id,
            action="archive",
            object_type="reference_list",
            object_id=reference_list.id,
        )
        return reference_list

    def create_public_reference_item(
        self,
        *,
        raw_token: str,
        list_id: UUID,
        label: str,
        parent_id: UUID | None = None,
        description: str | None = None,
        position: int = 0,
    ) -> ReferenceItem:
        reference_edit_link = self._require_active_token(raw_token)
        self._get_link_list(reference_edit_link, list_id, include_archived=False)
        if parent_id is not None:
            parent = self._get_active_item(parent_id)
            if parent.list_id != list_id:
                raise ReferenceEditLinkError("Parent reference item belongs to another list.")
        item = ReferenceItem(
            list_id=list_id,
            parent_id=parent_id,
            code=f"public-{uuid4().hex[:16]}",
            label=self._required_text(label, "Reference item label is required."),
            description=self._optional_text(description),
            position=max(0, position),
        )
        self.session.add(item)
        self.session.flush()
        AuditService(self.session).record_reference_edit_link_event(
            actor_reference_edit_link_id=reference_edit_link.id,
            action="create",
            object_type="reference_item",
            object_id=item.id,
            new_data_json={"list_id": str(list_id), "label": item.label},
        )
        return item

    def update_public_reference_item(
        self,
        *,
        raw_token: str,
        item_id: UUID,
        label: str | None = None,
        description: str | None = None,
        position: int | None = None,
    ) -> ReferenceItem:
        reference_edit_link = self._require_active_token(raw_token)
        item = self._get_link_item(reference_edit_link, item_id, include_archived=False)
        old_data = {"label": item.label, "description": item.description, "position": item.position}
        if label is not None:
            item.label = self._required_text(label, "Reference item label is required.")
        if description is not None:
            item.description = self._optional_text(description)
        if position is not None:
            item.position = max(0, position)
        self.session.flush()
        AuditService(self.session).record_reference_edit_link_event(
            actor_reference_edit_link_id=reference_edit_link.id,
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

    def archive_public_reference_item(self, *, raw_token: str, item_id: UUID) -> ReferenceItem:
        reference_edit_link = self._require_active_token(raw_token)
        item = self._get_link_item(reference_edit_link, item_id, include_archived=False)
        item.archived_at = datetime.now(UTC)
        item.is_active = False
        self.session.flush()
        AuditService(self.session).record_reference_edit_link_event(
            actor_reference_edit_link_id=reference_edit_link.id,
            action="archive",
            object_type="reference_item",
            object_id=item.id,
        )
        return item

    def _require_active_token(self, raw_token: str) -> ReferenceEditLink:
        reference_edit_link, status = self.status_for_token(raw_token)
        if status != "active":
            raise ReferenceEditLinkReadOnlyError("Public reference link is read-only.")
        return reference_edit_link

    def _get_link(self, link_id: UUID) -> ReferenceEditLink:
        reference_edit_link = self.session.get(ReferenceEditLink, link_id)
        if reference_edit_link is None:
            raise ReferenceEditLinkError("Public reference link was not found.")
        return reference_edit_link

    def _get_link_list(
        self,
        reference_edit_link: ReferenceEditLink,
        list_id: UUID,
        *,
        include_archived: bool,
    ) -> ReferenceList:
        reference_list = self.session.get(ReferenceList, list_id)
        if (
            reference_list is None
            or reference_list.created_via_reference_edit_link_id != reference_edit_link.id
            or (
                not include_archived
                and (reference_list.archived_at is not None or not reference_list.is_active)
            )
        ):
            raise ReferenceEditLinkError(
                "Reference list is not available through this public link."
            )
        return reference_list

    def _get_link_item(
        self,
        reference_edit_link: ReferenceEditLink,
        item_id: UUID,
        *,
        include_archived: bool,
    ) -> ReferenceItem:
        item = self.session.get(ReferenceItem, item_id)
        if item is None:
            raise ReferenceEditLinkError("Reference item was not found.")
        self._get_link_list(reference_edit_link, item.list_id, include_archived=include_archived)
        if not include_archived and (item.archived_at is not None or not item.is_active):
            raise ReferenceEditLinkError("Reference item was not found.")
        return item

    def _get_active_item(self, item_id: UUID) -> ReferenceItem:
        item = self.session.get(ReferenceItem, item_id)
        if item is None or item.archived_at is not None or not item.is_active:
            raise ReferenceEditLinkError("Parent reference item was not found.")
        return item

    def _is_active_organization(self, organization_id: UUID) -> bool:
        organization = self.session.get(Organization, organization_id)
        return bool(organization and organization.archived_at is None and organization.is_active)

    def _hash_token(self, raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    def _required_text(self, value: str, message: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ReferenceEditLinkError(message)
        return normalized

    def _optional_text(self, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None
