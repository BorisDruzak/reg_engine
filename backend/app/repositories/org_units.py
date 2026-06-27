from collections.abc import Callable
from datetime import UTC, datetime
from typing import Protocol, cast
from uuid import UUID, uuid4

from sqlalchemy import select

from app.models.organization import OrgUnit


class ScalarResultLike(Protocol):
    def all(self) -> list[object]:
        """Return scalar result values."""


class ExecuteResultLike(Protocol):
    def scalars(self) -> ScalarResultLike:
        """Return scalar result wrapper."""


class OrgUnitSessionLike(Protocol):
    def add(self, instance: object) -> None:
        """Stage an ORM instance for persistence."""

    def flush(self) -> None:
        """Flush pending ORM changes."""

    def execute(self, statement: object) -> ExecuteResultLike:
        """Execute a SQLAlchemy statement."""

    def get(self, model: type[object], identity: object) -> object | None:
        """Load an ORM instance by primary key."""


class SQLAlchemyOrgUnitRepository:
    def __init__(
        self,
        session: OrgUnitSessionLike,
        *,
        now_provider: Callable[[], datetime] | None = None,
    ) -> None:
        self.session = session
        self.now_provider = now_provider or (lambda: datetime.now(UTC))

    def create_org_unit(
        self,
        *,
        organization_id: UUID,
        code: str,
        name: str,
        parent_id: UUID | None,
        created_by: UUID | None,
    ) -> UUID:
        org_unit_id = uuid4()
        org_unit = OrgUnit(
            id=org_unit_id,
            organization_id=organization_id,
            code=code,
            name=name,
            parent_id=parent_id,
            is_active=True,
            created_by=created_by,
        )
        self.session.add(org_unit)
        self.session.flush()
        return org_unit_id

    def list_by_organization(self, organization_id: UUID) -> list[dict[str, object]]:
        result = self.session.execute(
            select(OrgUnit)
            .where(OrgUnit.organization_id == organization_id)
            .where(OrgUnit.archived_at.is_(None))
            .where(OrgUnit.is_active.is_(True))
            .order_by(OrgUnit.name)
        )
        org_units = result.scalars().all()
        return [self._to_dict(cast(OrgUnit, org_unit)) for org_unit in org_units]

    def archive(self, org_unit_id: UUID) -> None:
        org_unit = self.session.get(OrgUnit, org_unit_id)
        if org_unit is None:
            raise LookupError(f"Org unit not found: {org_unit_id}")
        typed_org_unit = cast(OrgUnit, org_unit)
        typed_org_unit.is_active = False
        typed_org_unit.archived_at = self.now_provider()
        self.session.flush()

    def _to_dict(self, org_unit: OrgUnit) -> dict[str, object]:
        return {
            "id": org_unit.id,
            "organization_id": org_unit.organization_id,
            "code": org_unit.code,
            "name": org_unit.name,
            "parent_id": org_unit.parent_id,
            "archived": org_unit.archived_at is not None,
        }
