import secrets
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    Card,
    CardCreationLink,
    CardCreationLinkCard,
    CardCreationLinkOrganization,
    CardPublicLink,
    CardTemplate,
    FormBlock,
    FormField,
    Organization,
    Registry,
)
from app.services.audit import AuditService
from app.services.card_public_access import default_public_field_access
from app.services.card_template_projection import resolve_card_template_form_layout
from app.services.cards import CardService
from app.services.permissions import PermissionDeniedError, PermissionService
from app.services.public_links import (
    PublicPreviewBlock,
    PublicPreviewBlockInstance,
    PublicPreviewField,
    PublicPreviewOption,
    hash_public_token,
    normalize_public_actor_name,
)
from app.services.references import ReferenceListError, ReferenceListService


class CardCreationLinkError(ValueError):
    """Raised when a card-creation link cannot be used safely."""


class CreationLinkTokenCipher:
    """Encrypts recoverable public URL tokens for authorised administrator views."""

    def __init__(self, key: str) -> None:
        try:
            self._fernet = Fernet(key.encode("ascii"))
        except (UnicodeEncodeError, ValueError) as exc:
            raise CardCreationLinkError("Public-link token encryption key is invalid.") from exc

    def encrypt(self, raw_token: str) -> str:
        return self._fernet.encrypt(raw_token.encode("utf-8")).decode("ascii")

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode("ascii")).decode("utf-8")
        except (InvalidToken, UnicodeEncodeError, UnicodeDecodeError) as exc:
            raise CardCreationLinkError("Public-link token cannot be recovered.") from exc


@dataclass(frozen=True)
class CardCreationLinkToken:
    raw_token: str
    creation_link: CardCreationLink


@dataclass(frozen=True)
class CardCreationLinkOrganizationValue:
    id: UUID
    name: str


@dataclass(frozen=True)
class CardCreationLinkCardValue:
    card_id: UUID
    display_name: str
    organization_id: UUID
    organization_name: str
    child_public_link_id: UUID
    child_raw_token: str


@dataclass(frozen=True)
class CardCreationLinkValue:
    creation_link: CardCreationLink
    card_template_name: str
    raw_token: str
    organizations: list[CardCreationLinkOrganizationValue] = field(default_factory=list)
    created_cards: list[CardCreationLinkCardValue] = field(default_factory=list)


@dataclass(frozen=True)
class CardCreationLinkPublicPreviewValue:
    card_template_id: UUID
    card_template_name: str
    selected_organization_id: UUID | None
    organizations: list[CardCreationLinkOrganizationValue] = field(default_factory=list)
    form_layout: dict[str, object] = field(default_factory=dict)
    blocks: list[PublicPreviewBlock] = field(default_factory=list)


@dataclass(frozen=True)
class CardCreationLinkPublicCardValue:
    card: Card
    child_public_link: CardPublicLink
    child_raw_token: str


class CardCreationLinkService:
    def __init__(
        self,
        session: Session,
        *,
        token_cipher: CreationLinkTokenCipher | None = None,
    ) -> None:
        self.session = session
        self._token_cipher_override = token_cipher

    def create_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        card_template_id: UUID,
        organization_ids: Sequence[UUID],
    ) -> CardCreationLinkToken:
        registry = self._active_registry(registry_id)
        self._active_template(card_template_id, registry_id=registry.id)
        organizations = self._allowed_organizations(organization_ids)
        self._require_manage_organizations(
            actor_user_id=actor_user_id,
            registry_id=registry.id,
            organizations=organizations,
        )

        raw_token = secrets.token_urlsafe(32)
        creation_link = CardCreationLink(
            registry_id=registry.id,
            card_template_id=card_template_id,
            token_hash=hash_public_token(raw_token),
            token_ciphertext=self._token_cipher().encrypt(raw_token),
            created_by=actor_user_id,
        )
        self.session.add(creation_link)
        self.session.flush()
        self.session.add_all(
            [
                CardCreationLinkOrganization(
                    creation_link_id=creation_link.id,
                    organization_id=organization.id,
                )
                for organization in organizations
            ]
        )
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="card_creation_link",
            object_id=creation_link.id,
            new_data_json={
                "registry_id": str(registry.id),
                "card_template_id": str(card_template_id),
                "organization_ids": [str(organization.id) for organization in organizations],
            },
        )
        return CardCreationLinkToken(raw_token=raw_token, creation_link=creation_link)

    def list_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
    ) -> list[CardCreationLinkValue]:
        self._active_registry(registry_id)
        links = list(
            self.session.scalars(
                select(CardCreationLink)
                .where(CardCreationLink.registry_id == registry_id)
                .order_by(CardCreationLink.created_at.desc(), CardCreationLink.id)
            ).all()
        )
        values: list[CardCreationLinkValue] = []
        for link in links:
            organizations = self._organizations_for_link(link.id)
            if not self._can_manage_organizations(
                actor_user_id=actor_user_id,
                registry_id=registry_id,
                organizations=organizations,
            ):
                continue
            values.append(
                self._link_value(
                    link,
                    actor_user_id=actor_user_id,
                    organizations=organizations,
                )
            )
        return values

    def read_for_actor(
        self,
        *,
        actor_user_id: UUID,
        creation_link_id: UUID,
    ) -> CardCreationLinkValue:
        creation_link = self._locked_link(creation_link_id)
        organizations = self._organizations_for_link(creation_link.id)
        self._require_manage_organizations(
            actor_user_id=actor_user_id,
            registry_id=creation_link.registry_id,
            organizations=organizations,
        )
        return self._link_value(
            creation_link,
            actor_user_id=actor_user_id,
            organizations=organizations,
        )

    def close_for_actor(
        self,
        *,
        actor_user_id: UUID,
        creation_link_id: UUID,
    ) -> CardCreationLink:
        creation_link = self._locked_link(creation_link_id)
        organizations = self._organizations_for_link(creation_link.id)
        self._require_manage_organizations(
            actor_user_id=actor_user_id,
            registry_id=creation_link.registry_id,
            organizations=organizations,
        )
        if creation_link.closed_at is not None:
            raise CardCreationLinkError("Card creation link is already closed.")

        creation_link.closed_at = datetime.now(UTC)
        creation_link.closed_by = actor_user_id
        self.session.flush()
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="close",
            object_type="card_creation_link",
            object_id=creation_link.id,
            new_data_json={"registry_id": str(creation_link.registry_id)},
        )
        return creation_link

    def list_for_card_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
    ) -> list[CardCreationLinkCardValue]:
        card = self._active_card(card_id)
        self._require_manage_card(actor_user_id, card)
        relations = list(
            self.session.scalars(
                select(CardCreationLinkCard)
                .where(CardCreationLinkCard.card_id == card.id)
                .order_by(CardCreationLinkCard.created_at.desc(), CardCreationLinkCard.id)
            ).all()
        )
        return [self._card_value(relation) for relation in relations]

    def preview_for_public(
        self,
        *,
        raw_token: str,
        organization_id: UUID | None = None,
    ) -> CardCreationLinkPublicPreviewValue:
        creation_link = self._public_link_for_token(raw_token)
        self._require_public_link_open(creation_link)
        template = self._active_template(
            creation_link.card_template_id,
            registry_id=creation_link.registry_id,
        )
        organizations = self._organizations_for_link(creation_link.id)
        selected_organization = self._selected_public_organization(
            organizations=organizations,
            organization_id=organization_id,
            require_selection=False,
        )
        schema_rows = self._public_template_schema_rows(template, creation_link.registry_id)
        preview_blocks: list[PublicPreviewBlock] = []
        for block in self._ordered_blocks(schema_rows):
            fields = [
                field_model for row_block, field_model in schema_rows if row_block.id == block.id
            ]
            preview_blocks.append(
                PublicPreviewBlock(
                    block_id=block.id,
                    code=block.code,
                    title=block.title,
                    is_repeatable=block.is_repeatable,
                    layout_columns=block.layout_columns,
                    display_config_json=block.display_config_json,
                    instances=[
                        PublicPreviewBlockInstance(
                            block_instance_id=None,
                            ordinal=0,
                            fields=[
                                self._preview_field(
                                    field_model=field_model,
                                    registry_id=creation_link.registry_id,
                                    organization_id=(
                                        selected_organization.id
                                        if selected_organization is not None
                                        else None
                                    ),
                                )
                                for field_model in fields
                            ],
                        )
                    ],
                )
            )

        return CardCreationLinkPublicPreviewValue(
            card_template_id=template.id,
            card_template_name=template.name,
            selected_organization_id=(
                selected_organization.id if selected_organization is not None else None
            ),
            organizations=[
                CardCreationLinkOrganizationValue(id=organization.id, name=organization.name)
                for organization in organizations
            ],
            form_layout=self._sanitized_public_form_layout(template, schema_rows),
            blocks=preview_blocks,
        )

    def create_card_from_public_link(
        self,
        *,
        raw_token: str,
        organization_id: UUID,
        field_id: UUID,
        value: object,
        block_instance_id: UUID | None = None,
        actor_name: str,
    ) -> CardCreationLinkPublicCardValue:
        actor_display_name = normalize_public_actor_name(actor_name)
        creation_link = self._public_link_for_token(raw_token, lock_for_update=True)
        self._require_public_link_open(creation_link)
        template = self._active_template(
            creation_link.card_template_id,
            registry_id=creation_link.registry_id,
        )
        organization = self._selected_public_organization(
            organizations=self._organizations_for_link(creation_link.id),
            organization_id=organization_id,
            require_selection=True,
        )
        assert organization is not None
        _, field_model = self._editable_public_template_field(
            template=template,
            registry_id=creation_link.registry_id,
            field_id=field_id,
        )
        card_service = CardService(self.session)
        assignment = card_service._coerce_field_assignment(
            field_model,
            value,
            registry_id=creation_link.registry_id,
            organization_id=organization.id,
            public_context=True,
        )
        if card_service._field_assignment_is_empty(assignment):
            raise CardCreationLinkError(
                "At least one non-empty public field is required to create a card."
            )

        return self._create_public_card(
            creation_link=creation_link,
            template=template,
            organization=organization,
            initial_field=(field_model, value, block_instance_id),
            actor_display_name=actor_display_name,
        )

    def create_draft_from_public_link(
        self,
        *,
        raw_token: str,
        organization_id: UUID,
        actor_name: str,
    ) -> CardCreationLinkPublicCardValue:
        actor_display_name = normalize_public_actor_name(actor_name)
        creation_link = self._public_link_for_token(raw_token, lock_for_update=True)
        self._require_public_link_open(creation_link)
        template = self._active_template(
            creation_link.card_template_id,
            registry_id=creation_link.registry_id,
        )
        organization = self._selected_public_organization(
            organizations=self._organizations_for_link(creation_link.id),
            organization_id=organization_id,
            require_selection=True,
        )
        assert organization is not None
        return self._create_public_card(
            creation_link=creation_link,
            template=template,
            organization=organization,
            initial_field=None,
            actor_display_name=actor_display_name,
        )

    def _create_public_card(
        self,
        *,
        creation_link: CardCreationLink,
        template: CardTemplate,
        organization: Organization,
        initial_field: tuple[FormField, object, UUID | None] | None,
        actor_display_name: str | None,
    ) -> CardCreationLinkPublicCardValue:
        card_service = CardService(self.session)

        with self.session.begin_nested():
            card = card_service.create_card(
                registry_id=creation_link.registry_id,
                organization_id=organization.id,
                card_template_id=template.id,
                public_view_enabled=True,
                public_edit_enabled=True,
                created_by=None,
                public_creator_name=actor_display_name,
            )
            child_raw_token = secrets.token_urlsafe(32)
            child_public_link = CardPublicLink(
                card_id=card.id,
                token_hash=hash_public_token(child_raw_token),
                expires_at=None,
                status="active",
                can_view=True,
                can_edit=True,
                review_enabled=False,
                created_by=creation_link.created_by,
            )
            self.session.add(child_public_link)
            self.session.flush()
            if initial_field is not None:
                field_model, value, block_instance_id = initial_field
                card_service.set_field_value_from_public_link(
                    actor_public_link_id=child_public_link.id,
                    actor_display_name=actor_display_name,
                    attributed_user_id=creation_link.created_by,
                    card_id=card.id,
                    field_id=field_model.id,
                    value=value,
                    block_instance_id=block_instance_id,
                )
            self.session.add(
                CardCreationLinkCard(
                    creation_link_id=creation_link.id,
                    card_id=card.id,
                    child_public_link_id=child_public_link.id,
                    child_token_ciphertext=self._token_cipher().encrypt(child_raw_token),
                )
            )
            self.session.flush()
            audit_service = AuditService(self.session)
            audit_service.record_public_link_event(
                actor_public_link_id=child_public_link.id,
                actor_display_name=actor_display_name,
                action="public_creation_link.create_card",
                object_type="card",
                object_id=card.id,
                card_id=card.id,
                attributed_user_id=creation_link.created_by,
                retention_class="card_history",
                new_data_json={
                    "creation_link_id": str(creation_link.id),
                    "organization_id": str(organization.id),
                    "card_template_id": str(template.id),
                },
            )
            audit_service.record_public_link_event(
                actor_public_link_id=child_public_link.id,
                actor_display_name=actor_display_name,
                action="public_creation_link.create_child_link",
                object_type="card_public_link",
                object_id=child_public_link.id,
                card_id=card.id,
                attributed_user_id=creation_link.created_by,
                retention_class="card_history",
                new_data_json={
                    "card_id": str(card.id),
                    "creation_link_id": str(creation_link.id),
                    "expires_at": None,
                },
            )
        return CardCreationLinkPublicCardValue(
            card=card,
            child_public_link=child_public_link,
            child_raw_token=child_raw_token,
        )

    def _link_value(
        self,
        creation_link: CardCreationLink,
        *,
        actor_user_id: UUID,
        organizations: list[Organization],
    ) -> CardCreationLinkValue:
        template = self._nonarchived_template(
            creation_link.card_template_id,
            registry_id=creation_link.registry_id,
        )
        relations = list(
            self.session.scalars(
                select(CardCreationLinkCard)
                .where(CardCreationLinkCard.creation_link_id == creation_link.id)
                .order_by(CardCreationLinkCard.created_at.desc(), CardCreationLinkCard.id)
            ).all()
        )
        return CardCreationLinkValue(
            creation_link=creation_link,
            card_template_name=template.name,
            raw_token=self._token_cipher().decrypt(creation_link.token_ciphertext),
            organizations=[
                CardCreationLinkOrganizationValue(id=organization.id, name=organization.name)
                for organization in organizations
            ],
            created_cards=[
                self._card_value(relation)
                for relation in relations
                if self._can_manage_card(actor_user_id, self._active_card(relation.card_id))
            ],
        )

    def _card_value(self, relation: CardCreationLinkCard) -> CardCreationLinkCardValue:
        card = self._active_card(relation.card_id)
        organization = self._active_organization(card.organization_id)
        return CardCreationLinkCardValue(
            card_id=card.id,
            display_name=card.display_name,
            organization_id=organization.id,
            organization_name=organization.name,
            child_public_link_id=relation.child_public_link_id,
            child_raw_token=self._token_cipher().decrypt(relation.child_token_ciphertext),
        )

    def _public_link_for_token(
        self,
        raw_token: str,
        *,
        lock_for_update: bool = False,
    ) -> CardCreationLink:
        statement = select(CardCreationLink).where(
            CardCreationLink.token_hash == hash_public_token(raw_token)
        )
        if lock_for_update:
            statement = statement.execution_options(populate_existing=True).with_for_update()
        creation_link = self.session.scalars(statement).one_or_none()
        if creation_link is None:
            raise CardCreationLinkError("Card creation link was not found.")
        return creation_link

    def _require_public_link_open(self, creation_link: CardCreationLink) -> None:
        if creation_link.closed_at is not None:
            raise CardCreationLinkError("Card creation link is closed.")
        if creation_link.expires_at is not None and creation_link.expires_at <= datetime.now(UTC):
            raise CardCreationLinkError("Card creation link has expired.")

    def _selected_public_organization(
        self,
        *,
        organizations: Sequence[Organization],
        organization_id: UUID | None,
        require_selection: bool,
    ) -> Organization | None:
        if not organizations:
            raise CardCreationLinkError("Card creation link has no active organizations.")
        organizations_by_id = {organization.id: organization for organization in organizations}
        if organization_id is not None:
            organization = organizations_by_id.get(organization_id)
            if organization is None:
                raise CardCreationLinkError(
                    "The selected organization is unavailable for this card creation link."
                )
            return organization
        if len(organizations) == 1:
            return organizations[0]
        if require_selection:
            raise CardCreationLinkError("Select an organization before creating a card.")
        return None

    def _public_template_schema_rows(
        self,
        template: CardTemplate,
        registry_id: UUID,
    ) -> list[tuple[FormBlock, FormField]]:
        raw_field_ids = (template.field_schema_json or {}).get("field_ids", [])
        if not isinstance(raw_field_ids, Sequence) or isinstance(raw_field_ids, str | bytes):
            raise CardCreationLinkError("Card template field schema is invalid.")
        try:
            field_ids = {UUID(str(field_id)) for field_id in raw_field_ids}
        except (TypeError, ValueError) as exc:
            raise CardCreationLinkError("Card template field schema is invalid.") from exc
        if not field_ids:
            return []
        return list(
            self.session.execute(
                select(FormBlock, FormField)
                .join(FormField, FormField.block_id == FormBlock.id)
                .where(
                    FormBlock.registry_id == registry_id,
                    FormBlock.archived_at.is_(None),
                    FormBlock.is_active.is_(True),
                    FormField.id.in_(field_ids),
                    FormField.archived_at.is_(None),
                    FormField.is_active.is_(True),
                )
                .order_by(FormBlock.position, FormBlock.code, FormField.position, FormField.code)
            )
            .tuples()
            .all()
        )

    def _editable_public_template_field(
        self,
        *,
        template: CardTemplate,
        registry_id: UUID,
        field_id: UUID,
    ) -> tuple[FormBlock, FormField]:
        for block, field_model in self._public_template_schema_rows(template, registry_id):
            if field_model.id != field_id:
                continue
            _, public_editable = default_public_field_access(field_model.field_type)
            if not public_editable:
                break
            return block, field_model
        raise CardCreationLinkError("The field cannot be edited through this card creation link.")

    def _preview_field(
        self,
        *,
        field_model: FormField,
        registry_id: UUID,
        organization_id: UUID | None,
    ) -> PublicPreviewField:
        options: list[PublicPreviewOption] = []
        if (
            organization_id is not None
            and field_model.field_type in {"select", "multi_select"}
            and field_model.options_source_type == "reference_list"
            and field_model.options_source_id is not None
        ):
            try:
                options = [
                    PublicPreviewOption(id=item.id, code=item.code, label=item.label)
                    for item in ReferenceListService(self.session).list_effective_items_for_field(
                        field_model=field_model,
                        registry_id=registry_id,
                        organization_id=organization_id,
                    )
                ]
            except ReferenceListError as exc:
                raise CardCreationLinkError("Reference list options are unavailable.") from exc
        return PublicPreviewField(
            field_id=field_model.id,
            code=field_model.code,
            label=field_model.label,
            description=field_model.description,
            field_type=field_model.field_type,
            required_mode=field_model.required_mode,
            value=None,
            validation_json=field_model.validation_json,
            options_source_type=field_model.options_source_type,
            options_source_id=field_model.options_source_id,
            options_config_json=field_model.options_config_json,
            display_config_json=field_model.display_config_json,
            public_editable=default_public_field_access(field_model.field_type)[1],
            options=options,
        )

    @staticmethod
    def _ordered_blocks(schema_rows: list[tuple[FormBlock, FormField]]) -> list[FormBlock]:
        blocks_by_id: dict[UUID, FormBlock] = {}
        for block, _ in schema_rows:
            blocks_by_id.setdefault(block.id, block)
        return list(blocks_by_id.values())

    @staticmethod
    def _sanitized_public_form_layout(
        template: CardTemplate,
        schema_rows: list[tuple[FormBlock, FormField]],
    ) -> dict[str, object]:
        blocks_by_id = {block.id: block for block, _ in schema_rows}
        fields_by_id = {field_model.id: field_model for _, field_model in schema_rows}
        form_layout = resolve_card_template_form_layout(
            template.field_schema_json,
            blocks=[{"id": str(block_id)} for block_id in blocks_by_id],
            fields=[
                {"id": str(field_model.id), "block_id": str(field_model.block_id)}
                for field_model in fields_by_id.values()
            ],
        )
        allowed_block_ids = {str(block_id) for block_id in blocks_by_id}
        allowed_field_ids = {str(field_id) for field_id in fields_by_id}
        sections: list[dict[str, object]] = []
        for raw_section in form_layout["sections"]:
            block_id = raw_section.get("block_id")
            if block_id is None or str(block_id) not in allowed_block_ids:
                continue
            items = [
                {
                    "id": str(item["id"]),
                    "kind": str(item.get("kind") or "field"),
                    "field_id": str(item["field_id"]),
                    "row": int(item["row"]),
                    "column": int(item["column"]),
                    "row_span": int(item["row_span"]),
                    "column_span": int(item["column_span"]),
                    "text": None,
                }
                for item in raw_section["items"]
                if item.get("field_id") is not None and str(item["field_id"]) in allowed_field_ids
            ]
            if not items:
                continue
            sections.append(
                {
                    "id": str(raw_section["id"]),
                    "block_id": str(block_id),
                    "row": int(raw_section["row"]),
                    "column": int(raw_section["column"]),
                    "row_span": int(raw_section["row_span"]),
                    "column_span": int(raw_section["column_span"]),
                    "items": items,
                }
            )
        return {"columns": 12, "sections": sections}

    def _token_cipher(self) -> CreationLinkTokenCipher:
        if self._token_cipher_override is not None:
            return self._token_cipher_override
        key = get_settings().public_link_token_encryption_key
        if not key:
            raise CardCreationLinkError("Public-link token encryption key is not configured.")
        return CreationLinkTokenCipher(key)

    def _active_registry(self, registry_id: UUID) -> Registry:
        registry = self.session.get(Registry, registry_id)
        if (
            registry is None
            or registry.archived_at is not None
            or registry.lifecycle_status != "active"
        ):
            raise CardCreationLinkError("Registry was not found.")
        return registry

    def _active_template(self, template_id: UUID, *, registry_id: UUID) -> CardTemplate:
        template = self._nonarchived_template(template_id, registry_id=registry_id)
        if not template.is_active:
            raise CardCreationLinkError("Card template was not found.")
        return template

    def _nonarchived_template(self, template_id: UUID, *, registry_id: UUID) -> CardTemplate:
        template = self.session.get(CardTemplate, template_id)
        if (
            template is None
            or template.registry_id != registry_id
            or template.archived_at is not None
        ):
            raise CardCreationLinkError("Card template was not found.")
        return template

    def _active_card(self, card_id: UUID) -> Card:
        card = self.session.get(Card, card_id)
        if (
            card is None
            or card.archived_at is not None
            or card.lifecycle_status in {"archived", "superseded"}
        ):
            raise CardCreationLinkError("Card was not found.")
        return card

    def _active_organization(self, organization_id: UUID) -> Organization:
        organization = self.session.get(Organization, organization_id)
        if (
            organization is None
            or organization.archived_at is not None
            or not organization.is_active
        ):
            raise CardCreationLinkError("Organization was not found.")
        return organization

    def _allowed_organizations(self, organization_ids: Sequence[UUID]) -> list[Organization]:
        unique_ids = list(dict.fromkeys(organization_ids))
        if not unique_ids:
            raise CardCreationLinkError("At least one organization is required.")
        return [self._active_organization(organization_id) for organization_id in unique_ids]

    def _organizations_for_link(self, creation_link_id: UUID) -> list[Organization]:
        return list(
            self.session.scalars(
                select(Organization)
                .join(
                    CardCreationLinkOrganization,
                    CardCreationLinkOrganization.organization_id == Organization.id,
                )
                .where(
                    CardCreationLinkOrganization.creation_link_id == creation_link_id,
                    Organization.archived_at.is_(None),
                    Organization.is_active.is_(True),
                )
                .order_by(Organization.name, Organization.id)
            ).all()
        )

    def _require_manage_organizations(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        organizations: Sequence[Organization],
    ) -> None:
        if not self._can_manage_organizations(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            organizations=organizations,
        ):
            raise PermissionDeniedError("Actor cannot manage card creation links in this scope.")

    def _can_manage_organizations(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        organizations: Sequence[Organization],
    ) -> bool:
        permissions = PermissionService(self.session)
        return bool(organizations) and all(
            permissions.has_permission(
                actor_user_id,
                "cards.manage",
                organization_id=organization.id,
                registry_id=registry_id,
            )
            for organization in organizations
        )

    def _require_manage_card(self, actor_user_id: UUID, card: Card) -> None:
        if not self._can_manage_card(actor_user_id, card):
            raise PermissionDeniedError("Actor cannot manage this card.")

    def _can_manage_card(self, actor_user_id: UUID, card: Card) -> bool:
        return PermissionService(self.session).has_permission(
            actor_user_id,
            "cards.manage",
            organization_id=card.organization_id,
            registry_id=card.registry_id,
        )

    def _locked_link(self, creation_link_id: UUID) -> CardCreationLink:
        creation_link = self.session.scalars(
            select(CardCreationLink)
            .where(CardCreationLink.id == creation_link_id)
            .execution_options(populate_existing=True)
            .with_for_update()
        ).one_or_none()
        if creation_link is None:
            raise CardCreationLinkError("Card creation link was not found.")
        return creation_link
