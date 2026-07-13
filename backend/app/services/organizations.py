from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Organization, OrganizationClosure, OrgUnit
from app.services.audit import AuditService
from app.services.permissions import PermissionDeniedError, PermissionService
from app.services.registry_schema import RegistrySchemaService


class OrganizationNotFoundError(ValueError):
    """Raised when an organization operation references a missing or archived organization."""


class OrganizationTopologyError(ValueError):
    """Raised when an organization tree operation violates the Phase 6 topology contract."""


class OrgUnitNotFoundError(OrganizationNotFoundError):
    """Raised when an org unit operation references a missing or archived org unit."""


ORG_UNIT_TYPES = frozenset({"management", "department"})


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
        self._ensure_single_active_root_absent()
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
            RegistrySchemaService(self.session).ensure_default_registry_for_root_organization(
                root_organization_id=organization.id,
                root_organization_code=organization.code,
                actor_user_id=created_by,
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

    def get_organization_for_actor(
        self,
        *,
        actor_user_id: UUID,
        organization_id: UUID,
    ) -> Organization:
        organization = self._get_active_organization(organization_id)
        permissions = PermissionService(self.session)
        if not permissions.is_superuser(actor_user_id) and not permissions.can_see_organization(
            actor_user_id,
            organization.id,
        ):
            raise PermissionDeniedError("Actor cannot read this organization.")
        return organization

    def list_organizations_for_actor(self, *, actor_user_id: UUID) -> list[Organization]:
        permissions = PermissionService(self.session)
        if permissions.is_superuser(actor_user_id):
            criteria = [
                Organization.archived_at.is_(None),
                Organization.is_active.is_(True),
            ]
        else:
            scope_ids = permissions.get_organization_scope_ids(actor_user_id)
            if not scope_ids:
                return []
            criteria = [
                Organization.id.in_(scope_ids),
                Organization.archived_at.is_(None),
                Organization.is_active.is_(True),
            ]

        return list(
            self.session.scalars(
                select(Organization).where(*criteria).order_by(Organization.code, Organization.id)
            ).all()
        )

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
        unit_type: Literal["management", "department"] = "department",
        created_by: UUID | None = None,
    ) -> OrgUnit:
        self._get_active_organization(organization_id)
        self._validate_org_unit_parent(
            organization_id=organization_id,
            parent_id=parent_id,
            unit_type=unit_type,
        )

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
        if created_by is not None:
            AuditService(self.session).record_user_event(
                actor_user_id=created_by,
                action="create",
                object_type="org_unit",
                object_id=org_unit.id,
                new_data_json={
                    "organization_id": str(organization_id),
                    "parent_id": str(parent_id) if parent_id is not None else None,
                    "code": code,
                    "name": name,
                    "type": unit_type,
                },
            )
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

    def create_org_unit_for_actor(
        self,
        *,
        actor_user_id: UUID,
        organization_id: UUID,
        code: str,
        name: str,
        parent_id: UUID | None = None,
        unit_type: Literal["management", "department"] = "department",
    ) -> OrgUnit:
        self._require_org_unit_manage_permission(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
        )
        return self.create_org_unit(
            organization_id=organization_id,
            code=code,
            name=name,
            parent_id=parent_id,
            unit_type=unit_type,
            created_by=actor_user_id,
        )

    def list_org_units_for_actor(
        self,
        *,
        actor_user_id: UUID,
        organization_id: UUID,
    ) -> list[OrgUnit]:
        self._require_org_unit_read_permission(
            actor_user_id=actor_user_id,
            organization_id=organization_id,
        )
        return self.list_org_units(organization_id)

    def read_org_unit_for_actor(
        self,
        *,
        actor_user_id: UUID,
        org_unit_id: UUID,
    ) -> OrgUnit:
        org_unit = self._get_active_org_unit(org_unit_id)
        self._require_org_unit_read_permission(
            actor_user_id=actor_user_id,
            organization_id=org_unit.organization_id,
        )
        return org_unit

    def update_org_unit_for_actor(
        self,
        *,
        actor_user_id: UUID,
        org_unit_id: UUID,
        name: str | None = None,
    ) -> OrgUnit:
        org_unit = self._get_active_org_unit(org_unit_id)
        self._require_org_unit_manage_permission(
            actor_user_id=actor_user_id,
            organization_id=org_unit.organization_id,
        )
        old_data = {"name": org_unit.name}
        if name is not None:
            org_unit.name = name
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="update",
            object_type="org_unit",
            object_id=org_unit.id,
            old_data_json=old_data,
            new_data_json={"name": org_unit.name},
        )
        return org_unit

    def archive_org_unit_for_actor(
        self,
        *,
        actor_user_id: UUID,
        org_unit_id: UUID,
    ) -> OrgUnit:
        org_unit = self._get_active_org_unit(org_unit_id)
        self._require_org_unit_manage_permission(
            actor_user_id=actor_user_id,
            organization_id=org_unit.organization_id,
        )
        org_units_to_archive = [org_unit]
        if org_unit.type == "management":
            org_units_to_archive.extend(
                self.session.scalars(
                    select(OrgUnit).where(
                        OrgUnit.parent_id == org_unit.id,
                        OrgUnit.archived_at.is_(None),
                        OrgUnit.is_active.is_(True),
                    )
                ).all()
            )
        archived_at = datetime.now(UTC)
        for archived_unit in org_units_to_archive:
            archived_unit.archived_at = archived_at
            archived_unit.is_active = False
        self.session.flush()
        audit_service = AuditService(self.session)
        for archived_unit in org_units_to_archive:
            audit_service.record_user_event(
                actor_user_id=actor_user_id,
                action="archive",
                object_type="org_unit",
                object_id=archived_unit.id,
            )
        return org_unit

    def _get_active_organization(self, organization_id: UUID) -> Organization:
        organization = self.session.get(Organization, organization_id)
        if (
            organization is None
            or organization.archived_at is not None
            or not organization.is_active
        ):
            raise OrganizationNotFoundError("Organization was not found.")
        return organization

    def _ensure_single_active_root_absent(self) -> None:
        existing_root_id = self.session.scalar(
            select(Organization.id)
            .where(
                Organization.parent_id.is_(None),
                Organization.archived_at.is_(None),
                Organization.is_active.is_(True),
            )
            .limit(1)
        )
        if existing_root_id is not None:
            raise OrganizationTopologyError(
                "Phase 6 v1 supports only one active root organization."
            )

    def _get_active_org_unit(self, org_unit_id: UUID) -> OrgUnit:
        org_unit = self.session.get(OrgUnit, org_unit_id)
        if org_unit is None or org_unit.archived_at is not None or not org_unit.is_active:
            raise OrgUnitNotFoundError("Org unit was not found.")
        return org_unit

    def _validate_org_unit_parent(
        self,
        *,
        organization_id: UUID,
        parent_id: UUID | None,
        unit_type: str,
    ) -> None:
        if unit_type not in ORG_UNIT_TYPES:
            raise OrganizationTopologyError("Organization unit type is not supported.")
        if unit_type == "management" and parent_id is not None:
            raise OrganizationTopologyError("Management must be a root organization unit.")
        if parent_id is None:
            return
        parent_unit = self._get_active_org_unit(parent_id)
        if (
            parent_unit.organization_id != organization_id
            or parent_unit.type != "management"
            or unit_type != "department"
        ):
            raise OrganizationTopologyError(
                "Department parent must be an active management in the same organization."
            )

    def _require_org_unit_read_permission(
        self,
        *,
        actor_user_id: UUID,
        organization_id: UUID,
    ) -> None:
        self._get_active_organization(organization_id)
        permissions = PermissionService(self.session)
        if not permissions.is_superuser(actor_user_id) and not permissions.can_see_organization(
            actor_user_id,
            organization_id,
        ):
            raise PermissionDeniedError("Actor cannot read org units in this organization.")

    def _require_org_unit_manage_permission(
        self,
        *,
        actor_user_id: UUID,
        organization_id: UUID,
    ) -> None:
        self._get_active_organization(organization_id)
        permissions = PermissionService(self.session)
        if not permissions.is_superuser(actor_user_id) and not permissions.has_permission(
            actor_user_id,
            "organizations.manage",
            organization_id=organization_id,
        ):
            raise PermissionDeniedError("Actor cannot manage org units in this organization.")
