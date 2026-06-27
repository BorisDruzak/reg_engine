from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from app.services.audit import AuditEventCreate, AuditRecorder
from app.services.permissions import ActorContext


@dataclass(frozen=True)
class OrgUnitCreate:
    code: str
    name: str
    parent_id: UUID | None = None


class OrgUnitRepository(Protocol):
    def create_org_unit(
        self,
        *,
        organization_id: UUID,
        code: str,
        name: str,
        parent_id: UUID | None,
        created_by: UUID | None,
    ) -> UUID:
        """Create an org unit and return its id."""

    def list_by_organization(self, organization_id: UUID) -> list[dict[str, object]]:
        """Return active org units for an organization."""

    def archive(self, org_unit_id: UUID) -> None:
        """Archive an org unit."""


class OrgUnitService:
    def __init__(
        self,
        repository: OrgUnitRepository,
        audit_service: AuditRecorder | None = None,
    ) -> None:
        self.repository = repository
        self.audit_service = audit_service

    def create(
        self,
        *,
        organization_id: UUID,
        data: OrgUnitCreate,
        created_by: UUID | None,
        actor: ActorContext | None = None,
    ) -> UUID:
        org_unit_id = self.repository.create_org_unit(
            organization_id=organization_id,
            code=data.code,
            name=data.name,
            parent_id=data.parent_id,
            created_by=created_by,
        )
        if actor is not None:
            self._record_user_event(
                actor,
                "org_unit.create",
                org_unit_id,
                {
                    "organization_id": organization_id,
                    "code": data.code,
                    "name": data.name,
                    "parent_id": data.parent_id,
                },
            )
        return org_unit_id

    def list_by_organization(self, organization_id: UUID) -> list[dict[str, object]]:
        return self.repository.list_by_organization(organization_id)

    def archive(self, org_unit_id: UUID, *, actor: ActorContext | None = None) -> None:
        self.repository.archive(org_unit_id)
        if actor is not None:
            self._record_user_event(actor, "org_unit.archive", org_unit_id, None)

    def _record_user_event(
        self,
        actor: ActorContext,
        action: str,
        object_id: UUID,
        new_data: dict[str, object] | None,
    ) -> None:
        if self.audit_service is None:
            return
        self.audit_service.record_user_event(
            actor,
            AuditEventCreate(
                action=action,
                object_type="org_unit",
                object_id=object_id,
                new_data=new_data,
            ),
        )
