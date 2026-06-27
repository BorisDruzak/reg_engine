from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Organization, OrganizationClosure, OrgUnit
from app.services.audit import AuditService
from app.services.permissions import PermissionDeniedError, PermissionService


class OrganizationNotFoundError(ValueError):
    """Raised when an organization operation references a missing or archived organization."""


class OrganizationService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_root_for_actor(
        self,
        *,
        actor_user_id: UUID,
        code: str,
        name: str,
        organization_type: str = "organization",
    ) -> Organization:
        if not PermissionService(self.session).is_superuser(actor_user_id):
            raise PermissionDeniedError("Only a system admin can create a root organization.")

        return self.create_root(
            code=code,
            name=name,
            organization_type=organization_type,
            created_by=actor_user_id,
        )

    def create_child_for_actor(
        self,
        *,
        actor_user_id: UUID,
        parent_id: UUID,
        code: str,
        name: str,
        organization_type: str = "organization",
    ) -> Organization:
        if not PermissionService(self.session).can_manage_child_organization(
            actor_user_id,
            parent_id,
        ):
            raise PermissionDeniedError("Actor cannot manage child organizations in this scope.")

        return self.create_child(
            parent_id=parent_id,
            code=code,
            name=name,
            organization_type=organization_type,
            created_by=actor_user_id,
        )

    def create_root(
        self,
        *,
        code: str,
        name: str,
        organization_type: str = "organization",
        created_by: UUID | None = None,
    ) -> Organization:
        organization = Organization(
            code=code,
            name=name,
            type=organization_type,
            created_by=created_by,
        )
        self.session.add(organization)
        self.session.flush()
        self.session.add(
            OrganizationClosure(
                ancestor_id=organization.id,
                descendant_id=organization.id,
                depth=0,
            )
        )
        self.session.flush()
        if created_by is not None:
            AuditService(self.session).record_user_event(
                actor_user_id=created_by,
                action="create",
                object_type="organization",
                object_id=organization.id,
                new_data_json={"code": code, "name": name, "parent_id": None},
            )
        return organization

    def create_child(
        self,
        *,
        parent_id: UUID,
        code: str,
        name: str,
        organization_type: str = "organization",
        created_by: UUID | None = None,
    ) -> Organization:
        parent = self._get_active_organization(parent_id)
        organization = Organization(
            parent_id=parent.id,
            code=code,
            name=name,
            type=organization_type,
            created_by=created_by,
        )
        self.session.add(organization)
        self.session.flush()

        ancestor_rows = list(
            self.session.scalars(
                select(OrganizationClosure).where(
                    OrganizationClosure.descendant_id == parent.id,
                )
            ).all()
        )
        for row in ancestor_rows:
            self.session.add(
                OrganizationClosure(
                    ancestor_id=row.ancestor_id,
                    descendant_id=organization.id,
                    depth=row.depth + 1,
                )
            )
        self.session.add(
            OrganizationClosure(
                ancestor_id=organization.id,
                descendant_id=organization.id,
                depth=0,
            )
        )
        self.session.flush()
        if created_by is not None:
            AuditService(self.session).record_user_event(
                actor_user_id=created_by,
                action="create",
                object_type="organization",
                object_id=organization.id,
                new_data_json={
                    "code": code,
                    "name": name,
                    "parent_id": str(parent.id),
                },
            )
        return organization

    def update_organization_for_actor(
        self,
        *,
        actor_user_id: UUID,
        organization_id: UUID,
        name: str | None = None,
        organization_type: str | None = None,
    ) -> Organization:
        organization = self._get_active_organization(organization_id)
        permissions = PermissionService(self.session)
        can_manage = permissions.can_manage_child_organization(actor_user_id, organization_id)
        if not permissions.is_superuser(actor_user_id) and not can_manage:
            raise PermissionDeniedError("Actor cannot update this organization.")

        old_data = {"name": organization.name, "type": organization.type}
        if name is not None:
            organization.name = name
        if organization_type is not None:
            organization.type = organization_type
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="organization",
            object_id=organization.id,
            old_data_json=old_data,
            new_data_json={"name": organization.name, "type": organization.type},
        )
        return organization

    def archive_organization_for_actor(
        self,
        *,
        actor_user_id: UUID,
        organization_id: UUID,
    ) -> Organization:
        organization = self._get_active_organization(organization_id)
        permissions = PermissionService(self.session)
        can_manage = permissions.can_manage_child_organization(actor_user_id, organization_id)
        if not permissions.is_superuser(actor_user_id) and not can_manage:
            raise PermissionDeniedError("Actor cannot archive this organization.")

        organization.archived_at = datetime.now(UTC)
        organization.is_active = False
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="archive",
            object_type="organization",
            object_id=organization.id,
        )
        return organization

    def get_descendant_ids(
        self,
        organization_id: UUID,
        *,
        include_self: bool = True,
    ) -> set[UUID]:
        if include_self:
            depth_criteria = OrganizationClosure.depth >= 0
        else:
            depth_criteria = OrganizationClosure.depth > 0
        return set(
            self.session.scalars(
                select(OrganizationClosure.descendant_id)
                .join(Organization, Organization.id == OrganizationClosure.descendant_id)
                .where(
                    OrganizationClosure.ancestor_id == organization_id,
                    depth_criteria,
                    Organization.archived_at.is_(None),
                    Organization.is_active.is_(True),
                )
            ).all()
        )

    def is_descendant_or_self(self, ancestor_id: UUID, descendant_id: UUID) -> bool:
        result = self.session.scalar(
            select(OrganizationClosure.descendant_id).where(
                OrganizationClosure.ancestor_id == ancestor_id,
                OrganizationClosure.descendant_id == descendant_id,
            )
        )
        return result is not None

    def create_org_unit(
        self,
        *,
        organization_id: UUID,
        code: str,
        name: str,
        parent_id: UUID | None = None,
        unit_type: str | None = None,
        created_by: UUID | None = None,
    ) -> OrgUnit:
        self._get_active_organization(organization_id)
        if parent_id is not None:
            parent_unit = self.session.get(OrgUnit, parent_id)
            if parent_unit is None or parent_unit.organization_id != organization_id:
                raise OrganizationNotFoundError("Parent org unit was not found in organization.")

        org_unit = OrgUnit(
            organization_id=organization_id,
            parent_id=parent_id,
            code=code,
            name=name,
            type=unit_type,
            created_by=created_by,
        )
        self.session.add(org_unit)
        self.session.flush()
        return org_unit

    def list_org_units(self, organization_id: UUID) -> list[OrgUnit]:
        return list(
            self.session.scalars(
                select(OrgUnit)
                .where(
                    OrgUnit.organization_id == organization_id,
                    OrgUnit.archived_at.is_(None),
                    OrgUnit.is_active.is_(True),
                )
                .order_by(OrgUnit.code, OrgUnit.name)
            ).all()
        )

    def _get_active_organization(self, organization_id: UUID) -> Organization:
        organization = self.session.get(Organization, organization_id)
        if (
            organization is None
            or organization.archived_at is not None
            or not organization.is_active
        ):
            raise OrganizationNotFoundError("Organization was not found.")
        return organization
