from uuid import UUID, uuid4

from app.services.audit import AuditEventCreate
from app.services.cards import CardCreate, CardService, CardTransfer, FieldValueWrite
from app.services.org_units import OrgUnitCreate, OrgUnitService
from app.services.organizations import OrganizationCreate, OrganizationService
from app.services.permissions import ActorContext, PermissionService
from app.services.public_links import PublicFieldValueWrite, PublicLinkCreate, PublicLinkService
from app.services.reference_lists import (
    ReferenceItemCreate,
    ReferenceListCreate,
    ReferenceListService,
)
from app.services.registry_schema import FieldCreate, RegistryCreate, RegistrySchemaService
from tests.test_card_service import InMemoryCardRepository, InMemoryPermissionRepository
from tests.test_org_unit_service import InMemoryOrgUnitRepository
from tests.test_organization_service import InMemoryOrganizationRepository
from tests.test_public_link_service import InMemoryPublicLinkRepository
from tests.test_reference_list_service import InMemoryReferenceListRepository
from tests.test_registry_schema_service import InMemoryRegistrySchemaRepository


class FakeAuditService:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []

    def record_user_event(self, actor: ActorContext, event: AuditEventCreate) -> UUID:
        event_id = uuid4()
        self.events.append(
            {
                "id": event_id,
                "actor_type": "user",
                "actor_user_id": actor.user_id,
                "action": event.action,
                "object_type": event.object_type,
                "object_id": event.object_id,
                "old_data": event.old_data,
                "new_data": event.new_data,
                "source": event.source,
            }
        )
        return event_id

    def record_public_link_event(
        self,
        public_link_id: UUID,
        event: AuditEventCreate,
    ) -> UUID:
        event_id = uuid4()
        self.events.append(
            {
                "id": event_id,
                "actor_type": "public_link",
                "actor_public_link_id": public_link_id,
                "action": event.action,
                "object_type": event.object_type,
                "object_id": event.object_id,
                "old_data": event.old_data,
                "new_data": event.new_data,
                "source": "public_link",
            }
        )
        return event_id

    def record_system_event(self, event: AuditEventCreate) -> UUID:
        event_id = uuid4()
        self.events.append(
            {
                "id": event_id,
                "actor_type": "system",
                "action": event.action,
                "object_type": event.object_type,
                "object_id": event.object_id,
                "old_data": event.old_data,
                "new_data": event.new_data,
                "source": "system",
            }
        )
        return event_id


def test_organization_and_org_unit_changes_write_audit_events() -> None:
    audit = FakeAuditService()
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    organization_service = OrganizationService(InMemoryOrganizationRepository(), audit)
    organization_id = organization_service.create_root(
        actor,
        OrganizationCreate(code="root", name="Root"),
    )
    org_unit_service = OrgUnitService(InMemoryOrgUnitRepository(), audit)
    org_unit_id = org_unit_service.create(
        organization_id=organization_id,
        data=OrgUnitCreate(code="ops", name="Ops"),
        created_by=actor.user_id,
        actor=actor,
    )
    org_unit_service.archive(org_unit_id, actor=actor)

    assert [event["action"] for event in audit.events] == [
        "organization.create",
        "org_unit.create",
        "org_unit.archive",
    ]


def test_registry_schema_and_reference_changes_write_audit_events() -> None:
    audit = FakeAuditService()
    actor = ActorContext(user_id=uuid4(), is_superuser=True, grants=())
    registry_service = RegistrySchemaService(InMemoryRegistrySchemaRepository(), audit)
    registry_id = registry_service.create_registry(
        actor,
        RegistryCreate(code="reg", name="Registry"),
    )
    block_id = registry_service.create_block(
        actor,
        registry_id=registry_id,
        code="main",
        title="Main",
    )
    field_id = registry_service.create_field(
        actor,
        block_id=block_id,
        data=FieldCreate(code="status", label="Status", field_type="select"),
    )
    registry_service.archive_field(actor, field_id)

    reference_service = ReferenceListService(InMemoryReferenceListRepository(set()), audit)
    list_id = reference_service.create_list(
        actor,
        ReferenceListCreate(code="statuses", name="Statuses"),
    )
    item_id = reference_service.create_item(
        actor,
        list_id=list_id,
        data=ReferenceItemCreate(code="active", label="Active"),
    )
    reference_service.archive_item(actor, item_id)

    assert [event["action"] for event in audit.events] == [
        "registry.create",
        "form_block.create",
        "form_field.create",
        "form_field.archive",
        "reference_list.create",
        "reference_item.create",
        "reference_item.archive",
    ]


def test_card_and_public_link_changes_write_audit_events() -> None:
    audit = FakeAuditService()
    permission_service = PermissionService(InMemoryPermissionRepository(set()))
    card_repository = InMemoryCardRepository()
    card_service = CardService(card_repository, permission_service, audit)
    organization_id = uuid4()
    actor = ActorContext.for_org_admin(user_id=uuid4(), organization_id=organization_id)
    card_id = card_service.create_card(
        actor,
        CardCreate(
            registry_id=uuid4(),
            organization_id=organization_id,
            org_unit_id=None,
            display_name="Card",
        ),
    )
    block_instance_id = card_service.create_block_instance(actor, card_id=card_id, block_id=uuid4())
    field_id = card_repository.add_field("text")
    card_service.write_field_value(
        actor,
        FieldValueWrite(
            card_id=card_id,
            block_instance_id=block_instance_id,
            field_id=field_id,
            value="value",
        ),
    )
    card_service.archive_card(actor, card_id=card_id)

    target_organization_id = uuid4()
    transfer_permission_service = PermissionService(
        InMemoryPermissionRepository({(organization_id, target_organization_id)})
    )
    transfer_service = CardService(card_repository, transfer_permission_service, audit)
    transfer_service.transfer_card(
        actor,
        CardTransfer(
            source_card_id=card_id,
            target_organization_id=target_organization_id,
            target_org_unit_id=None,
        ),
    )

    public_repository = InMemoryPublicLinkRepository()
    public_card_id = public_repository.add_card(organization_id=organization_id)
    public_block_instance_id, public_field_id = public_repository.add_field(field_type="text")
    public_service = PublicLinkService(
        public_repository,
        permission_service,
        audit,
        token_factory=lambda: "raw-token",
    )
    created = public_service.create_link(actor, PublicLinkCreate(card_id=public_card_id))
    public_service.update_value(
        created.raw_token,
        PublicFieldValueWrite(
            block_instance_id=public_block_instance_id,
            field_id=public_field_id,
            value="public value",
        ),
    )
    public_service.disable_link(actor, created.link_id)

    assert [event["action"] for event in audit.events] == [
        "card.create",
        "card_block_instance.create",
        "field_value.update",
        "card.archive",
        "card.transfer",
        "public_link.create",
        "public_link.value_update",
        "public_link.disable",
    ]
