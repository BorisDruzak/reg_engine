from uuid import UUID, uuid4

from app.services.org_units import OrgUnitCreate, OrgUnitService


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
