import hashlib
import secrets
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.constants import PUBLIC_LINK_STATUSES
from app.models import (
    AuditEvent,
    Card,
    CardAttachment,
    CardBlockInstance,
    CardPublicLink,
    CardTemplate,
    FieldValue,
    FieldValueItem,
    FormBlock,
    FormField,
    Organization,
    StoredFile,
)
from app.services.audit import AuditService
from app.services.card_public_access import CardPublicAccessService
from app.services.card_template_projection import resolve_card_template_form_layout
from app.services.cards import CardService, CardServiceError
from app.services.permissions import (
    PermissionDeniedError,
    PermissionService,
    PersistStatePermissionDeniedError,
    PublicLinkReviewPermissionDeniedError,
    PublicLinkSubmittedReadOnlyError,
)
from app.services.references import ReferenceListError, ReferenceListService

DEFAULT_PUBLIC_LINK_TTL_DAYS = 7
EDITABLE_PUBLIC_LINK_STATUSES = {"active", "changes_requested"}
EXPIRABLE_PUBLIC_LINK_STATUSES = {"active", "changes_requested", "submitted"}
ALLOWED_PUBLIC_LINK_TRANSITIONS: dict[str, set[str]] = {
    "active": {"submitted", "disabled", "expired"},
    "changes_requested": {"submitted", "disabled", "expired"},
    "submitted": {"changes_requested", "approved", "disabled", "expired"},
    "approved": set(),
    "disabled": set(),
    "expired": set(),
}


class PublicLinkError(ValueError):
    """Raised when a public link cannot be used."""


class PublicLinkTransitionError(PublicLinkError):
    """Raised when a public link lifecycle transition is not allowed."""


@dataclass(frozen=True)
class PublicLinkToken:
    raw_token: str
    public_link: CardPublicLink


@dataclass(frozen=True)
class PublicPreviewOption:
    id: UUID
    code: str
    label: str
    archived: bool = False


@dataclass(frozen=True)
class PublicPreviewField:
    field_id: UUID
    code: str
    label: str
    description: str | None
    field_type: str
    required_mode: str
    value: object | None
    options_source_type: str | None
    options_source_id: UUID | None
    options_config_json: dict[str, Any] | None = None
    display_config_json: dict[str, Any] | None = None
    options: list[PublicPreviewOption] = field(default_factory=list)


@dataclass(frozen=True)
class PublicPreviewBlockInstance:
    block_instance_id: UUID | None
    ordinal: int
    fields: list[PublicPreviewField] = field(default_factory=list)


@dataclass(frozen=True)
class PublicPreviewBlock:
    block_id: UUID
    code: str
    title: str
    is_repeatable: bool
    layout_columns: int
    display_config_json: dict[str, Any] | None
    instances: list[PublicPreviewBlockInstance] = field(default_factory=list)


@dataclass(frozen=True)
class PublicLinkPreview:
    card_id: UUID
    display_name: str
    expires_at: datetime | None
    can_edit: bool
    form_layout: dict[str, Any]
    blocks: list[PublicPreviewBlock] = field(default_factory=list)


@dataclass(frozen=True)
class PublicLinkSafeStatus:
    status: str
    can_edit: bool
    submitted_at: datetime | None
    reviewed_at: datetime | None
    review_comment: str | None
    completed_public_fields: int | None
    total_public_fields: int | None


@dataclass(frozen=True)
class PublicLinkReviewFieldDiff:
    block_id: UUID
    field_id: UUID
    block_instance_id: UUID | None
    label: str
    field_type: str
    before: object | None
    after: object | None
    changed_at: datetime | None


@dataclass(frozen=True)
class PublicLinkReviewAttachmentDiff:
    attachment_id: UUID
    title: str
    original_filename: str
    content_length_bytes: int
    change: str


@dataclass(frozen=True)
class PublicLinkReviewDiff:
    public_link: CardPublicLink
    changed_field_count: int
    changed_attachment_count: int
    fields: list[PublicLinkReviewFieldDiff] = field(default_factory=list)
    attachments: list[PublicLinkReviewAttachmentDiff] = field(default_factory=list)


def hash_public_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


class PublicLinkService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_public_link_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
        expires_in_days: int = DEFAULT_PUBLIC_LINK_TTL_DAYS,
        max_attachment_uploads: int | None = None,
        review_enabled: bool = False,
        allowed_block_ids: list[UUID] | None = None,
        allowed_field_ids: list[UUID] | None = None,
    ) -> PublicLinkToken:
        if expires_in_days < 1 or expires_in_days > 30:
            raise PublicLinkError("Public link expiration must be between 1 and 30 days.")
        if max_attachment_uploads is not None and max_attachment_uploads < 0:
            raise PublicLinkError("Public attachment upload limit must not be negative.")
        card = self._get_active_card(card_id)
        self._require_card_permission(actor_user_id, card)
        raw_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(days=expires_in_days)
        public_link = CardPublicLink(
            card_id=card.id,
            token_hash=hash_public_token(raw_token),
            expires_at=expires_at,
            max_attachment_uploads=max_attachment_uploads,
            review_enabled=review_enabled,
            created_by=actor_user_id,
        )
        self.session.add(public_link)
        self.session.flush()
        if review_enabled:
            public_link.baseline_snapshot_json = self._review_snapshot(public_link)
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="create",
            object_type="card_public_link",
            object_id=public_link.id,
            new_data_json={
                "card_id": str(card.id),
                "expires_at": expires_at.isoformat(),
                "max_attachment_uploads": max_attachment_uploads,
                "review_enabled": review_enabled,
                "public_scope": "card_settings",
            },
        )
        return PublicLinkToken(raw_token=raw_token, public_link=public_link)

    def list_public_links_for_actor(
        self,
        *,
        actor_user_id: UUID,
        card_id: UUID,
    ) -> list[CardPublicLink]:
        card = self._get_active_card(card_id)
        self._require_card_permission(actor_user_id, card)
        return list(
            self.session.scalars(
                select(CardPublicLink)
                .where(CardPublicLink.card_id == card.id)
                .order_by(CardPublicLink.created_at.desc(), CardPublicLink.id)
            ).all()
        )

    def disable_public_link_for_actor(
        self,
        *,
        actor_user_id: UUID,
        public_link_id: UUID,
    ) -> CardPublicLink:
        public_link = self._locked_public_link(public_link_id)
        card = self._get_active_card(public_link.card_id)
        self._require_card_permission(actor_user_id, card)
        self._require_not_expired(public_link)
        self._require_transition(public_link, "disabled")
        public_link.status = "disabled"
        public_link.can_edit = False
        public_link.can_view = False
        public_link.disabled_at = datetime.now(UTC)
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="disable",
            object_type="card_public_link",
            object_id=public_link.id,
            new_data_json={"card_id": str(card.id)},
        )
        return public_link

    def capture_review_baseline(
        self,
        *,
        actor_user_id: UUID,
        public_link_id: UUID,
    ) -> CardPublicLink:
        public_link = self._locked_public_link(public_link_id)
        card = self._get_active_card(public_link.card_id)
        self._require_review_permission(actor_user_id, card)
        self._require_not_expired(public_link)
        if public_link.status != "active" or public_link.review_enabled:
            raise PublicLinkTransitionError("Review baseline cannot be captured in this state.")

        public_link.baseline_snapshot_json = self._review_snapshot(public_link)
        public_link.review_enabled = True
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="public_link.review_started",
            object_type="card_public_link",
            object_id=public_link.id,
            new_data_json={"status": public_link.status, "review_enabled": True},
        )
        return public_link

    def submit_for_review(self, *, raw_token: str) -> CardPublicLink:
        public_link = self._public_link_for_token(raw_token, lock_for_update=True)
        self._require_not_expired(public_link)
        if not public_link.review_enabled or public_link.baseline_snapshot_json is None:
            raise PublicLinkTransitionError("Review cycle is not enabled for this public link.")
        self._require_transition(public_link, "submitted")

        now = datetime.now(UTC)
        public_link.status = "submitted"
        public_link.can_edit = False
        public_link.submitted_at = now
        public_link.reviewed_at = None
        public_link.reviewed_by = None
        public_link.review_comment = None
        public_link.submission_summary_json = self._submission_summary(public_link)
        AuditService(self.session).record_public_link_event(
            actor_public_link_id=public_link.id,
            action="public_link.submit",
            object_type="card_public_link",
            object_id=public_link.id,
            new_data_json={
                "status": public_link.status,
                "submitted_at": now.isoformat(),
                **public_link.submission_summary_json,
            },
        )
        return public_link

    def request_changes_for_actor(
        self,
        *,
        actor_user_id: UUID,
        public_link_id: UUID,
        comment: str,
    ) -> CardPublicLink:
        clean_comment = comment.strip()
        if not clean_comment:
            raise PublicLinkError("Review comment is required.")
        if len(clean_comment) > 2000:
            raise PublicLinkError("Review comment must not exceed 2000 characters.")

        public_link = self._locked_public_link(public_link_id)
        card = self._get_active_card(public_link.card_id)
        self._require_review_permission(actor_user_id, card)
        self._require_not_expired(public_link)
        self._require_transition(public_link, "changes_requested")

        now = datetime.now(UTC)
        public_link.status = "changes_requested"
        public_link.can_view = True
        public_link.can_edit = True
        public_link.reviewed_at = now
        public_link.reviewed_by = actor_user_id
        public_link.review_comment = clean_comment
        public_link.disabled_at = None
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="public_link.request_changes",
            object_type="card_public_link",
            object_id=public_link.id,
            old_data_json={"status": "submitted"},
            new_data_json={
                "status": public_link.status,
                "review_comment": clean_comment,
                "reviewed_at": now.isoformat(),
            },
        )
        return public_link

    def approve_for_actor(
        self,
        *,
        actor_user_id: UUID,
        public_link_id: UUID,
    ) -> CardPublicLink:
        public_link = self._locked_public_link(public_link_id)
        card = self._get_active_card(public_link.card_id)
        self._require_review_permission(actor_user_id, card)
        self._require_not_expired(public_link)
        self._require_transition(public_link, "approved")

        now = datetime.now(UTC)
        public_link.status = "approved"
        public_link.can_view = False
        public_link.can_edit = False
        public_link.reviewed_at = now
        public_link.reviewed_by = actor_user_id
        public_link.review_comment = None
        public_link.disabled_at = now
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="public_link.approve",
            object_type="card_public_link",
            object_id=public_link.id,
            old_data_json={"status": "submitted"},
            new_data_json={
                "status": public_link.status,
                "reviewed_at": now.isoformat(),
                "access_closed": True,
            },
        )
        return public_link

    def safe_status(self, *, raw_token: str) -> PublicLinkSafeStatus:
        public_link = self._public_link_for_token(raw_token, lock_for_update=True)
        self._expire_if_needed(public_link)
        if public_link.status not in PUBLIC_LINK_STATUSES:
            raise PublicLinkError("Public link status is not recognized.")

        expose_review_details = public_link.status in {"submitted", "changes_requested"}
        summary = public_link.submission_summary_json or {}
        card_allows_public_edit = self._card_allows_public_edit(public_link.card_id)
        return PublicLinkSafeStatus(
            status=public_link.status,
            can_edit=(
                public_link.status in EDITABLE_PUBLIC_LINK_STATUSES
                and public_link.can_edit
                and card_allows_public_edit
            ),
            submitted_at=public_link.submitted_at,
            reviewed_at=public_link.reviewed_at,
            review_comment=(
                public_link.review_comment if public_link.status == "changes_requested" else None
            ),
            completed_public_fields=(
                self._summary_count(summary, "completed_public_fields")
                if expose_review_details
                else None
            ),
            total_public_fields=(
                self._summary_count(summary, "total_public_fields")
                if expose_review_details
                else None
            ),
        )

    def review_diff_for_actor(
        self,
        *,
        actor_user_id: UUID,
        public_link_id: UUID,
    ) -> PublicLinkReviewDiff:
        public_link = self._locked_public_link(public_link_id)
        card = self._get_active_card(public_link.card_id)
        self._require_review_permission(actor_user_id, card)
        if not public_link.review_enabled or public_link.baseline_snapshot_json is None:
            raise PublicLinkTransitionError("Review cycle is not enabled for this public link.")

        baseline = public_link.baseline_snapshot_json
        current = self._review_snapshot(public_link, include_internal=True)
        baseline_fields = self._snapshot_items_by_key(baseline, "fields", self._field_snapshot_key)
        current_fields = self._snapshot_items_by_key(current, "fields", self._field_snapshot_key)
        changed_at_by_value_id = self._field_change_timestamps(public_link.id)
        fields: list[PublicLinkReviewFieldDiff] = []
        changed_field_count = 0
        field_keys = list(baseline_fields) + [
            key for key in current_fields if key not in baseline_fields
        ]
        for key in field_keys:
            before_item = baseline_fields.get(key)
            after_item = current_fields.get(key)
            source = after_item or before_item
            if source is None:
                continue
            before = before_item.get("value") if before_item is not None else None
            after = after_item.get("value") if after_item is not None else None
            changed = before != after
            changed_field_count += int(changed)
            value_id = after_item.get("_field_value_id") if after_item is not None else None
            fields.append(
                PublicLinkReviewFieldDiff(
                    block_id=self._snapshot_uuid(source, "block_id"),
                    field_id=self._snapshot_uuid(source, "field_id"),
                    block_instance_id=self._optional_snapshot_uuid(source, "block_instance_id"),
                    label=str(source.get("label") or ""),
                    field_type=str(source.get("field_type") or ""),
                    before=before,
                    after=after,
                    changed_at=(
                        changed_at_by_value_id.get(UUID(str(value_id)))
                        if changed and value_id is not None
                        else None
                    ),
                )
            )

        baseline_attachments = self._snapshot_items_by_key(
            baseline,
            "attachments",
            lambda item: str(item.get("attachment_id")),
        )
        current_attachments = self._snapshot_items_by_key(
            current,
            "attachments",
            lambda item: str(item.get("attachment_id")),
        )
        attachment_diffs: list[PublicLinkReviewAttachmentDiff] = []
        for attachment_id in baseline_attachments.keys() - current_attachments.keys():
            attachment_diffs.append(
                self._attachment_diff(baseline_attachments[attachment_id], change="archived")
            )
        for attachment_id in current_attachments.keys() - baseline_attachments.keys():
            attachment_diffs.append(
                self._attachment_diff(current_attachments[attachment_id], change="added")
            )
        attachment_diffs.sort(key=lambda item: (item.change, str(item.attachment_id)))

        return PublicLinkReviewDiff(
            public_link=public_link,
            changed_field_count=changed_field_count,
            changed_attachment_count=len(attachment_diffs),
            fields=fields,
            attachments=attachment_diffs,
        )

    def validate_public_edit_token(self, *, raw_token: str) -> CardPublicLink:
        public_link = self._editable_public_link(raw_token)
        card = self._get_active_card(public_link.card_id)
        if not card.public_view_enabled or not card.public_edit_enabled:
            raise PermissionDeniedError("Public editing is disabled for this card.")
        self._require_field_edit_usage_available(public_link)
        return public_link

    def validate_public_field_edit(self, *, raw_token: str, field_id: UUID) -> CardPublicLink:
        public_link = self.validate_public_edit_token(raw_token=raw_token)
        self._resolve_public_edit_field(public_link=public_link, field_id=field_id)
        return public_link

    def validate_public_attachment_token(self, *, raw_token: str) -> CardPublicLink:
        public_link = self._editable_public_link(raw_token)
        card = self._get_active_card(public_link.card_id)
        if not card.public_view_enabled or not card.public_edit_enabled:
            raise PermissionDeniedError("Public editing is disabled for this card.")
        return public_link

    def preview_public_link(self, *, raw_token: str) -> PublicLinkPreview:
        public_link = self._viewable_public_link(raw_token)
        card = self._get_active_card(public_link.card_id)
        if not card.public_view_enabled:
            raise PermissionDeniedError("Public viewing is disabled for this card.")

        schema_rows = CardPublicAccessService(self.session).public_schema_rows_for_card(card)
        field_ids = [field_model.id for _, field_model in schema_rows]
        values_by_instance_field = self._field_values_by_instance(
            card_id=card.id,
            field_ids=field_ids,
        )
        item_ids_by_value_id = self._multi_select_item_ids(list(values_by_instance_field.values()))
        instances_by_block = self._block_instances_for_card(card.id)
        blocks: list[PublicPreviewBlock] = []

        for block in self._ordered_public_blocks(schema_rows):
            instances = instances_by_block.get(block.id) or [
                CardBlockInstance(card_id=card.id, block_id=block.id, ordinal=0)
            ]
            block_fields = [
                field_model for row_block, field_model in schema_rows if row_block.id == block.id
            ]
            preview_instances: list[PublicPreviewBlockInstance] = []
            for instance in instances:
                preview_fields = [
                    self._field_preview(
                        field_model=field_model,
                        field_value=(
                            values_by_instance_field.get((instance.id, field_model.id))
                            if instance.id is not None
                            else None
                        ),
                        item_ids_by_value_id=item_ids_by_value_id,
                        card=card,
                    )
                    for field_model in block_fields
                ]
                preview_instances.append(
                    PublicPreviewBlockInstance(
                        block_instance_id=instance.id,
                        ordinal=instance.ordinal,
                        fields=preview_fields,
                    )
                )
            blocks.append(
                PublicPreviewBlock(
                    block_id=block.id,
                    code=block.code,
                    title=block.title,
                    is_repeatable=block.is_repeatable,
                    layout_columns=block.layout_columns,
                    display_config_json=block.display_config_json,
                    instances=preview_instances,
                )
            )

        return PublicLinkPreview(
            card_id=card.id,
            display_name=card.display_name,
            expires_at=public_link.expires_at,
            can_edit=(
                public_link.status in EDITABLE_PUBLIC_LINK_STATUSES
                and public_link.can_edit
                and card.public_edit_enabled
            ),
            form_layout=self._sanitized_public_form_layout(card, schema_rows),
            blocks=blocks,
        )

    def edit_card_field_with_token(
        self,
        *,
        raw_token: str,
        field_id: UUID,
        value: object,
        block_instance_id: UUID | None = None,
    ) -> FieldValue:
        public_link = self._editable_public_link(raw_token, lock_for_update=True)
        self._require_field_edit_usage_available(public_link)
        card, field = self._resolve_public_edit_field(
            public_link=public_link,
            field_id=field_id,
        )

        field_value = CardService(self.session).set_field_value_from_public_link(
            actor_public_link_id=public_link.id,
            card_id=card.id,
            field_id=field.id,
            value=value,
            block_instance_id=block_instance_id,
        )
        public_link.used_count += 1
        self.session.flush()
        AuditService(self.session).record_public_link_event(
            actor_public_link_id=public_link.id,
            action="public_link.update",
            object_type="field_value",
            object_id=field_value.id,
            new_data_json={"card_id": str(card.id), "field_id": str(field.id)},
        )
        return field_value

    def _resolve_public_edit_field(
        self,
        *,
        public_link: CardPublicLink,
        field_id: UUID,
    ) -> tuple[Card, FormField]:
        card = self._get_active_card(public_link.card_id)
        field = self._get_active_public_field(field_id)
        block = self._get_public_block(field.block_id)

        if block.registry_id != card.registry_id:
            raise PermissionDeniedError("Public link cannot edit fields from another registry.")
        if not public_link.can_edit or not card.public_view_enabled or not card.public_edit_enabled:
            raise PermissionDeniedError("Public editing is disabled for this card.")
        if not CardPublicAccessService(self.session).is_field_publicly_editable(
            card=card,
            field_id=field.id,
        ):
            raise PermissionDeniedError("Field is not public editable.")
        return card, field

    def _public_link_for_token(
        self,
        raw_token: str,
        *,
        lock_for_update: bool = False,
    ) -> CardPublicLink:
        token_hash = hash_public_token(raw_token)
        statement = select(CardPublicLink).where(CardPublicLink.token_hash == token_hash)
        if lock_for_update:
            statement = statement.execution_options(populate_existing=True).with_for_update()
        public_link = self.session.scalars(statement).one_or_none()
        if public_link is None:
            raise PublicLinkError("Public link was not found.")
        return public_link

    def _editable_public_link(
        self,
        raw_token: str,
        *,
        lock_for_update: bool = False,
    ) -> CardPublicLink:
        public_link = self._public_link_for_token(
            raw_token,
            lock_for_update=lock_for_update,
        )
        self._require_not_expired(public_link)
        if public_link.status == "submitted":
            raise PublicLinkSubmittedReadOnlyError("Public link was already submitted.")
        if public_link.status not in EDITABLE_PUBLIC_LINK_STATUSES:
            raise PermissionDeniedError("Public link is not editable.")
        if not public_link.can_edit:
            raise PermissionDeniedError("Public editing is disabled for this card.")
        return public_link

    def _viewable_public_link(self, raw_token: str) -> CardPublicLink:
        public_link = self._public_link_for_token(raw_token)
        self._require_not_expired(public_link)
        if not public_link.can_view:
            raise PermissionDeniedError("Public viewing is disabled for this card.")
        return public_link

    def _locked_public_link(self, public_link_id: UUID) -> CardPublicLink:
        public_link = self.session.scalars(
            select(CardPublicLink)
            .where(CardPublicLink.id == public_link_id)
            .execution_options(populate_existing=True)
            .with_for_update()
        ).one_or_none()
        if public_link is None:
            raise PublicLinkError("Public link was not found.")
        return public_link

    def _require_not_expired(self, public_link: CardPublicLink) -> None:
        if self._expire_if_needed(public_link):
            raise PersistStatePermissionDeniedError("Public link has expired.")

    def _expire_if_needed(self, public_link: CardPublicLink) -> bool:
        if (
            public_link.status in EXPIRABLE_PUBLIC_LINK_STATUSES
            and public_link.expires_at is not None
            and public_link.expires_at <= datetime.now(UTC)
        ):
            old_status = public_link.status
            public_link.status = "expired"
            public_link.can_view = False
            public_link.can_edit = False
            AuditService(self.session).record_system_event(
                action="public_link.expire",
                object_type="card_public_link",
                object_id=public_link.id,
                old_data_json={"status": old_status},
                new_data_json={"status": "expired"},
            )
            return True
        return public_link.status == "expired"

    def _require_transition(self, public_link: CardPublicLink, target_status: str) -> None:
        if target_status not in ALLOWED_PUBLIC_LINK_TRANSITIONS.get(public_link.status, set()):
            raise PublicLinkTransitionError(
                f"Public link cannot transition from {public_link.status} to {target_status}."
            )

    def _review_snapshot(
        self,
        public_link: CardPublicLink,
        *,
        include_internal: bool = False,
    ) -> dict[str, Any]:
        card = self._get_active_card(public_link.card_id)
        schema_rows = CardPublicAccessService(self.session).public_editable_schema_rows_for_card(
            card
        )
        field_ids = [field_model.id for _, field_model in schema_rows]
        values_by_instance_field = self._field_values_by_instance(
            card_id=card.id,
            field_ids=field_ids,
        )
        item_ids_by_value_id = self._multi_select_item_ids(list(values_by_instance_field.values()))
        instances_by_block = self._block_instances_for_card(card.id)
        fields: list[dict[str, Any]] = []
        for block in self._ordered_public_blocks(schema_rows):
            instances: list[CardBlockInstance | None] = list(instances_by_block.get(block.id, []))
            if not instances and not block.is_repeatable:
                instances = [None]
            block_fields = [
                field_model for row_block, field_model in schema_rows if row_block.id == block.id
            ]
            for instance in instances:
                for field_model in block_fields:
                    field_value = (
                        values_by_instance_field.get((instance.id, field_model.id))
                        if instance is not None
                        else None
                    )
                    item = {
                        "block_id": str(block.id),
                        "field_id": str(field_model.id),
                        "block_instance_id": str(instance.id) if instance is not None else None,
                        "is_repeatable": block.is_repeatable,
                        "label": field_model.label,
                        "field_type": field_model.field_type,
                        "value": self._json_safe_value(
                            self._read_field_value(
                                field_model,
                                field_value,
                                item_ids_by_value_id,
                            )
                        ),
                    }
                    if include_internal and field_value is not None:
                        item["_field_value_id"] = str(field_value.id)
                    fields.append(item)

        attachments = [
            {
                "attachment_id": str(attachment.id),
                "title": attachment.title,
                "original_filename": stored_file.original_filename,
                "content_length_bytes": stored_file.content_length_bytes,
            }
            for attachment, stored_file in self.session.execute(
                select(CardAttachment, StoredFile)
                .join(StoredFile, StoredFile.id == CardAttachment.stored_file_id)
                .where(
                    CardAttachment.card_id == card.id,
                    CardAttachment.archived_at.is_(None),
                    StoredFile.archived_at.is_(None),
                )
                .order_by(CardAttachment.position, CardAttachment.id)
            )
        ]
        return {"version": 1, "fields": fields, "attachments": attachments}

    def _submission_summary(self, public_link: CardPublicLink) -> dict[str, int]:
        fields = self._review_snapshot(public_link).get("fields", [])
        completed = sum(
            1
            for item in fields
            if isinstance(item, dict) and self._review_value_is_completed(item.get("value"))
        )
        return {
            "completed_public_fields": completed,
            "total_public_fields": len(fields),
        }

    def _review_value_is_completed(self, value: object) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, list | dict):
            return bool(value)
        return True

    def _json_safe_value(self, value: object) -> object:
        if value is None or isinstance(value, str | int | float | bool):
            return value
        if isinstance(value, Decimal):
            return format(value, "f")
        if isinstance(value, datetime | date):
            return value.isoformat()
        if isinstance(value, UUID):
            return str(value)
        if isinstance(value, list | tuple):
            return [self._json_safe_value(item) for item in value]
        if isinstance(value, dict):
            return {str(key): self._json_safe_value(item) for key, item in value.items()}
        return str(value)

    def _summary_count(self, summary: dict[str, Any], key: str) -> int | None:
        value = summary.get(key)
        return value if isinstance(value, int) and not isinstance(value, bool) else None

    def _snapshot_items_by_key(
        self,
        snapshot: dict[str, Any],
        section: str,
        key_func: Callable[[dict[str, Any]], object],
    ) -> dict[object, dict[str, Any]]:
        raw_items = snapshot.get(section)
        if not isinstance(raw_items, list):
            raise PublicLinkError("Public link review snapshot is invalid.")
        result: dict[object, dict[str, Any]] = {}
        for raw_item in raw_items:
            if not isinstance(raw_item, dict):
                raise PublicLinkError("Public link review snapshot is invalid.")
            result[key_func(raw_item)] = raw_item
        return result

    def _field_snapshot_key(self, item: dict[str, Any]) -> tuple[str, str | None, str]:
        block_instance_id = (
            str(item["block_instance_id"]) if item.get("block_instance_id") is not None else None
        )
        if item.get("is_repeatable") is False:
            block_instance_id = None
        return (
            str(item.get("block_id")),
            block_instance_id,
            str(item.get("field_id")),
        )

    def _snapshot_uuid(self, item: dict[str, Any], key: str) -> UUID:
        try:
            return UUID(str(item[key]))
        except (KeyError, TypeError, ValueError) as exc:
            raise PublicLinkError("Public link review snapshot is invalid.") from exc

    def _optional_snapshot_uuid(self, item: dict[str, Any], key: str) -> UUID | None:
        if item.get(key) is None:
            return None
        return self._snapshot_uuid(item, key)

    def _field_change_timestamps(self, public_link_id: UUID) -> dict[UUID, datetime]:
        timestamps: dict[UUID, datetime] = {}
        for event in self.session.scalars(
            select(AuditEvent)
            .where(
                AuditEvent.actor_public_link_id == public_link_id,
                AuditEvent.object_type == "field_value",
                AuditEvent.action == "public_link.update",
            )
            .order_by(AuditEvent.created_at, AuditEvent.id)
        ):
            if event.object_id is not None:
                timestamps[event.object_id] = event.created_at
        return timestamps

    def _attachment_diff(
        self,
        item: dict[str, Any],
        *,
        change: str,
    ) -> PublicLinkReviewAttachmentDiff:
        content_length = item.get("content_length_bytes")
        if not isinstance(content_length, int) or isinstance(content_length, bool):
            raise PublicLinkError("Public link review snapshot is invalid.")
        return PublicLinkReviewAttachmentDiff(
            attachment_id=self._snapshot_uuid(item, "attachment_id"),
            title=str(item.get("title") or ""),
            original_filename=str(item.get("original_filename") or ""),
            content_length_bytes=content_length,
            change=change,
        )

    def _require_field_edit_usage_available(self, public_link: CardPublicLink) -> None:
        if public_link.max_uses is not None and public_link.used_count >= public_link.max_uses:
            raise PermissionDeniedError("Public link usage limit is exhausted.")

    def _card_allows_public_edit(self, card_id: UUID) -> bool:
        card = self.session.get(Card, card_id)
        return bool(
            card is not None
            and card.archived_at is None
            and card.lifecycle_status not in {"archived", "superseded"}
            and card.public_view_enabled
            and card.public_edit_enabled
        )

    def _get_active_card(self, card_id: UUID) -> Card:
        card = self.session.get(Card, card_id)
        if (
            card is None
            or card.archived_at is not None
            or card.lifecycle_status in {"archived", "superseded"}
        ):
            raise CardServiceError("Card was not found.")
        return card

    def _require_card_permission(self, actor_user_id: UUID, card: Card) -> None:
        if not PermissionService(self.session).has_permission(
            actor_user_id,
            "cards.manage",
            organization_id=card.organization_id,
            registry_id=card.registry_id,
        ):
            raise PermissionDeniedError("Actor cannot manage public links for this card.")

    def _require_review_permission(self, actor_user_id: UUID, card: Card) -> None:
        if not PermissionService(self.session).has_permission(
            actor_user_id,
            "cards.manage",
            organization_id=card.organization_id,
            registry_id=card.registry_id,
        ):
            raise PublicLinkReviewPermissionDeniedError(
                "Actor cannot review public links for this card."
            )

    def _validated_public_schema_allowlists(
        self,
        *,
        card: Card,
        allowed_block_ids: list[UUID] | None,
        allowed_field_ids: list[UUID] | None,
    ) -> tuple[dict[str, list[str]] | None, dict[str, list[str]] | None]:
        block_ids = (
            list(dict.fromkeys(allowed_block_ids)) if allowed_block_ids is not None else None
        )
        field_ids = (
            list(dict.fromkeys(allowed_field_ids)) if allowed_field_ids is not None else None
        )
        restrict_to_template = block_ids is not None or field_ids is not None
        template_field_ids = self._card_template_field_ids(card) if restrict_to_template else set()
        template_block_ids = (
            set(
                self.session.scalars(
                    select(FormField.block_id).where(FormField.id.in_(template_field_ids))
                ).all()
            )
            if template_field_ids
            else set()
        )
        blocks_by_id: dict[UUID, FormBlock] = {}
        if block_ids:
            blocks_by_id = {
                block.id: block
                for block in self.session.scalars(
                    select(FormBlock).where(FormBlock.id.in_(block_ids))
                ).all()
            }
        if block_ids is not None and any(
            (block := blocks_by_id.get(block_id)) is None
            or block.registry_id != card.registry_id
            or block.archived_at is not None
            or not block.is_active
            or not block.public_visible
            or not block.public_editable
            or block_id not in template_block_ids
            for block_id in block_ids
        ):
            raise PublicLinkError("Public link block allowlist is invalid.")

        if field_ids:
            field_rows = {
                field_model.id: (field_model, block)
                for field_model, block in self.session.execute(
                    select(FormField, FormBlock)
                    .join(FormBlock, FormBlock.id == FormField.block_id)
                    .where(FormField.id.in_(field_ids))
                )
            }
        else:
            field_rows = {}
        selected_block_ids = set(block_ids) if block_ids is not None else None
        if field_ids is not None and any(
            (row := field_rows.get(field_id)) is None
            or row[1].registry_id != card.registry_id
            or row[1].archived_at is not None
            or not row[1].is_active
            or not row[1].public_visible
            or not row[1].public_editable
            or row[0].archived_at is not None
            or not row[0].is_active
            or not row[0].public_visible
            or not row[0].public_editable
            or row[0].field_type in {"file_ref", "static_text"}
            or field_id not in template_field_ids
            or (selected_block_ids is not None and row[0].block_id not in selected_block_ids)
            for field_id in field_ids
        ):
            raise PublicLinkError("Public link field allowlist is invalid.")

        return (
            {"ids": [str(block_id) for block_id in block_ids]} if block_ids is not None else None,
            {"ids": [str(field_id) for field_id in field_ids]} if field_ids is not None else None,
        )

    def _card_template_field_ids(self, card: Card) -> set[UUID]:
        template = self.session.get(CardTemplate, card.card_template_id)
        raw_field_ids = (
            template.field_schema_json.get("field_ids") if template is not None else None
        )
        if not isinstance(raw_field_ids, list):
            return set()
        field_ids: set[UUID] = set()
        for raw_field_id in raw_field_ids:
            try:
                field_ids.add(UUID(str(raw_field_id)))
            except (TypeError, ValueError):
                continue
        return field_ids

    def _sanitized_public_form_layout(
        self,
        card: Card,
        schema_rows: list[tuple[FormBlock, FormField]],
    ) -> dict[str, Any]:
        template = self.session.get(CardTemplate, card.card_template_id)
        if template is None:
            raise PublicLinkError("Card template was not found.")
        blocks_by_id = {block.id: block for block, _ in schema_rows}
        fields_by_id = {field_model.id: field_model for _, field_model in schema_rows}
        form_layout = resolve_card_template_form_layout(
            template.field_schema_json,
            blocks=[{"id": str(block.id)} for block in blocks_by_id.values()],
            fields=[
                {
                    "id": str(field_model.id),
                    "block_id": str(field_model.block_id),
                }
                for field_model in fields_by_id.values()
            ],
        )
        allowed_block_ids = {str(block_id) for block_id in blocks_by_id}
        allowed_field_ids = {str(field_id) for field_id in fields_by_id}
        sections: list[dict[str, Any]] = []
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

    def _get_active_public_field(self, field_id: UUID) -> FormField:
        field = self.session.get(FormField, field_id)
        if field is None or field.archived_at is not None or not field.is_active:
            raise PublicLinkError("Field was not found.")
        return field

    def _get_public_block(self, block_id: UUID) -> FormBlock:
        block = self.session.get(FormBlock, block_id)
        if block is None or block.archived_at is not None or not block.is_active:
            raise PublicLinkError("Block was not found.")
        return block

    def _public_link_allows(self, allowed_json: dict[str, Any] | None, object_id: UUID) -> bool:
        if not allowed_json:
            return True
        allowed_ids = allowed_json.get("ids")
        if not isinstance(allowed_ids, list):
            return True
        return str(object_id) in allowed_ids

    def _public_link_uses_explicit_allowlists(self, public_link: CardPublicLink) -> bool:
        return (
            public_link.allowed_blocks_json is not None
            or public_link.allowed_fields_json is not None
        )

    def _public_schema_rows(
        self,
        *,
        registry_id: UUID,
        public_link: CardPublicLink,
    ) -> list[tuple[FormBlock, FormField]]:
        rows = self.session.execute(
            select(FormBlock, FormField)
            .join(FormField, FormField.block_id == FormBlock.id)
            .where(
                FormBlock.registry_id == registry_id,
                FormBlock.archived_at.is_(None),
                FormBlock.is_active.is_(True),
                FormBlock.public_visible.is_(True),
                FormField.archived_at.is_(None),
                FormField.is_active.is_(True),
                FormField.public_visible.is_(True),
            )
            .order_by(FormBlock.position, FormBlock.code, FormField.position, FormField.code)
        )
        template_field_ids = (
            self._card_template_field_ids(self._get_active_card(public_link.card_id))
            if self._public_link_uses_explicit_allowlists(public_link)
            else None
        )
        return [
            (block, field_model)
            for block, field_model in rows
            if self._public_schema_row_is_allowed(
                public_link=public_link,
                block=block,
                field_model=field_model,
                template_field_ids=template_field_ids,
            )
        ]

    def _public_schema_row_is_allowed(
        self,
        *,
        public_link: CardPublicLink,
        block: FormBlock,
        field_model: FormField,
        template_field_ids: set[UUID] | None,
    ) -> bool:
        if not self._public_link_allows(public_link.allowed_blocks_json, block.id):
            return False
        if template_field_ids is not None and field_model.id not in template_field_ids:
            return False
        if field_model.field_type == "static_text":
            if not self._public_link_uses_explicit_allowlists(public_link):
                return True
            return public_link.allowed_blocks_json is not None and block.public_editable
        return (
            self._public_link_allows(public_link.allowed_fields_json, field_model.id)
            and block.public_editable
            and field_model.public_editable
        )

    def _ordered_public_blocks(
        self,
        schema_rows: list[tuple[FormBlock, FormField]],
    ) -> list[FormBlock]:
        blocks_by_id: dict[UUID, FormBlock] = {}
        for block, _ in schema_rows:
            blocks_by_id.setdefault(block.id, block)
        return list(blocks_by_id.values())

    def _field_values_by_instance(
        self,
        *,
        card_id: UUID,
        field_ids: list[UUID],
    ) -> dict[tuple[UUID, UUID], FieldValue]:
        if not field_ids:
            return {}
        return {
            (value.block_instance_id, value.field_id): value
            for value in self.session.scalars(
                select(FieldValue).where(
                    FieldValue.card_id == card_id,
                    FieldValue.field_id.in_(field_ids),
                )
            ).all()
        }

    def _block_instances_for_card(self, card_id: UUID) -> dict[UUID, list[CardBlockInstance]]:
        instances: dict[UUID, list[CardBlockInstance]] = {}
        for instance in self.session.scalars(
            select(CardBlockInstance)
            .where(
                CardBlockInstance.card_id == card_id,
                CardBlockInstance.archived_at.is_(None),
            )
            .order_by(CardBlockInstance.block_id, CardBlockInstance.ordinal)
        ):
            instances.setdefault(instance.block_id, []).append(instance)
        return instances

    def _multi_select_item_ids(
        self,
        field_values: list[FieldValue],
    ) -> dict[UUID, list[UUID]]:
        value_ids = [field_value.id for field_value in field_values]
        if not value_ids:
            return {}

        result: dict[UUID, list[UUID]] = {}
        rows = self.session.execute(
            select(FieldValueItem.field_value_id, FieldValueItem.reference_item_id)
            .where(FieldValueItem.field_value_id.in_(value_ids))
            .order_by(FieldValueItem.position, FieldValueItem.id)
        ).all()
        for value_id, item_id in rows:
            result.setdefault(value_id, []).append(item_id)
        return result

    def _field_preview(
        self,
        *,
        field_model: FormField,
        field_value: FieldValue | None,
        item_ids_by_value_id: dict[UUID, list[UUID]],
        card: Card,
    ) -> PublicPreviewField:
        return PublicPreviewField(
            field_id=field_model.id,
            code=field_model.code,
            label=field_model.label,
            description=field_model.description,
            field_type=field_model.field_type,
            required_mode=field_model.required_mode,
            value=self._read_field_value(field_model, field_value, item_ids_by_value_id),
            options_source_type=field_model.options_source_type,
            options_source_id=field_model.options_source_id,
            options_config_json=field_model.options_config_json,
            display_config_json=field_model.display_config_json,
            options=self._reference_options(
                field_model,
                card=card,
            ),
        )

    def _reference_options(
        self,
        field_model: FormField,
        *,
        card: Card,
    ) -> list[PublicPreviewOption]:
        if field_model.field_type == "organization_ref":
            allowed_ids = CardService(self.session)._public_allowed_organization_ids(field_model)
            organizations = [
                organization
                for organization in self.session.scalars(
                    select(Organization).where(
                        Organization.id.in_(allowed_ids),
                        Organization.archived_at.is_(None),
                        Organization.is_active.is_(True),
                    )
                ).all()
            ] if allowed_ids else []
            return [
                PublicPreviewOption(
                    id=option.id,
                    code="",
                    label=option.label,
                    archived=option.archived,
                )
                for option in CardService(self.session)._organization_options(organizations)
            ]
        if field_model.field_type == "org_unit_ref":
            return [
                PublicPreviewOption(
                    id=option.id,
                    code="",
                    label=option.label,
                    archived=option.archived,
                )
                for option in CardService(self.session)._org_unit_options_for_card_field(
                    card=card,
                    field_model=field_model,
                )
            ]
        if (
            field_model.field_type not in {"select", "multi_select"}
            or field_model.options_source_type != "reference_list"
            or field_model.options_source_id is None
        ):
            return []

        try:
            items = ReferenceListService(self.session).list_effective_items_for_field(
                field_model=field_model,
                registry_id=card.registry_id,
                organization_id=card.organization_id,
            )
        except ReferenceListError as exc:
            raise PublicLinkError(str(exc)) from exc

        return [PublicPreviewOption(id=item.id, code=item.code, label=item.label) for item in items]

    def _read_field_value(
        self,
        field_model: FormField,
        field_value: FieldValue | None,
        item_ids_by_value_id: dict[UUID, list[UUID]],
    ) -> object | None:
        if field_value is None:
            return None
        if field_model.field_type == "text":
            return field_value.value_text
        if field_model.field_type == "number":
            return field_value.value_number
        if field_model.field_type == "date":
            return field_value.value_date
        if field_model.field_type == "datetime":
            return field_value.value_datetime
        if field_model.field_type == "bool":
            return field_value.value_bool
        if field_model.field_type == "json":
            return field_value.value_json
        if field_model.field_type == "select":
            return field_value.value_reference_item_id
        if field_model.field_type == "multi_select":
            return item_ids_by_value_id.get(field_value.id, [])
        if field_model.field_type == "organization_ref":
            return field_value.value_organization_id
        if field_model.field_type == "org_unit_ref":
            return field_value.value_org_unit_id
        if field_model.field_type == "user_ref":
            return field_value.value_user_id
        if field_model.field_type == "card_ref":
            return field_value.value_card_id
        if field_model.field_type == "registry_ref":
            return field_value.value_registry_id
        return None
