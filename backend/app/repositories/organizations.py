from collections.abc import Callable, Sequence
from datetime import UTC, datetime
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
    def __init__(
        self,
        session: OrganizationSessionLike,
        *,
        now_provider: Callable[[], datetime] | None = None,
    ) -> None:
        self.session = session
        self.now_provider = now_provider or (lambda: datetime.now(UTC))

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

    def get_organization(self, organization_id: UUID) -> dict[str, object]:
        organization = self.session.get(Organization, organization_id)
        if organization is None:
            raise LookupError(f"Organization not found: {organization_id}")
        return self._organization_to_dict(cast(Organization, organization))

    def list_organizations(self, organization_ids: set[UUID] | None) -> list[dict[str, object]]:
        statement = select(Organization).order_by(Organization.name, Organization.code)
        if organization_ids is not None:
            statement = statement.where(Organization.id.in_(organization_ids))
        result = self.session.execute(statement)
        return [
            self._organization_to_dict(cast(Organization, organization))
            for organization in result.scalars().all()
        ]

    def update_organization(
        self,
        *,
        organization_id: UUID,
        code: str | None,
        name: str | None,
    ) -> None:
        organization = self._get_organization_model(organization_id)
        if code is not None:
            organization.code = code
        if name is not None:
            organization.name = name
        self.session.flush()

    def archive_organization(self, organization_id: UUID) -> None:
        organization = self._get_organization_model(organization_id)
        organization.is_active = False
        organization.archived_at = self.now_provider()
        self.session.flush()

    def _get_organization_model(self, organization_id: UUID) -> Organization:
        organization = self.session.get(Organization, organization_id)
        if organization is None:
            raise LookupError(f"Organization not found: {organization_id}")
        return cast(Organization, organization)

    def _organization_to_dict(self, organization: Organization) -> dict[str, object]:
        return {
            "id": organization.id,
            "code": organization.code,
            "name": organization.name,
            "parent_id": organization.parent_id,
            "archived": organization.archived_at is not None or not organization.is_active,
        }
