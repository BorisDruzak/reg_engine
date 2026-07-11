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
    CardTemplate,
    Organization,
    Registry,
)
from app.services.audit import AuditService
from app.services.permissions import PermissionDeniedError, PermissionService
from app.services.public_links import hash_public_token


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

    def _link_value(
        self,
        creation_link: CardCreationLink,
        *,
        actor_user_id: UUID,
        organizations: list[Organization],
    ) -> CardCreationLinkValue:
        template = self._active_template(
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
        template = self.session.get(CardTemplate, template_id)
        if (
            template is None
            or template.registry_id != registry_id
            or template.archived_at is not None
            or not template.is_active
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
