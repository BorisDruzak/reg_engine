from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest

from app.services.permissions import AccessDeniedError, ActorContext, PermissionService
from app.services.public_links import (
    PublicFieldValueWrite,
    PublicLinkAccessError,
    PublicLinkCreate,
    PublicLinkService,
)


class FakeAuditService:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []

    def record_user_event(self, actor: ActorContext, event: object) -> UUID:
        event_id = uuid4()
        self.events.append(
            {
                "id": event_id,
                "actor_type": "user",
                "actor_user_id": actor.user_id,
                "action": event.action,
            }
        )
        return event_id

    def record_public_link_event(self, public_link_id: UUID, event: object) -> UUID:
        event_id = uuid4()
        self.events.append(
            {
                "id": event_id,
                "actor_type": "public_link",
                "actor_public_link_id": public_link_id,
                "action": event.action,
            }
        )
        return event_id

    def record_system_event(self, event: object) -> UUID:
        event_id = uuid4()
        self.events.append(
            {
                "id": event_id,
                "actor_type": "system",
                "action": event.action,
            }
        )
        return event_id


class InMemoryPermissionRepository:
    def __init__(self, closure: set[tuple[UUID, UUID]]) -> None:
        self.closure = closure

    def is_descendant_or_self(self, *, ancestor_id: UUID, descendant_id: UUID) -> bool:
        return ancestor_id == descendant_id or (ancestor_id, descendant_id) in self.closure


class InMemoryPublicLinkRepository:
    def __init__(self) -> None:
        self.cards: dict[UUID, dict[str, object]] = {}
        self.fields: dict[UUID, dict[str, object]] = {}
        self.block_instances: dict[UUID, dict[str, object]] = {}
        self.links: dict[UUID, dict[str, object]] = {}
        self.field_values: dict[UUID, dict[str, object]] = {}
        self.field_value_items: dict[UUID, list[UUID]] = {}
        self.audit_events: list[dict[str, object]] = []
        self.reference_items: dict[UUID, dict[str, object]] = {}

    def add_card(
        self,
        *,
        organization_id: UUID,
        public_edit_enabled: bool = True,
    ) -> UUID:
        card_id = uuid4()
        self.cards[card_id] = {
            "id": card_id,
            "organization_id": organization_id,
            "public_edit_enabled": public_edit_enabled,
        }
        return card_id

    def add_field(
        self,
        *,
        field_type: str,
        block_public_editable: bool = True,
        field_public_editable: bool = True,
        options_source_id: UUID | None = None,
    ) -> tuple[UUID, UUID]:
        block_instance_id = uuid4()
        field_id = uuid4()
        self.block_instances[block_instance_id] = {
            "id": block_instance_id,
            "public_editable": block_public_editable,
        }
        self.fields[field_id] = {
            "id": field_id,
            "field_type": field_type,
            "public_editable": field_public_editable,
            "options_source_id": options_source_id,
        }
        return block_instance_id, field_id

    def add_reference_item(self, list_id: UUID, *, active: bool = True) -> UUID:
        item_id = uuid4()
        self.reference_items[item_id] = {
            "id": item_id,
            "list_id": list_id,
            "archived": not active,
        }
        return item_id

    def get_card(self, card_id: UUID) -> dict[str, object]:
        return self.cards[card_id]

    def create_public_link(
        self,
        *,
        card_id: UUID,
        token_hash: str,
        can_view: bool,
        can_edit: bool,
        expires_at: datetime,
        max_uses: int | None,
        created_by: UUID | None,
    ) -> UUID:
        link_id = uuid4()
        self.links[link_id] = {
            "id": link_id,
            "card_id": card_id,
            "token_hash": token_hash,
            "status": "active",
            "can_view": can_view,
            "can_edit": can_edit,
            "expires_at": expires_at,
            "max_uses": max_uses,
            "used_count": 0,
            "created_by": created_by,
        }
        return link_id

    def get_public_link_by_token_hash(self, token_hash: str) -> dict[str, object] | None:
        return next(
            (link for link in self.links.values() if link["token_hash"] == token_hash),
            None,
        )

    def get_public_link(self, link_id: UUID) -> dict[str, object]:
        return self.links[link_id]

    def list_public_links(self, card_id: UUID) -> list[dict[str, object]]:
        return [link for link in self.links.values() if link["card_id"] == card_id]

    def disable_public_link(self, *, link_id: UUID, disabled_at: datetime) -> None:
        self.links[link_id]["status"] = "disabled"
        self.links[link_id]["disabled_at"] = disabled_at

    def get_public_field_access(
        self,
        *,
        block_instance_id: UUID,
        field_id: UUID,
    ) -> dict[str, object]:
        return {
            "field_type": self.fields[field_id]["field_type"],
            "block_public_editable": self.block_instances[block_instance_id]["public_editable"],
            "field_public_editable": self.fields[field_id]["public_editable"],
            "options_source_id": self.fields[field_id]["options_source_id"],
        }

    def upsert_field_value(
        self,
        *,
        card_id: UUID,
        block_instance_id: UUID,
        field_id: UUID,
        values: dict[str, object],
        updated_by_public_link_id: UUID,
    ) -> UUID:
        value_id = uuid4()
        self.field_values[value_id] = {
            "id": value_id,
            "card_id": card_id,
            "block_instance_id": block_instance_id,
            "field_id": field_id,
            **values,
            "updated_by_public_link_id": updated_by_public_link_id,
        }
        return value_id

    def replace_field_value_items(
        self,
        *,
        field_value_id: UUID,
        reference_item_ids: tuple[UUID, ...],
    ) -> None:
        self.field_value_items[field_value_id] = list(reference_item_ids)

    def reference_item_belongs_to_list(
        self,
        *,
        reference_item_id: UUID,
        reference_list_id: UUID,
    ) -> bool:
        item = self.reference_items.get(reference_item_id)
        return item is not None and item["list_id"] == reference_list_id and not item["archived"]

    def increment_public_link_usage(self, link_id: UUID) -> None:
        self.links[link_id]["used_count"] = int(self.links[link_id]["used_count"]) + 1

    def record_public_link_audit(
        self,
        *,
        public_link_id: UUID,
        action: str,
        object_type: str,
        object_id: UUID | None,
        new_data: dict[str, object] | None,
    ) -> None:
        self.audit_events.append(
            {
                "public_link_id": public_link_id,
                "action": action,
                "object_type": object_type,
                "object_id": object_id,
                "new_data": new_data,
            }
        )


def test_admin_creates_public_link_with_raw_token_once_and_seven_day_expiry() -> None:
    now = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)
    repository = InMemoryPublicLinkRepository()
    audit = FakeAuditService()
    organization_id = uuid4()
    card_id = repository.add_card(organization_id=organization_id)
    service = PublicLinkService(
        repository,
        PermissionService(InMemoryPermissionRepository(set())),
        audit,
        now_provider=lambda: now,
        token_factory=lambda: "raw-token",
    )
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=organization_id)

    created = service.create_link(actor, PublicLinkCreate(card_id=card_id))

    stored = repository.links[created.link_id]
    assert created.raw_token == "raw-token"
    assert stored["token_hash"] == service.hash_token("raw-token")
    assert stored["token_hash"] != created.raw_token
    assert stored["expires_at"] == now + timedelta(days=7)
    assert audit.events[0]["action"] == "public_link.create"


def test_admin_lists_links_and_public_get_validates_view_access() -> None:
    now = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)
    repository = InMemoryPublicLinkRepository()
    organization_id = uuid4()
    card_id = repository.add_card(organization_id=organization_id)
    service = PublicLinkService(
        repository,
        PermissionService(InMemoryPermissionRepository(set())),
        now_provider=lambda: now,
        token_factory=lambda: "raw-token",
    )
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=organization_id)
    created = service.create_link(actor, PublicLinkCreate(card_id=card_id))

    links = service.list_links(actor, card_id)
    public_card = service.get_public_card(created.raw_token)

    assert links[0].id == created.link_id
    assert links[0].card_id == card_id
    assert public_card.card_id == card_id
    assert public_card.can_view is True
    assert public_card.can_edit is True


def test_public_link_edits_public_field_and_writes_audit() -> None:
    now = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)
    repository = InMemoryPublicLinkRepository()
    audit = FakeAuditService()
    organization_id = uuid4()
    card_id = repository.add_card(organization_id=organization_id)
    block_instance_id, field_id = repository.add_field(field_type="text")
    service = PublicLinkService(
        repository,
        PermissionService(InMemoryPermissionRepository(set())),
        audit,
        now_provider=lambda: now,
        token_factory=lambda: "raw-token",
    )
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=organization_id)
    created = service.create_link(actor, PublicLinkCreate(card_id=card_id))

    value_id = service.update_value(
        created.raw_token,
        PublicFieldValueWrite(
            block_instance_id=block_instance_id,
            field_id=field_id,
            value="public text",
        ),
    )

    assert repository.field_values[value_id]["value_text"] == "public text"
    assert repository.links[created.link_id]["used_count"] == 1
    assert audit.events[-1]["action"] == "public_link.value_update"


def test_public_link_select_value_must_belong_to_configured_reference_list() -> None:
    now = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)
    repository = InMemoryPublicLinkRepository()
    organization_id = uuid4()
    card_id = repository.add_card(organization_id=organization_id)
    allowed_list_id = uuid4()
    other_list_id = uuid4()
    block_instance_id, field_id = repository.add_field(
        field_type="select",
        options_source_id=allowed_list_id,
    )
    wrong_item_id = repository.add_reference_item(other_list_id)
    service = PublicLinkService(
        repository,
        PermissionService(InMemoryPermissionRepository(set())),
        now_provider=lambda: now,
        token_factory=lambda: "raw-token",
    )
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=organization_id)
    created = service.create_link(actor, PublicLinkCreate(card_id=card_id))

    with pytest.raises(PublicLinkAccessError, match="reference list"):
        service.update_value(
            created.raw_token,
            PublicFieldValueWrite(
                block_instance_id=block_instance_id,
                field_id=field_id,
                value=wrong_item_id,
            ),
        )

    assert repository.field_values == {}
    assert repository.links[created.link_id]["used_count"] == 0


def test_public_link_cannot_edit_when_card_public_edit_disabled() -> None:
    now = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)
    repository = InMemoryPublicLinkRepository()
    organization_id = uuid4()
    card_id = repository.add_card(organization_id=organization_id, public_edit_enabled=False)
    block_instance_id, field_id = repository.add_field(field_type="text")
    service = PublicLinkService(
        repository,
        PermissionService(InMemoryPermissionRepository(set())),
        now_provider=lambda: now,
        token_factory=lambda: "raw-token",
    )
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=organization_id)
    created = service.create_link(actor, PublicLinkCreate(card_id=card_id))

    with pytest.raises(PublicLinkAccessError):
        service.update_value(
            created.raw_token,
            PublicFieldValueWrite(
                block_instance_id=block_instance_id,
                field_id=field_id,
                value="blocked",
            ),
        )


def test_public_link_cannot_edit_admin_only_block_or_non_public_field() -> None:
    now = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)
    repository = InMemoryPublicLinkRepository()
    organization_id = uuid4()
    card_id = repository.add_card(organization_id=organization_id)
    admin_block_instance_id, admin_block_field_id = repository.add_field(
        field_type="text",
        block_public_editable=False,
    )
    field_block_instance_id, private_field_id = repository.add_field(
        field_type="text",
        field_public_editable=False,
    )
    service = PublicLinkService(
        repository,
        PermissionService(InMemoryPermissionRepository(set())),
        now_provider=lambda: now,
        token_factory=lambda: "raw-token",
    )
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=organization_id)
    created = service.create_link(actor, PublicLinkCreate(card_id=card_id))

    with pytest.raises(PublicLinkAccessError):
        service.update_value(
            created.raw_token,
            PublicFieldValueWrite(
                block_instance_id=admin_block_instance_id,
                field_id=admin_block_field_id,
                value="blocked",
            ),
        )

    with pytest.raises(PublicLinkAccessError):
        service.update_value(
            created.raw_token,
            PublicFieldValueWrite(
                block_instance_id=field_block_instance_id,
                field_id=private_field_id,
                value="blocked",
            ),
        )


def test_public_link_rejects_disabled_expired_and_overused_links() -> None:
    now = datetime(2026, 6, 27, 12, 0, tzinfo=UTC)
    repository = InMemoryPublicLinkRepository()
    organization_id = uuid4()
    card_id = repository.add_card(organization_id=organization_id)
    block_instance_id, field_id = repository.add_field(field_type="text")
    service = PublicLinkService(
        repository,
        PermissionService(InMemoryPermissionRepository(set())),
        now_provider=lambda: now,
        token_factory=lambda: "raw-token",
    )
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=organization_id)
    disabled = service.create_link(actor, PublicLinkCreate(card_id=card_id))
    service.disable_link(actor, disabled.link_id)
    expired = service.create_link(
        actor,
        PublicLinkCreate(card_id=card_id, expires_at=now - timedelta(seconds=1)),
    )
    overused = service.create_link(actor, PublicLinkCreate(card_id=card_id, max_uses=0))
    view_denied = service.create_link(
        actor,
        PublicLinkCreate(card_id=card_id, can_view=False),
    )

    for raw_token in (
        disabled.raw_token,
        expired.raw_token,
        overused.raw_token,
        view_denied.raw_token,
    ):
        with pytest.raises(PublicLinkAccessError):
            service.update_value(
                raw_token,
                PublicFieldValueWrite(
                    block_instance_id=block_instance_id,
                    field_id=field_id,
                    value="blocked",
                ),
            )


def test_org_admin_cannot_create_or_disable_link_outside_scope() -> None:
    repository = InMemoryPublicLinkRepository()
    own_org_id = uuid4()
    sibling_org_id = uuid4()
    card_id = repository.add_card(organization_id=sibling_org_id)
    service = PublicLinkService(
        repository,
        PermissionService(InMemoryPermissionRepository(set())),
        token_factory=lambda: "raw-token",
    )
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=own_org_id)

    with pytest.raises(AccessDeniedError):
        service.create_link(actor, PublicLinkCreate(card_id=card_id))
