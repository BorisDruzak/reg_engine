from uuid import UUID, uuid4

from app.services.org_units import OrgUnitCreate, OrgUnitService, OrgUnitUpdate


class InMemoryOrgUnitRepository:
    def __init__(self) -> None:
        self.units: dict[UUID, dict[str, object]] = {}

    def create_org_unit(
        self,
        *,
        organization_id: UUID,
        code: str,
        name: str,
        parent_id: UUID | None,
        created_by: UUID | None,
    ) -> UUID:
        unit_id = uuid4()
        self.units[unit_id] = {
            "id": unit_id,
            "organization_id": organization_id,
            "code": code,
            "name": name,
            "parent_id": parent_id,
            "created_by": created_by,
            "archived": False,
        }
        return unit_id

    def list_by_organization(self, organization_id: UUID) -> list[dict[str, object]]:
        return [
            unit
            for unit in self.units.values()
            if unit["organization_id"] == organization_id and not unit["archived"]
        ]

    def get(self, org_unit_id: UUID) -> dict[str, object]:
        return self.units[org_unit_id]

    def update(
        self,
        org_unit_id: UUID,
        *,
        code: str | None,
        name: str | None,
        parent_id: UUID | None,
        parent_id_set: bool,
    ) -> None:
        if code is not None:
            self.units[org_unit_id]["code"] = code
        if name is not None:
            self.units[org_unit_id]["name"] = name
        if parent_id_set:
            self.units[org_unit_id]["parent_id"] = parent_id

    def archive(self, org_unit_id: UUID) -> None:
        self.units[org_unit_id]["archived"] = True


def test_org_units_are_listed_by_organization_and_do_not_cross_orgs() -> None:
    repository = InMemoryOrgUnitRepository()
    service = OrgUnitService(repository)
    user_id = uuid4()
    first_org_id = uuid4()
    second_org_id = uuid4()

    first_unit_id = service.create(
        organization_id=first_org_id,
        data=OrgUnitCreate(code="hr", name="HR"),
        created_by=user_id,
    )
    service.create(
        organization_id=second_org_id,
        data=OrgUnitCreate(code="it", name="IT"),
        created_by=user_id,
    )

    first_org_units = service.list_by_organization(first_org_id)

    assert [unit["id"] for unit in first_org_units] == [first_unit_id]


def test_archived_org_unit_is_not_returned_in_active_list() -> None:
    repository = InMemoryOrgUnitRepository()
    service = OrgUnitService(repository)
    organization_id = uuid4()
    unit_id = service.create(
        organization_id=organization_id,
        data=OrgUnitCreate(code="hr", name="HR"),
        created_by=uuid4(),
    )

    service.archive(unit_id)

    assert service.list_by_organization(organization_id) == []


def test_org_unit_can_be_read_and_updated_without_changing_parent_by_default() -> None:
    repository = InMemoryOrgUnitRepository()
    service = OrgUnitService(repository)
    organization_id = uuid4()
    parent_id = uuid4()
    unit_id = service.create(
        organization_id=organization_id,
        data=OrgUnitCreate(code="ops", name="Ops", parent_id=parent_id),
        created_by=uuid4(),
    )

    before = service.get(unit_id)
    updated = service.update(unit_id, OrgUnitUpdate(name="Operations"))

    assert before["parent_id"] == parent_id
    assert updated["name"] == "Operations"
    assert updated["code"] == "ops"
    assert updated["parent_id"] == parent_id


def test_org_unit_update_can_clear_parent_when_explicitly_set() -> None:
    repository = InMemoryOrgUnitRepository()
    service = OrgUnitService(repository)
    organization_id = uuid4()
    unit_id = service.create(
        organization_id=organization_id,
        data=OrgUnitCreate(code="ops", name="Ops", parent_id=uuid4()),
        created_by=uuid4(),
    )

    updated = service.update(unit_id, OrgUnitUpdate(parent_id=None, parent_id_set=True))

    assert updated["parent_id"] is None
