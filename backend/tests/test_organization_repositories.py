from datetime import UTC, datetime
from uuid import uuid4

from app.models.organization import Organization, OrganizationClosure, OrgUnit
from app.repositories.org_units import SQLAlchemyOrgUnitRepository
from app.repositories.organizations import SQLAlchemyOrganizationRepository


class FakeScalarResult:
    def __init__(self, values: list[object]) -> None:
        self.values = values

    def all(self) -> list[object]:
        return self.values


class FakeResult:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    def all(self) -> list[object]:
        return self.rows

    def scalars(self) -> FakeScalarResult:
        return FakeScalarResult(self.rows)


class FakeSession:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.flushed = False
        self.execute_results: list[FakeResult] = []
        self.get_results: dict[tuple[type[object], object], object] = {}

    def add(self, instance: object) -> None:
        self.added.append(instance)

    def add_all(self, instances: list[object]) -> None:
        self.added.extend(instances)

    def flush(self) -> None:
        self.flushed = True

    def execute(self, statement: object) -> FakeResult:
        _ = statement
        return self.execute_results.pop(0)

    def get(self, model: type[object], identity: object) -> object | None:
        return self.get_results.get((model, identity))


def test_sqlalchemy_organization_repository_creates_organization_and_closure_rows() -> None:
    session = FakeSession()
    archived_at = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)
    repository = SQLAlchemyOrganizationRepository(session, now_provider=lambda: archived_at)
    created_by = uuid4()
    parent_id = uuid4()

    organization_id = repository.create_organization(
        code="child",
        name="Child",
        parent_id=parent_id,
        created_by=created_by,
    )
    repository.add_closure_rows(
        [
            (organization_id, organization_id, 0),
            (parent_id, organization_id, 1),
        ]
    )

    assert session.flushed is True
    organization = session.added[0]
    assert isinstance(organization, Organization)
    assert organization.id == organization_id
    assert organization.code == "child"
    assert organization.name == "Child"
    assert organization.parent_id == parent_id
    assert organization.created_by == created_by
    closure_rows = session.added[1:]
    assert [(row.ancestor_id, row.descendant_id, row.depth) for row in closure_rows] == [
        (organization_id, organization_id, 0),
        (parent_id, organization_id, 1),
    ]
    assert all(isinstance(row, OrganizationClosure) for row in closure_rows)

    session.get_results[(Organization, organization_id)] = organization
    session.execute_results = [FakeResult([organization])]
    assert repository.get_organization(organization_id) == {
        "id": organization_id,
        "code": "child",
        "name": "Child",
        "parent_id": parent_id,
        "archived": False,
    }
    assert repository.list_organizations({organization_id}) == [
        {
            "id": organization_id,
            "code": "child",
            "name": "Child",
            "parent_id": parent_id,
            "archived": False,
        }
    ]
    repository.update_organization(
        organization_id=organization_id,
        code="updated",
        name="Updated",
    )
    assert organization.code == "updated"
    assert organization.name == "Updated"
    repository.archive_organization(organization_id)
    assert organization.is_active is False
    assert organization.archived_at == archived_at


def test_sqlalchemy_organization_repository_reads_closure_scope() -> None:
    session = FakeSession()
    parent_id = uuid4()
    child_id = uuid4()
    session.execute_results = [
        FakeResult([(parent_id, 0)]),
        FakeResult([parent_id, child_id]),
    ]
    session.get_results[(OrganizationClosure, (parent_id, child_id))] = OrganizationClosure(
        ancestor_id=parent_id,
        descendant_id=child_id,
        depth=1,
    )
    repository = SQLAlchemyOrganizationRepository(session)

    assert repository.ancestor_rows_for(parent_id) == [(parent_id, 0)]
    assert repository.is_descendant_or_self(ancestor_id=parent_id, descendant_id=child_id) is True
    assert repository.subtree_ids(parent_id) == {parent_id, child_id}


def test_sqlalchemy_org_unit_repository_creates_lists_and_archives_units() -> None:
    session = FakeSession()
    archived_at = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)
    repository = SQLAlchemyOrgUnitRepository(session, now_provider=lambda: archived_at)
    organization_id = uuid4()
    parent_id = uuid4()
    created_by = uuid4()

    org_unit_id = repository.create_org_unit(
        organization_id=organization_id,
        code="ops",
        name="Ops",
        parent_id=parent_id,
        created_by=created_by,
    )
    org_unit = session.added[0]
    assert isinstance(org_unit, OrgUnit)
    assert org_unit.id == org_unit_id
    assert org_unit.organization_id == organization_id
    assert org_unit.code == "ops"
    assert org_unit.name == "Ops"
    assert org_unit.parent_id == parent_id
    assert org_unit.created_by == created_by

    session.execute_results = [FakeResult([org_unit])]
    assert repository.list_by_organization(organization_id) == [
        {
            "id": org_unit_id,
            "organization_id": organization_id,
            "code": "ops",
            "name": "Ops",
            "parent_id": parent_id,
            "archived": False,
        }
    ]

    session.get_results[(OrgUnit, org_unit_id)] = org_unit
    repository.archive(org_unit_id)

    assert org_unit.is_active is False
    assert org_unit.archived_at == archived_at
