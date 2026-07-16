# Card Change Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an internal, Russian-first notification centre for card changes, personal card subscriptions, and public-link creator subscriptions without notifying a user about their own actions.

**Architecture:** Persist personal subscriptions separately from immutable, user-specific notification inbox items. Generate inbox items from the same `card_history` audit events that drive the card-history UI; use its safe presentation code and the event's effective actor (`attributed_user_id` for public links) before storing an inbox payload. The frontend polls the signed-in user's small inbox endpoint, renders a top-bar bell/dropdown, and exposes subscription switches in the card and public-link controls.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic/PostgreSQL, Pydantic, pytest, React, TypeScript, TanStack Query, Vitest, Vite, existing global CSS.

## Global Constraints

- Preserve schema-driven cards; do not add fixed business fields or tables for registry data.
- Enforce card visibility, subscription ownership, and notification reads on the backend.
- Card-change payloads must use the existing safe history projection and `sensitivity_level`; never return raw audit diffs, UUIDs, hashes, or public tokens.
- Use Russian-first visible labels and empty/error states.
- Card-history and notification retention is exactly 14 days; technical audit remains exactly 3 days.
- Do not create email, messenger, browser push, websocket, or global-all-card notification functionality.
- Use the current `main` branch, focused changes, TDD, and do not revert unrelated work.

---

## File structure

- Create `backend/app/models/card_change_notification.py` — subscription and inbox SQLAlchemy models.
- Modify `backend/app/models/__init__.py` — register the three models with metadata and imports.
- Create `backend/migrations/versions/0032_card_change_notifications.py` — PostgreSQL schema, foreign keys, uniqueness, and lookup indexes.
- Create `backend/app/schemas/card_change_notifications.py` — subscription and safe inbox response models.
- Create `backend/app/services/card_change_notifications.py` — access checks, subscriptions, safe materialisation, inbox reads, marks, and retention.
- Modify `backend/app/services/audit.py` — expose safe history presentation to the notification service and dispatch card-history events, including deferred batches.
- Modify `backend/app/services/cards.py` — defer individual field event notifications while one bulk save is in progress, then emit one combined notification.
- Create `backend/app/api/v1/endpoints/card_change_notifications.py` — authenticated inbox and read-state routes.
- Modify `backend/app/api/v1/endpoints/cards.py` — card subscription read/toggle routes.
- Modify `backend/app/api/v1/endpoints/public_links.py` and `backend/app/schemas/public_links.py` — creator-only public-link subscription route and caller-specific state in list responses.
- Modify `backend/app/api/v1/router.py` — register the inbox router.
- Modify `backend/app/cli/audit_retention.py` — delete expired notification inbox items in the existing daily maintenance run.
- Create/update backend tests under `backend/tests/` for models/migration, service/API behaviour, retention, and grouped saves.
- Modify `frontend/src/api/types.ts` and `frontend/src/api/client.ts` — typed notification and subscription contracts.
- Create `frontend/src/features/notifications/CardChangeNotificationBell.tsx` and its Vitest file — top-bar inbox UI.
- Create `frontend/src/features/cards/CardChangeNotificationToggle.tsx` and its Vitest file — per-card subscription control.
- Modify `frontend/src/features/cards/CardsWorkspace.tsx` — render the card switch for readable cards.
- Modify `frontend/src/features/cards/PublicLinkReviewPanel.tsx` and its test — render a public-link subscription switch only for its creator.
- Modify `frontend/src/pages/HomePage.tsx` — add the bell and navigate a notification click to the card.
- Modify `frontend/src/styles/globals.css` — bell, unread badge, compact floating panel, and subscription-control styles.
- Modify `PLANS.md` — record implementation, migration, release, and live-proof status after the feature is verified.

### Task 1: Persist subscription and inbox data

**Files:**
- Create: `backend/app/models/card_change_notification.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/migrations/versions/0032_card_change_notifications.py`
- Modify: `backend/tests/test_models_smoke.py`
- Modify: `backend/tests/test_migrations.py`
- Modify: `backend/tests/test_schema_constraints.py`

**Interfaces:**
- Produces `CardChangeNotificationSubscription`, `PublicLinkChangeNotificationSubscription`, and `CardChangeNotification` for services and migrations.
- Produces a migration after `0031_card_audit_history` that can be applied to an empty disposable PostgreSQL database and upgraded safely on the runtime database.

- [ ] **Step 1: Write failing model and migration contract tests**

  Add assertions that `Base.metadata.tables` contains `card_change_notification_subscriptions`, `public_link_change_notification_subscriptions`, and `card_change_notifications`; assert the two subscriber-to-target unique constraints and an inbox index on `(user_id, read_at, created_at)`.

  Add an offline Alembic SQL assertion for these table names, foreign keys to `users`, `cards`, and `card_public_links`, `changes_json JSONB`, and the unread lookup index.

- [ ] **Step 2: Run the focused contracts to verify failure**

  Run: `python -m pytest tests/test_models_smoke.py tests/test_migrations.py tests/test_schema_constraints.py -q`

  Expected: FAIL because the notification models and `0032_card_change_notifications` revision do not exist.

- [ ] **Step 3: Add minimal models and migration**

  Define these model shapes in `backend/app/models/card_change_notification.py`:

  ```python
  class CardChangeNotificationSubscription(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
      __tablename__ = "card_change_notification_subscriptions"
      __table_args__ = (
          UniqueConstraint("user_id", "card_id", name="uq_card_change_notification_subscription"),
          Index("ix_card_change_notification_subscription_card", "card_id"),
      )
      user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
      card_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"))

  class PublicLinkChangeNotificationSubscription(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
      __tablename__ = "public_link_change_notification_subscriptions"
      __table_args__ = (
          UniqueConstraint("user_id", "public_link_id", name="uq_public_link_change_notification_subscription"),
          Index("ix_public_link_change_notification_subscription_link", "public_link_id"),
      )
      user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
      public_link_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("card_public_links.id"))

  class CardChangeNotification(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
      __tablename__ = "card_change_notifications"
      __table_args__ = (
          Index("ix_card_change_notifications_inbox", "user_id", "read_at", "created_at"),
          Index("ix_card_change_notifications_retention", "created_at"),
      )
      user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"))
      card_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("cards.id"))
      actor_display_name: Mapped[str] = mapped_column(String, nullable=False)
      changes_json: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
      read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
  ```

  Register all three models in `app.models.__init__`. Create revision `0032_card_change_notifications` with `down_revision = "0031_card_audit_history"`; create all three tables in schema `public`, their foreign keys, unique constraints, and indexes. Do not add cascading delete rules because cards and links are soft-archived.

- [ ] **Step 4: Run focused contracts to verify pass**

  Run: `python -m pytest tests/test_models_smoke.py tests/test_migrations.py tests/test_schema_constraints.py -q`

  Expected: PASS, with all new metadata and SQL assertions green.

- [ ] **Step 5: Commit the persisted foundation**

  ```powershell
  git add backend/app/models/card_change_notification.py backend/app/models/__init__.py backend/migrations/versions/0032_card_change_notifications.py backend/tests/test_models_smoke.py backend/tests/test_migrations.py backend/tests/test_schema_constraints.py
  git commit -m "feat: add card change notification storage"
  ```

### Task 2: Implement safe notification service and authenticated contracts

**Files:**
- Create: `backend/app/schemas/card_change_notifications.py`
- Create: `backend/app/services/card_change_notifications.py`
- Create: `backend/app/api/v1/endpoints/card_change_notifications.py`
- Modify: `backend/app/api/v1/endpoints/cards.py`
- Modify: `backend/app/api/v1/endpoints/public_links.py`
- Modify: `backend/app/schemas/public_links.py`
- Modify: `backend/app/api/v1/router.py`
- Create: `backend/tests/test_card_change_notification_services.py`
- Create: `backend/tests/test_api_card_change_notifications.py`

**Interfaces:**
- Consumes the models from Task 1 and safe audit presentation from Task 3.
- Produces these HTTP contracts:

  ```text
  GET  /api/v1/card-change-notifications?limit=20
  POST /api/v1/card-change-notifications/{notification_id}/read
  POST /api/v1/card-change-notifications/read-all
  GET  /api/v1/cards/{card_id}/change-notification-subscription
  PUT  /api/v1/cards/{card_id}/change-notification-subscription
  GET  /api/v1/public-links/{public_link_id}/change-notification-subscription
  PUT  /api/v1/public-links/{public_link_id}/change-notification-subscription
  ```

- [ ] **Step 1: Write failing service and API tests**

  Add tests with an accessible card, an inaccessible card, two ordinary users, and a public-link creator. Cover:

  ```python
  assert service.set_card_subscription_for_actor(actor_user_id=reader.id, card_id=card.id, enabled=True).enabled
  with pytest.raises(PermissionDeniedError):
      service.set_card_subscription_for_actor(actor_user_id=outsider.id, card_id=card.id, enabled=True)
  with pytest.raises(PermissionDeniedError):
      service.set_public_link_subscription_for_actor(actor_user_id=manager.id, public_link_id=link.id, enabled=True)
  ```

  Test `GET` returns only the caller's inbox and unread count, `POST /read` is idempotent, `POST /read-all` affects only the caller, and a notification for a card after its reader loses organization access is omitted from the response.

- [ ] **Step 2: Run the focused tests to verify failure**

  Run: `python -m pytest tests/test_card_change_notification_services.py tests/test_api_card_change_notifications.py -q`

  Expected: FAIL because the service, schemas, and routes do not exist.

- [ ] **Step 3: Add Pydantic schemas and the service**

  Use a small public contract that has no audit IDs or raw audit data:

  ```python
  class CardChangeNotificationSubscriptionRead(BaseModel):
      enabled: bool

  class CardChangeNotificationChangeRead(BaseModel):
      label: str
      before: object | None = None
      after: object | None = None
      description: str | None = None

  class CardChangeNotificationRead(BaseModel):
      id: UUID
      card_id: UUID
      card_display_name: str
      actor_display_name: str
      changes: list[CardChangeNotificationChangeRead]
      read_at: datetime | None
      created_at: datetime

  class CardChangeNotificationListRead(BaseModel):
      unread_count: int
      items: list[CardChangeNotificationRead]
  ```

  Implement `CardChangeNotificationService` with these methods:

  ```python
  get_card_subscription_for_actor(*, actor_user_id: UUID, card_id: UUID) -> bool
  set_card_subscription_for_actor(*, actor_user_id: UUID, card_id: UUID, enabled: bool) -> bool
  get_public_link_subscription_for_creator(*, actor_user_id: UUID, public_link_id: UUID) -> bool
  set_public_link_subscription_for_creator(*, actor_user_id: UUID, public_link_id: UUID, enabled: bool) -> bool
  list_for_actor(*, actor_user_id: UUID, limit: int) -> tuple[int, list[CardChangeNotification]]
  mark_read_for_actor(*, actor_user_id: UUID, notification_id: UUID) -> CardChangeNotification
  mark_all_read_for_actor(*, actor_user_id: UUID) -> int
  ```

  Card subscription methods must call `PermissionService.can_see_organization` against the card's organization and registry. Public-link methods must require `CardPublicLink.created_by == actor_user_id`; a card manager who did not create the link gets `PermissionDeniedError`. In all inbox reads, re-check `can_see_organization` before serializing the card name or change payload.

  Add the inbox router. Put card-subscription routes in `cards.py`, public-link-subscription routes in `public_links.py`, and register the inbox router in `api/v1/router.py`. Use `PUT` payload `{"enabled": true}` and return only `{"enabled": true}`. Extend the authenticated `PublicLinkRead` response with caller-specific `can_manage_change_notifications` and `change_notifications_enabled`; calculate them from the link creator, never expose `created_by` just for the UI.

- [ ] **Step 4: Run focused tests to verify pass**

  Run: `python -m pytest tests/test_card_change_notification_services.py tests/test_api_card_change_notifications.py -q`

  Expected: PASS, including all denial, ownership, idempotence, and lost-access cases.

- [ ] **Step 5: Commit subscription and inbox API**

  ```powershell
  git add backend/app/schemas/card_change_notifications.py backend/app/services/card_change_notifications.py backend/app/api/v1/endpoints/card_change_notifications.py backend/app/api/v1/endpoints/cards.py backend/app/api/v1/endpoints/public_links.py backend/app/schemas/public_links.py backend/app/api/v1/router.py backend/tests/test_card_change_notification_services.py backend/tests/test_api_card_change_notifications.py
  git commit -m "feat: add card change notification API"
  ```

### Task 3: Materialise notifications from safe card history

**Files:**
- Modify: `backend/app/services/audit.py`
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/services/public_links.py` only if a direct audit call needs an explicit batch argument
- Modify: `backend/app/services/card_change_notifications.py`
- Modify: `backend/tests/test_card_change_notification_services.py`
- Modify: `backend/tests/test_registry_card_services.py`
- Modify: `backend/tests/test_public_link_review_lifecycle.py`

**Interfaces:**
- Consumes `AuditEvent` objects returned by `AuditService.record_*_event`.
- Produces `CardChangeNotificationService.record_card_history_events(events: Sequence[AuditEvent]) -> list[CardChangeNotification]`.
- Preserves the existing audit event stream and `lifecycle_sync` exclusion.

- [ ] **Step 1: Write failing generation and grouping tests**

  Cover the following exact rules:

  ```python
  # The subscribed reader receives one safe notification for another user's field update.
  assert notification.actor_display_name == "Исполнитель"
  assert notification.changes_json == [{"label": "ФИО", "before": "Было", "after": "Стало"}]

  # The editor never receives a notification for their own normal update.
  assert service.list_for_actor(actor_user_id=editor.id, limit=20)[1] == []

  # A public-link edit uses attributed_user_id: its creator does not receive it.
  assert service.list_for_actor(actor_user_id=link_creator.id, limit=20)[1] == []

  # A subscriber to both a card and that public link receives exactly one inbox item.
  assert len(service.list_for_actor(actor_user_id=other_creator.id, limit=20)[1]) == 1
  ```

  Add a bulk `PATCH /cards/{card_id}/field-values` test that changes two normal fields in one payload and asserts two `AuditEvent` rows but one inbox row with two `changes_json` entries. Add sensitive and reference-field cases proving redaction and resolved labels match card-history output, never UUIDs.

- [ ] **Step 2: Run focused tests to verify failure**

  Run: `python -m pytest tests/test_card_change_notification_services.py tests/test_registry_card_services.py tests/test_public_link_review_lifecycle.py -q`

  Expected: FAIL because card-history events do not create inbox records or batch field changes.

- [ ] **Step 3: Expose the safe projector and dispatch only card-history events**

  In `AuditService`, expose a narrow method that reuses the existing `_card_history_presentations` logic rather than exposing it in an endpoint:

  ```python
  def present_card_history_events(
      self,
      events: Sequence[AuditEvent],
  ) -> dict[UUID, CardHistoryPresentation]:
      return self._card_history_presentations(events)
  ```

  Extend `record_user_event`, `record_public_link_event`, `record_reference_edit_link_event`, and `record_system_event` with optional `notification_batch: list[AuditEvent] | None = None`. After `_record` returns, dispatch only an event with `retention_class == "card_history"` and `action != "lifecycle_sync"`:

  ```python
  def _dispatch_card_change_notification(
      self, event: AuditEvent, notification_batch: list[AuditEvent] | None
  ) -> None:
      if event.retention_class != "card_history" or event.action == "lifecycle_sync":
          return
      if notification_batch is not None:
          notification_batch.append(event)
          return
      from app.services.card_change_notifications import CardChangeNotificationService
      CardChangeNotificationService(self.session).record_card_history_events([event])
  ```

  Keep the import local so the notification service can consume the safe audit projector without a module-import cycle.

  In `CardChangeNotificationService.record_card_history_events`, resolve recipients as the union of card subscribers and, when `event.actor_public_link_id` is set, subscribers to that exact public link. Compute `effective_actor_user_id = event.attributed_user_id or event.actor_user_id`; remove that ID from recipients. Project fields through `AuditService.present_card_history_events`, store only the field label plus safe before/after value or the standalone safe description, resolve the visible actor as attributed user first, then actor user, then `Система`, and insert one inbox row per remaining recipient.

- [ ] **Step 4: Batch the existing bulk field save**

  Add an optional `notification_batch` parameter to `CardService.set_field_value_for_actor`. Pass it to the audit call. In `set_field_values_for_actor`, create one list before the nested transaction, pass it to each per-field call, and dispatch once after all field audit rows are created:

  ```python
  notification_batch: list[AuditEvent] = []
  with self.session.begin_nested():
      field_values = [
          self.set_field_value_for_actor(
              actor_user_id=actor_user_id,
              card_id=card_id,
              field_id=item.field_id,
              value=item.value,
              block_instance_id=item.block_instance_id,
              synchronize_lifecycle=False,
              notification_batch=notification_batch,
          )
          for item in values
      ]
      self.synchronize_card_lifecycle(card, actor_user_id=actor_user_id)
  CardChangeNotificationService(self.session).record_card_history_events(notification_batch)
  ```

  Do not batch public-link autosaves: every public save is already one field operation. Existing card creation, archive, access, block, and public-link lifecycle audit events stay on the automatic dispatcher; own-action exclusion makes them safe for subscribers.

- [ ] **Step 5: Run focused tests to verify pass**

  Run: `python -m pytest tests/test_card_change_notification_services.py tests/test_registry_card_services.py tests/test_public_link_review_lifecycle.py -q`

  Expected: PASS with one notification for the two-field bulk save, no self-notification, no duplicate recipient, safe sensitive/reference rendering, and public-link attribution handling.

- [ ] **Step 6: Commit history-to-notification integration**

  ```powershell
  git add backend/app/services/audit.py backend/app/services/cards.py backend/app/services/public_links.py backend/app/services/card_change_notifications.py backend/tests/test_card_change_notification_services.py backend/tests/test_registry_card_services.py backend/tests/test_public_link_review_lifecycle.py
  git commit -m "feat: generate notifications from card history"
  ```

### Task 4: Apply 14-day inbox retention through the existing maintenance command

**Files:**
- Modify: `backend/app/services/card_change_notifications.py`
- Modify: `backend/app/cli/audit_retention.py`
- Modify: `backend/tests/test_audit_retention.py`
- Modify: `backend/tests/test_audit_retention_cli.py`

**Interfaces:**
- Produces `CardChangeNotificationService.delete_expired_notifications(now: datetime | None = None) -> int`.
- Keeps `AuditRetentionService.delete_expired_events` unchanged: technical audit remains 3 days and card history remains 14 days.

- [ ] **Step 1: Write failing retention tests**

  Add old and cutoff-exact `CardChangeNotification` fixtures and assert only the item older than `now - timedelta(days=14)` is deleted. Extend the CLI fake services and assert its output includes both `deleted_events=<n>` and `deleted_notifications=<n>`.

- [ ] **Step 2: Run retention tests to verify failure**

  Run: `python -m pytest tests/test_audit_retention.py tests/test_audit_retention_cli.py -q`

  Expected: FAIL because inbox rows are not yet part of daily cleanup.

- [ ] **Step 3: Implement deterministic cleanup**

  Use the same timezone validation and strict boundary as the current audit retention service:

  ```python
  def delete_expired_notifications(self, *, now: datetime | None = None) -> int:
      evaluated_at = now or datetime.now(UTC)
      if evaluated_at.tzinfo is None:
          raise ValueError("Notification retention time must include a timezone.")
      result = self.session.execute(
          delete(CardChangeNotification).where(
              CardChangeNotification.created_at < evaluated_at - CARD_HISTORY_RETENTION
          )
      )
      self.session.flush()
      return int(cast(CursorResult[Any], result).rowcount or 0)
  ```

  In `audit_retention.main`, execute both deletion methods in one session, commit once, and print `Audit retention completed: deleted_events=<n> deleted_notifications=<n>`.

- [ ] **Step 4: Run retention tests to verify pass**

  Run: `python -m pytest tests/test_audit_retention.py tests/test_audit_retention_cli.py -q`

  Expected: PASS with 14-day notification cleanup and unchanged audit-class cutoffs.

- [ ] **Step 5: Commit retention support**

  ```powershell
  git add backend/app/services/card_change_notifications.py backend/app/cli/audit_retention.py backend/tests/test_audit_retention.py backend/tests/test_audit_retention_cli.py
  git commit -m "feat: retain card notifications for fourteen days"
  ```

### Task 5: Add typed frontend API and personal subscription controls

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/features/cards/CardChangeNotificationToggle.tsx`
- Create: `frontend/src/features/cards/CardChangeNotificationToggle.test.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/features/cards/PublicLinkReviewPanel.tsx`
- Modify: `frontend/src/features/cards/PublicLinkReviewPanel.test.tsx`
- Modify: `frontend/src/api/adminMutations.test.ts`

**Interfaces:**
- Consumes Task 2's API routes and caller-specific public-link fields.
- Produces a per-readable-card switch and a creator-only public-link switch.

- [ ] **Step 1: Write failing client and component tests**

  Assert the card control reads `GET /api/v1/cards/{id}/change-notification-subscription`, sends exactly `PUT` with `{"enabled": true}` or `{"enabled": false}`, shows `Уведомлять об изменениях` when disabled and `Уведомления включены` when enabled, and renders a safe inline failure message without changing its confirmed state.

  In public-link tests, assert the switch appears only when `can_manage_change_notifications` is true, uses the public-link endpoint, and refreshes the existing `public-links` query after success.

- [ ] **Step 2: Run focused frontend tests to verify failure**

  Run: `pnpm -C frontend exec vitest run src/api/adminMutations.test.ts src/features/cards/CardChangeNotificationToggle.test.tsx src/features/cards/PublicLinkReviewPanel.test.tsx`

  Expected: FAIL because the types, client calls, and controls do not exist.

- [ ] **Step 3: Add types, clients, and reusable controls**

  Add these frontend types and functions:

  ```ts
  export type CardChangeNotificationSubscriptionRead = { enabled: boolean };
  export type CardChangeNotificationChangeRead = {
    label: string;
    before: unknown | null;
    after: unknown | null;
    description: string | null;
  };

  export async function getCardChangeNotificationSubscription(token: string, cardId: string) {
    return apiRequest<CardChangeNotificationSubscriptionRead>(
      `/api/v1/cards/${cardId}/change-notification-subscription`, { token },
    );
  }
  export async function updateCardChangeNotificationSubscription(
    token: string, cardId: string, enabled: boolean,
  ) {
    return apiRequest<CardChangeNotificationSubscriptionRead>(
      `/api/v1/cards/${cardId}/change-notification-subscription`,
      { method: "PUT", token, body: { enabled } },
    );
  }
  export async function updatePublicLinkChangeNotificationSubscription(
    token: string, publicLinkId: string, enabled: boolean,
  ) {
    return apiRequest<CardChangeNotificationSubscriptionRead>(
      `/api/v1/public-links/${publicLinkId}/change-notification-subscription`,
      { method: "PUT", token, body: { enabled } },
    );
  }
  ```

  `CardChangeNotificationToggle` owns the TanStack query and mutation, gets `{ token, cardId }`, invalidates `['card-change-notification-subscription', token, cardId]`, and uses a compact button with an `aria-pressed` state. Render it in the selected-card action area in `CardsWorkspace` whenever a readable `card` exists, not only when `card.can_manage` is true.

  Extend `PublicLinkRead` with `can_manage_change_notifications: boolean` and `change_notifications_enabled: boolean`. Inside each public-link list item, render the compact toggle only if `can_manage_change_notifications` is true. Do not render the control for a card manager who did not create the link.

- [ ] **Step 4: Run focused frontend tests to verify pass**

  Run: `pnpm -C frontend exec vitest run src/api/adminMutations.test.ts src/features/cards/CardChangeNotificationToggle.test.tsx src/features/cards/PublicLinkReviewPanel.test.tsx`

  Expected: PASS, including request payloads, ownership visibility, optimistic-state safety, and cache invalidation.

- [ ] **Step 5: Commit subscription controls**

  ```powershell
  git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/adminMutations.test.ts frontend/src/features/cards/CardChangeNotificationToggle.tsx frontend/src/features/cards/CardChangeNotificationToggle.test.tsx frontend/src/features/cards/CardsWorkspace.tsx frontend/src/features/cards/PublicLinkReviewPanel.tsx frontend/src/features/cards/PublicLinkReviewPanel.test.tsx
  git commit -m "feat: add notification subscription controls"
  ```

### Task 6: Build the top-bar bell and compact notification panel

**Files:**
- Create: `frontend/src/features/notifications/CardChangeNotificationBell.tsx`
- Create: `frontend/src/features/notifications/CardChangeNotificationBell.test.tsx`
- Modify: `frontend/src/pages/HomePage.tsx`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/styles/globals.css`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes `GET /api/v1/card-change-notifications?limit=20`, `POST /{id}/read`, and `POST /read-all` from Task 2.
- Receives `token` and `onOpenCard(cardId: string)` from `HomePage`.
- Produces a Russian-first accessible top-bar button and a floating per-user inbox panel.

- [ ] **Step 1: Write failing bell interaction tests**

  Render two inbox items, one unread and one read. Assert the bell announces `Уведомления: 1 непрочитанное`, click opens a `role="dialog"` panel with card, actor, changed field, `Было` and `Стало`, and `Отметить все прочитанными` posts to the bulk endpoint.

  Click an item and assert the single-read endpoint is called before `onOpenCard(item.card_id)`. Assert an empty list renders `Новых уведомлений нет`; an inaccessible/failed request renders the existing Russian error mapping without breaking logout or the top bar.

- [ ] **Step 2: Run focused bell tests to verify failure**

  Run: `pnpm -C frontend exec vitest run src/features/notifications/CardChangeNotificationBell.test.tsx src/App.test.tsx`

  Expected: FAIL because the inbox query, bell, and panel do not exist.

- [ ] **Step 3: Implement the bell and card navigation**

  Add `listCardChangeNotifications`, `markCardChangeNotificationRead`, and `markAllCardChangeNotificationsRead` clients. In `CardChangeNotificationBell`, query with key `['card-change-notifications', token]`, `refetchInterval: 60_000`, and `staleTime: 15_000`; no websocket, browser push, or external delivery is added.

  The component must:

  ```tsx
  <button aria-expanded={open} aria-haspopup="dialog" aria-label={bellLabel}>
    <BellIcon />
    {unreadCount > 0 ? <span className="notification-bell-count">{unreadCount}</span> : null}
  </button>
  ```

  On a row click, call the read mutation, invalidate the inbox query, close the panel, then invoke `onOpenCard(notification.card_id)`. Format values using existing safe `formatValue`-style utilities; a redacted value is shown as `Недоступно`, never serialized JSON.

  In `HomePage`, implement `handleOpenNotificationCard(cardId)` by selecting the `cards` section, clearing card search and field filters, setting `includeArchivedCards: true`, selecting the ID, and fetching the broad descendant card list with `includeArchive: true`. This ensures an archive notification still opens its card when the reader retains access.

  Add scoped CSS for `.notification-bell`, `.notification-bell-count`, `.notification-popover`, `.notification-row`, `.notification-row.is-unread`, and the mobile breakpoint. The popover must match existing white panel, blue action, focus-ring, and shadow language; it must not cover the entire page or add a legend/header repeated per item.

- [ ] **Step 4: Run focused bell tests to verify pass**

  Run: `pnpm -C frontend exec vitest run src/features/notifications/CardChangeNotificationBell.test.tsx src/App.test.tsx`

  Expected: PASS with unread count, list, read actions, empty state, safe values, and card navigation verified.

- [ ] **Step 5: Commit the notification centre**

  ```powershell
  git add frontend/src/features/notifications/CardChangeNotificationBell.tsx frontend/src/features/notifications/CardChangeNotificationBell.test.tsx frontend/src/pages/HomePage.tsx frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/styles/globals.css frontend/src/App.test.tsx
  git commit -m "feat: add card change notification centre"
  ```

### Task 7: Full verification, release record, migration, deployment, and visual proof

**Files:**
- Modify: `PLANS.md`
- Modify only test files discovered by failed targeted checks in Tasks 1–6.

**Interfaces:**
- Consumes all completed backend and frontend contracts.
- Produces a checked, deployed feature with evidence recorded in `PLANS.md`.

- [ ] **Step 1: Run full local quality gates**

  Run:

  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote
  powershell -ExecutionPolicy Bypass -File scripts/test.ps1
  ```

  Expected: Python syntax, Ruff, formatting, mypy, frontend lint/typecheck/build and all configured test suites pass. Record any pre-existing warnings separately from feature failures.

- [ ] **Step 2: Run disposable PostgreSQL migration and notification tests**

  Set `TEST_DATABASE_URL` to a disposable database whose name ends in `_test`, then run:

  ```powershell
  Push-Location backend
  python -m alembic upgrade head
  python -m pytest tests/test_audit_retention.py tests/test_card_change_notification_services.py tests/test_api_card_change_notifications.py -q
  Pop-Location
  ```

  Expected: revision `0032_card_change_notifications` reaches head and all notification creation, access, and retention tests pass.

- [ ] **Step 3: Perform browser-facing regression proof**

  Use the existing browser/Playwright workflow against the deployed same-origin application. Prove: a user can enable a card subscription, another user changes a visible field, the first user sees the bell badge and safe `было → стало` row, the editor sees no own notification, a public-link creator can toggle its link setting, and a click opens the correct card. Confirm the browser console has no errors.

- [ ] **Step 4: Update the project plan and commit release notes**

  Update `PLANS.md` with the actual revision, test counts, migration backup/preflight evidence, asset names, server health result, and browser-proof outcome. Do not claim a test, migration, deployment, or browser result that was skipped.

  ```powershell
  git add PLANS.md
  git commit -m "docs: record card notification delivery"
  ```

- [ ] **Step 5: Push, migrate, deploy, and verify server state**

  After the disposable migration check passes, use the repository's required sequence:

  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "feat: add card change notifications"
  powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1
  powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1
  powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1
  ```

  Before the production migration, make a fresh backup, confirm the server checkout tracks `origin/main`, run `alembic upgrade head` intentionally against production `reg_engine`, then verify revision `0032_card_change_notifications`, service health, and same-origin frontend/API smoke checks. Record each result in `PLANS.md`.
