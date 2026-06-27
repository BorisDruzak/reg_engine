from collections.abc import Callable
from datetime import UTC, datetime
from typing import Protocol, cast
from uuid import UUID, uuid4

from sqlalchemy import and_, or_, select

from app.models.organization import OrganizationClosure
from app.models.reference import ReferenceItem, ReferenceList


class ScalarResultLike(Protocol):
    def all(self) -> list[object]:
        """Return scalar result values."""


class ExecuteResultLike(Protocol):
    def scalars(self) -> ScalarResultLike:
        """Return scalar result wrapper."""


class ReferenceListSessionLike(Protocol):
    def add(self, instance: object) -> None:
        """Stage an ORM instance for persistence."""

    def flush(self) -> None:
        """Flush pending ORM changes."""

    def execute(self, statement: object) -> ExecuteResultLike:
        """Execute a SQLAlchemy statement."""

    def get(self, model: type[object], identity: object) -> object | None:
        """Load an ORM instance by primary key."""


class SQLAlchemyReferenceListRepository:
    def __init__(
        self,
        session: ReferenceListSessionLike,
        *,
        now_provider: Callable[[], datetime] | None = None,
    ) -> None:
        self.session = session
        self.now_provider = now_provider or (lambda: datetime.now(UTC))

    def create_reference_list(
        self,
        *,
        registry_id: UUID | None,
        owner_organization_id: UUID | None,
        code: str,
        name: str,
        locked_for_descendants: bool,
        inherit_to_descendants: bool,
        created_by: UUID | None,
    ) -> UUID:
        list_id = uuid4()
        reference_list = ReferenceList(
            id=list_id,
            registry_id=registry_id,
            owner_organization_id=owner_organization_id,
            code=code,
            name=name,
            scope_mode="global" if owner_organization_id is None else "organization",
            inherit_to_descendants=inherit_to_descendants,
            locked_for_descendants=locked_for_descendants,
            managed_by_system_only=False,
            is_active=True,
            created_by=created_by,
        )
        self.session.add(reference_list)
        self.session.flush()
        return list_id

    def create_reference_item(
        self,
        *,
        list_id: UUID,
        code: str,
        label: str,
        created_by: UUID | None,
    ) -> UUID:
        item_id = uuid4()
        reference_item = ReferenceItem(
            id=item_id,
            list_id=list_id,
            code=code,
            label=label,
            position=0,
            is_active=True,
            created_by=created_by,
        )
        self.session.add(reference_item)
        self.session.flush()
        return item_id

    def get_reference_list(self, list_id: UUID) -> dict[str, object]:
        reference_list = self.session.get(ReferenceList, list_id)
        if reference_list is None:
            raise LookupError(f"Reference list not found: {list_id}")
        return self._list_to_dict(cast(ReferenceList, reference_list))

    def get_reference_item(self, item_id: UUID) -> dict[str, object]:
        reference_item = self.session.get(ReferenceItem, item_id)
        if reference_item is None:
            raise LookupError(f"Reference item not found: {item_id}")
        return self._item_to_dict(cast(ReferenceItem, reference_item))

    def inherited_list_ids_for(self, organization_id: UUID) -> set[UUID]:
        result = self.session.execute(
            select(ReferenceList.id)
            .outerjoin(
                OrganizationClosure,
                and_(
                    ReferenceList.owner_organization_id == OrganizationClosure.ancestor_id,
                    OrganizationClosure.descendant_id == organization_id,
                ),
            )
            .where(ReferenceList.archived_at.is_(None))
            .where(ReferenceList.is_active.is_(True))
            .where(
                or_(
                    ReferenceList.owner_organization_id.is_(None),
                    ReferenceList.owner_organization_id == organization_id,
                    and_(
                        ReferenceList.inherit_to_descendants.is_(True),
                        OrganizationClosure.descendant_id == organization_id,
                    ),
                )
            )
        )
        return {cast(UUID, value) for value in result.scalars().all()}

    def archive_reference_list(self, list_id: UUID) -> None:
        reference_list = self.session.get(ReferenceList, list_id)
        if reference_list is None:
            raise LookupError(f"Reference list not found: {list_id}")
        typed_list = cast(ReferenceList, reference_list)
        typed_list.is_active = False
        typed_list.archived_at = self.now_provider()
        self.session.flush()

    def archive_reference_item(self, item_id: UUID) -> None:
        reference_item = self.session.get(ReferenceItem, item_id)
        if reference_item is None:
            raise LookupError(f"Reference item not found: {item_id}")
        typed_item = cast(ReferenceItem, reference_item)
        typed_item.is_active = False
        typed_item.archived_at = self.now_provider()
        self.session.flush()

    def update_reference_list(
        self,
        list_id: UUID,
        *,
        code: str | None,
        name: str | None,
    ) -> None:
        reference_list = self._get_reference_list_model(list_id)
        if code is not None:
            reference_list.code = code
        if name is not None:
            reference_list.name = name
        self.session.flush()

    def update_reference_item(
        self,
        item_id: UUID,
        *,
        code: str | None,
        label: str | None,
    ) -> None:
        reference_item = self._get_reference_item_model(item_id)
        if code is not None:
            reference_item.code = code
        if label is not None:
            reference_item.label = label
        self.session.flush()

    def _get_reference_list_model(self, list_id: UUID) -> ReferenceList:
        reference_list = self.session.get(ReferenceList, list_id)
        if reference_list is None:
            raise LookupError(f"Reference list not found: {list_id}")
        return cast(ReferenceList, reference_list)

    def _get_reference_item_model(self, item_id: UUID) -> ReferenceItem:
        reference_item = self.session.get(ReferenceItem, item_id)
        if reference_item is None:
            raise LookupError(f"Reference item not found: {item_id}")
        return cast(ReferenceItem, reference_item)

    def _list_to_dict(self, reference_list: ReferenceList) -> dict[str, object]:
        return {
            "id": reference_list.id,
            "registry_id": reference_list.registry_id,
            "owner_organization_id": reference_list.owner_organization_id,
            "code": reference_list.code,
            "name": reference_list.name,
            "locked_for_descendants": reference_list.locked_for_descendants,
            "inherit_to_descendants": reference_list.inherit_to_descendants,
            "archived": reference_list.archived_at is not None,
        }

    def _item_to_dict(self, reference_item: ReferenceItem) -> dict[str, object]:
        return {
            "id": reference_item.id,
            "list_id": reference_item.list_id,
            "code": reference_item.code,
            "label": reference_item.label,
            "archived": reference_item.archived_at is not None,
        }
