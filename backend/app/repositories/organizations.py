from collections.abc import Sequence
from typing import Protocol, cast
from uuid import UUID, uuid4

from sqlalchemy import select

from app.models.organization import Organization, OrganizationClosure


class ScalarResultLike(Protocol):
    def all(self) -> list[object]:
        """Return scalar result values."""


class ExecuteResultLike(Protocol):
    def all(self) -> list[object]:
        """Return result rows."""

    def scalars(self) -> ScalarResultLike:
        """Return scalar result wrapper."""


class OrganizationSessionLike(Protocol):
    def add(self, instance: object) -> None:
        """Stage an ORM instance for persistence."""

    def add_all(self, instances: Sequence[object]) -> None:
        """Stage ORM instances for persistence."""

    def flush(self) -> None:
        """Flush pending ORM changes."""

    def execute(self, statement: object) -> ExecuteResultLike:
        """Execute a SQLAlchemy statement."""

    def get(self, model: type[object], identity: object) -> object | None:
        """Load an ORM instance by primary key."""


class SQLAlchemyOrganizationRepository:
    def __init__(self, session: OrganizationSessionLike) -> None:
        self.session = session

    def create_organization(
        self,
        *,
        code: str,
        name: str,
        parent_id: UUID | None,
        created_by: UUID | None,
    ) -> UUID:
        organization_id = uuid4()
        organization = Organization(
            id=organization_id,
            code=code,
            name=name,
            parent_id=parent_id,
            type="organization",
            is_active=True,
            created_by=created_by,
        )
        self.session.add(organization)
        self.session.flush()
        return organization_id

    def add_closure_rows(self, rows: list[tuple[UUID, UUID, int]]) -> None:
        closure_rows = [
            OrganizationClosure(
                ancestor_id=ancestor_id,
                descendant_id=descendant_id,
                depth=depth,
            )
            for ancestor_id, descendant_id, depth in rows
        ]
        self.session.add_all(closure_rows)
        self.session.flush()

    def ancestor_rows_for(self, organization_id: UUID) -> list[tuple[UUID, int]]:
        result = self.session.execute(
            select(OrganizationClosure.ancestor_id, OrganizationClosure.depth).where(
                OrganizationClosure.descendant_id == organization_id
            )
        )
        rows = cast(list[tuple[UUID, int]], result.all())
        return [(ancestor_id, int(depth)) for ancestor_id, depth in rows]

    def is_descendant_or_self(self, *, ancestor_id: UUID, descendant_id: UUID) -> bool:
        return (
            self.session.get(
                OrganizationClosure,
                (ancestor_id, descendant_id),
            )
            is not None
        )

    def subtree_ids(self, organization_id: UUID) -> set[UUID]:
        result = self.session.execute(
            select(OrganizationClosure.descendant_id).where(
                OrganizationClosure.ancestor_id == organization_id
            )
        )
        values = result.scalars().all()
        return {cast(UUID, value) for value in values}
