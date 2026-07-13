import os
from collections.abc import Iterator
from pathlib import Path
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.models import (
    AccessGrant,
    AuditEvent,
    OrganizationClosure,
    OrgUnit,
    Permission,
    Role,
    User,
    role_permissions,
)
from app.services.bootstrap import BootstrapService
from app.services.organizations import OrganizationService, OrganizationTopologyError
from app.services.permissions import PermissionDeniedError, PermissionService


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL service tests.")

    database_name = make_url(database_url).database or ""
    if database_name == "reg_engine" or not database_name.endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must point to a disposable database ending with '_test'.")

    return database_url


def _alembic_config() -> Config:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "migrations"))
    return config


def _run_alembic_upgrade(database_url: str) -> None:
    previous_url = os.environ.get("TEST_DATABASE_URL")
    os.environ["TEST_DATABASE_URL"] = database_url
    try:
        command.upgrade(_alembic_config(), "head")
    finally:
        if previous_url is None:
            os.environ.pop("TEST_DATABASE_URL", None)
        else:
            os.environ["TEST_DATABASE_URL"] = previous_url


def _reset_public_schema(engine: Engine) -> None:
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))


@pytest.fixture(scope="module")
def migrated_test_engine() -> Iterator[Engine]:
    database_url = _require_test_database_url()
    engine = create_engine(database_url)

    _reset_public_schema(engine)
    _run_alembic_upgrade(database_url)

    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture()
def db_session(migrated_test_engine: Engine) -> Iterator[Session]:
    connection = migrated_test_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, expire_on_commit=False)

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


def _create_user(
    session: Session,
    email: str,
    display_name: str = "Test user",
    *,
    is_superuser: bool = False,
) -> User:
    user = User(email=email, display_name=display_name, is_superuser=is_superuser)
    session.add(user)
    session.flush()
    return user


def _create_role_with_permission(session: Session, role_code: str, permission_code: str) -> Role:
    role = Role(code=role_code, name=role_code)
    permission = session.scalars(
        select(Permission).where(Permission.code == permission_code)
    ).one_or_none()
    if permission is None:
        permission = Permission(code=permission_code, description=permission_code)
        session.add(permission)
    session.add(role)
    session.flush()
    session.execute(
        role_permissions.insert().values(
            role_id=role.id,
            permission_id=permission.id,
        )
    )
    session.flush()
    return role


def _grant_access(
    session: Session,
    *,
    user_id: UUID,
    role_id: UUID,
    organization_id: UUID | None,
    include_descendants: bool,
    created_by: UUID | None = None,
) -> AccessGrant:
    grant = AccessGrant(
        user_id=user_id,
        role_id=role_id,
        organization_id=organization_id,
        include_descendants=include_descendants,
        created_by=created_by,
    )
    session.add(grant)
    session.flush()
    return grant


def test_system_admin_can_create_root_organization(db_session: Session) -> None:
    admin = _create_user(
        db_session,
        "system-admin@example.test",
        display_name="System admin",
        is_superuser=True,
    )

    organization = OrganizationService(db_session).create_root_for_actor(
        actor_user_id=admin.id,
        code="root",
        name="Root organization",
    )

    closure = db_session.scalars(
        select(OrganizationClosure).where(
            OrganizationClosure.ancestor_id == organization.id,
            OrganizationClosure.descendant_id == organization.id,
        )
    ).one()

    assert organization.parent_id is None
    assert organization.created_by == admin.id
    assert closure.depth == 0


def test_org_admin_can_create_child_inside_own_subtree(db_session: Session) -> None:
    system_admin = _create_user(db_session, "creator@example.test", is_superuser=True)
    org_admin = _create_user(db_session, "branch-admin@example.test")
    role = _create_role_with_permission(db_session, "org_admin", "organizations.manage")
    organization_service = OrganizationService(db_session)

    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="company",
        name="Company",
    )
    branch = organization_service.create_child(
        parent_id=root.id,
        code="branch-a",
        name="Branch A",
        created_by=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=org_admin.id,
        role_id=role.id,
        organization_id=branch.id,
        include_descendants=True,
        created_by=system_admin.id,
    )

    child = organization_service.create_child_for_actor(
        actor_user_id=org_admin.id,
        parent_id=branch.id,
        code="branch-a-child",
        name="Branch A child",
    )

    permissions = PermissionService(db_session)
    assert permissions.can_manage_child_organization(org_admin.id, branch.id)
    assert permissions.can_see_organization(org_admin.id, child.id)


def test_org_admin_cannot_create_or_see_parent_or_sibling_branches(
    db_session: Session,
) -> None:
    system_admin = _create_user(db_session, "tree-owner@example.test", is_superuser=True)
    org_admin = _create_user(db_session, "limited-admin@example.test")
    role = _create_role_with_permission(db_session, "limited_org_admin", "organizations.manage")
    organization_service = OrganizationService(db_session)

    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="tree-root",
        name="Tree root",
    )
    branch = organization_service.create_child(
        parent_id=root.id,
        code="managed-branch",
        name="Managed branch",
        created_by=system_admin.id,
    )
    descendant = organization_service.create_child(
        parent_id=branch.id,
        code="managed-descendant",
        name="Managed descendant",
        created_by=system_admin.id,
    )
    sibling = organization_service.create_child(
        parent_id=root.id,
        code="sibling-branch",
        name="Sibling branch",
        created_by=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=org_admin.id,
        role_id=role.id,
        organization_id=branch.id,
        include_descendants=True,
        created_by=system_admin.id,
    )

    permissions = PermissionService(db_session)

    assert permissions.get_organization_scope_ids(org_admin.id) == {branch.id, descendant.id}
    assert permissions.can_see_organization(org_admin.id, branch.id)
    assert permissions.can_see_organization(org_admin.id, descendant.id)
    assert not permissions.can_see_organization(org_admin.id, root.id)
    assert not permissions.can_see_organization(org_admin.id, sibling.id)
    assert not permissions.can_manage_child_organization(org_admin.id, sibling.id)

    with pytest.raises(PermissionDeniedError):
        organization_service.create_child_for_actor(
            actor_user_id=org_admin.id,
            parent_id=sibling.id,
            code="forbidden-child",
            name="Forbidden child",
        )


def test_access_grant_without_descendants_only_allows_exact_organization(
    db_session: Session,
) -> None:
    system_admin = _create_user(db_session, "exact-owner@example.test", is_superuser=True)
    org_admin = _create_user(db_session, "exact-admin@example.test")
    role = _create_role_with_permission(db_session, "exact_org_admin", "organizations.manage")
    organization_service = OrganizationService(db_session)

    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="exact-root",
        name="Exact root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="exact-child",
        name="Exact child",
        created_by=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=org_admin.id,
        role_id=role.id,
        organization_id=root.id,
        include_descendants=False,
        created_by=system_admin.id,
    )

    permissions = PermissionService(db_session)

    assert permissions.get_organization_scope_ids(org_admin.id) == {root.id}
    assert permissions.can_see_organization(org_admin.id, root.id)
    assert not permissions.can_see_organization(org_admin.id, child.id)
    assert not permissions.can_manage_child_organization(org_admin.id, child.id)


def test_org_units_are_filters_not_rbac_boundaries(db_session: Session) -> None:
    system_admin = _create_user(db_session, "unit-owner@example.test", is_superuser=True)
    org_admin = _create_user(db_session, "unit-admin@example.test")
    role = _create_role_with_permission(db_session, "unit_org_admin", "organizations.manage")
    organization_service = OrganizationService(db_session)

    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="unit-root",
        name="Unit root",
    )
    sibling = organization_service.create_child(
        parent_id=root.id,
        code="unit-sibling",
        name="Unit sibling",
        created_by=system_admin.id,
    )
    unit = organization_service.create_org_unit(
        organization_id=sibling.id,
        code="finance",
        name="Finance",
        unit_type="management",
        created_by=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=org_admin.id,
        role_id=role.id,
        organization_id=root.id,
        include_descendants=False,
        created_by=system_admin.id,
    )

    permissions = PermissionService(db_session)

    assert organization_service.list_org_units(sibling.id) == [unit]
    assert db_session.scalars(select(OrgUnit).where(OrgUnit.id == unit.id)).one() == unit
    assert permissions.get_organization_scope_ids(org_admin.id) == {root.id}
    assert permissions.can_see_organization(org_admin.id, root.id)
    assert not permissions.can_see_organization(org_admin.id, sibling.id)


def test_department_can_be_root_or_child_of_management_and_management_cannot_be_child(
    db_session: Session,
) -> None:
    system_admin = _create_user(db_session, "unit-hierarchy@example.test", is_superuser=True)
    organization_service = OrganizationService(db_session)
    organization = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="unit-hierarchy-root",
        name="Unit hierarchy root",
    )
    management = organization_service.create_org_unit_for_actor(
        actor_user_id=system_admin.id,
        organization_id=organization.id,
        code="education",
        name="Education management",
        unit_type="management",
    )
    department = organization_service.create_org_unit_for_actor(
        actor_user_id=system_admin.id,
        organization_id=organization.id,
        code="preschool",
        name="Preschool department",
        parent_id=management.id,
        unit_type="department",
    )
    root_department = organization_service.create_org_unit_for_actor(
        actor_user_id=system_admin.id,
        organization_id=organization.id,
        code="finance",
        name="Finance department",
        unit_type="department",
    )

    assert department.parent_id == management.id
    assert root_department.parent_id is None

    with pytest.raises(OrganizationTopologyError):
        organization_service.create_org_unit_for_actor(
            actor_user_id=system_admin.id,
            organization_id=organization.id,
            code="nested-management",
            name="Nested management",
            parent_id=management.id,
            unit_type="management",
        )
    with pytest.raises(OrganizationTopologyError):
        organization_service.create_org_unit_for_actor(
            actor_user_id=system_admin.id,
            organization_id=organization.id,
            code="nested-department",
            name="Nested department",
            parent_id=department.id,
            unit_type="department",
        )


def test_org_unit_department_parent_must_belong_to_the_same_organization(
    db_session: Session,
) -> None:
    system_admin = _create_user(db_session, "unit-parent@example.test", is_superuser=True)
    organization_service = OrganizationService(db_session)
    organization = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="unit-parent-root",
        name="Unit parent root",
    )
    other_organization = organization_service.create_child(
        parent_id=organization.id,
        code="unit-parent-child",
        name="Unit parent child",
        created_by=system_admin.id,
    )
    management = organization_service.create_org_unit_for_actor(
        actor_user_id=system_admin.id,
        organization_id=organization.id,
        code="foreign-management",
        name="Foreign management",
        unit_type="management",
    )

    with pytest.raises(OrganizationTopologyError):
        organization_service.create_org_unit_for_actor(
            actor_user_id=system_admin.id,
            organization_id=other_organization.id,
            code="foreign-department",
            name="Foreign department",
            parent_id=management.id,
            unit_type="department",
        )


def test_archiving_management_archives_active_direct_departments_and_audits_each_unit(
    db_session: Session,
) -> None:
    system_admin = _create_user(db_session, "unit-archive@example.test", is_superuser=True)
    organization_service = OrganizationService(db_session)
    organization = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="unit-archive-root",
        name="Unit archive root",
    )
    management = organization_service.create_org_unit_for_actor(
        actor_user_id=system_admin.id,
        organization_id=organization.id,
        code="archive-management",
        name="Archive management",
        unit_type="management",
    )
    department = organization_service.create_org_unit_for_actor(
        actor_user_id=system_admin.id,
        organization_id=organization.id,
        code="archive-department",
        name="Archive department",
        parent_id=management.id,
        unit_type="department",
    )

    archived_management = organization_service.archive_org_unit_for_actor(
        actor_user_id=system_admin.id,
        org_unit_id=management.id,
    )
    db_session.flush()

    assert archived_management.id == management.id
    for org_unit_id in (management.id, department.id):
        archived_unit = db_session.get(OrgUnit, org_unit_id)
        assert archived_unit is not None
        assert archived_unit.is_active is False
        assert archived_unit.archived_at is not None
    archived_event_ids = set(
        db_session.scalars(
            select(AuditEvent.object_id).where(
                AuditEvent.action == "archive",
                AuditEvent.object_type == "org_unit",
            )
        ).all()
    )
    assert {management.id, department.id} <= archived_event_ids


def test_canonical_roles_apply_hierarchical_scope_and_separate_access_flag(
    db_session: Session,
) -> None:
    BootstrapService(db_session).seed_defaults()
    system_admin = _create_user(db_session, "canonical-system@example.test", is_superuser=True)
    subordinate = _create_user(db_session, "canonical-subordinate@example.test")
    organization_admin = _create_user(db_session, "canonical-organization@example.test")
    access_delegate = _create_user(db_session, "canonical-access-delegate@example.test")
    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="canonical-root",
        name="Canonical root",
    )
    selected_child = organization_service.create_child(
        parent_id=root.id,
        code="canonical-selected",
        name="Canonical selected",
        created_by=system_admin.id,
    )
    descendant = organization_service.create_child(
        parent_id=selected_child.id,
        code="canonical-descendant",
        name="Canonical descendant",
        created_by=system_admin.id,
    )
    sibling = organization_service.create_child(
        parent_id=root.id,
        code="canonical-sibling",
        name="Canonical sibling",
        created_by=system_admin.id,
    )
    subordinate_role = db_session.scalars(
        select(Role).where(Role.code == "subordinate_organization_administrator")
    ).one()
    organization_admin_role = db_session.scalars(
        select(Role).where(Role.code == "organization_administrator")
    ).one()
    _grant_access(
        db_session,
        user_id=subordinate.id,
        role_id=subordinate_role.id,
        organization_id=selected_child.id,
        include_descendants=True,
        created_by=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=organization_admin.id,
        role_id=organization_admin_role.id,
        organization_id=None,
        include_descendants=True,
        created_by=system_admin.id,
    )
    access_delegate.can_manage_access = True
    db_session.flush()

    permissions = PermissionService(db_session)

    assert permissions.get_organization_scope_ids(subordinate.id) == {
        selected_child.id,
        descendant.id,
    }
    assert permissions.can_see_organization(subordinate.id, descendant.id)
    assert not permissions.can_see_organization(subordinate.id, sibling.id)
    assert permissions.get_organization_scope_ids(organization_admin.id) == {
        root.id,
        selected_child.id,
        descendant.id,
        sibling.id,
    }
    assert permissions.has_permission(access_delegate.id, "access_grants.manage")
    assert not permissions.has_permission(access_delegate.id, "registry.schema.manage")
