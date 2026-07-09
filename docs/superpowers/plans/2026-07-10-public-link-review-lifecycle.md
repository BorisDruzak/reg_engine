# Public Link Review Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add submit, administrator review, request-changes, approval, and automatic access closure to public card links while keeping public edits direct-to-card.

**Architecture:** Extend `card_public_links` with review lifecycle state, baseline and submission summaries, then enforce transitions under row locks in `PublicLinkService`. Add token-safe submit/status endpoints and permission-protected review actions, then reuse the shared card-layout renderer for public editing and administrator diff review.

**Tech Stack:** PostgreSQL, Alembic, SQLAlchemy, FastAPI, Pydantic, React 19, TypeScript, TanStack Query, Vitest, Testing Library, existing attachment storage/scanner abstraction.

## Global Constraints

- Public field saves and attachment uploads immediately update the real card; approval does not apply a staged copy.
- New statuses are `active`, `submitted`, `changes_requested`, `approved`, `disabled`, and `expired`.
- Only `active` and `changes_requested` permit public editing.
- Approval closes public view/edit access and never exposes card data through the closed-token status response.
- Raw public tokens remain hashed at rest and are sent in request bodies, never query parameters or logs.
- Existing pre-review links remain compatible and require explicit baseline capture before review actions appear.
- `file_ref` remains unavailable to public editing; approved public attachment workflows remain bounded by existing quotas and scanner rules.
- Backend permissions and lifecycle transitions are authoritative and every mutation writes an audit event.
- User-facing text and mapped errors are Russian-first and reveal no storage, SQL, scanner, traceback, or internal file details.
- Work on `main`; production migration is permitted only after disposable `_test` verification, fresh backup, preflight, synchronized server checkout, and post-migration checks.

---

## File Structure

- `backend/migrations/versions/0023_public_link_review_lifecycle.py`: additive review lifecycle migration.
- `backend/app/models/public_link.py`: review columns, indexes, and status constraint.
- `backend/app/domain/constants.py`: expanded public-link statuses.
- `backend/app/schemas/public_links.py`: create, status, submit, review diff, request-changes, approval schemas.
- `backend/app/services/public_links.py`: baseline capture, direct-edit lifecycle, transition locking, typed review diff.
- `backend/app/api/v1/endpoints/public_links.py`: public token and administrator review routes.
- `backend/tests/test_public_link_review_lifecycle.py`: focused service/API lifecycle tests.
- `backend/tests/test_migrations.py`: migration SQL regression.
- `frontend/src/api/types.ts`: lifecycle and review types.
- `frontend/src/api/client.ts`: submit/status/review/request-changes/approve clients.
- `frontend/src/features/cards/PublicLinkReviewPanel.tsx`: administrator creation/history/review surface.
- `frontend/src/features/cards/PublicLinkReviewPanel.test.tsx`: administrator UI tests.
- `frontend/src/pages/PublicLinkEditPage.tsx`: exact layout, autosave, submit, receipt, reopened state.
- `frontend/src/pages/PublicLinkEditPage.test.tsx`: public workflow tests.
- `frontend/src/features/cards/CardsWorkspace.tsx`: review badges and `Отправить на заполнение` entry action.

### Task 1: Add the additive public-link review migration

**Files:**
- Create: `backend/migrations/versions/0023_public_link_review_lifecycle.py`
- Modify: `backend/app/domain/constants.py`
- Modify: `backend/app/models/public_link.py`
- Modify: `backend/tests/test_migrations.py`
- Modify: `backend/tests/test_models_smoke.py`

**Interfaces:**
- Produces: expanded `PUBLIC_LINK_STATUSES`.
- Produces: `submitted_at`, `reviewed_at`, `reviewed_by`, `review_comment`, `baseline_snapshot_json`, `submission_summary_json`, and `review_enabled` on `CardPublicLink`.

- [ ] **Step 1: Write failing migration/model tests**

```python
def test_public_link_review_migration_adds_lifecycle_columns() -> None:
    sql = render_upgrade_sql("0023_public_link_review_lifecycle")
    assert "submitted_at" in sql
    assert "reviewed_at" in sql
    assert "reviewed_by" in sql
    assert "review_comment" in sql
    assert "baseline_snapshot_json" in sql
    assert "submission_summary_json" in sql
    assert "review_enabled" in sql
    assert "changes_requested" in sql
    assert "approved" in sql
```

- [ ] **Step 2: Run migration/model tests and verify RED**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_migrations.py backend/tests/test_models_smoke.py -q`

Expected: FAIL because revision `0023` and model columns do not exist.

- [ ] **Step 3: Implement the migration**

```python
revision = "0023_public_link_review_lifecycle"
down_revision = "0022_card_print_layout_templates"


def upgrade() -> None:
    op.drop_constraint(op.f("ck_card_public_links_status"), "card_public_links", type_="check")
    op.add_column("card_public_links", sa.Column("submitted_at", sa.DateTime(timezone=True)))
    op.add_column("card_public_links", sa.Column("reviewed_at", sa.DateTime(timezone=True)))
    op.add_column("card_public_links", sa.Column("reviewed_by", postgresql.UUID(as_uuid=True)))
    op.add_column("card_public_links", sa.Column("review_comment", sa.Text()))
    op.add_column("card_public_links", sa.Column("baseline_snapshot_json", postgresql.JSONB()))
    op.add_column("card_public_links", sa.Column("submission_summary_json", postgresql.JSONB()))
    op.add_column(
        "card_public_links",
        sa.Column("review_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_foreign_key(
        op.f("fk_card_public_links_reviewed_by_users"),
        "card_public_links",
        "users",
        ["reviewed_by"],
        ["id"],
    )
    op.create_check_constraint(
        op.f("ck_card_public_links_status"),
        "card_public_links",
        "status in ('active','submitted','changes_requested','approved','disabled','expired')",
    )
    op.create_index(
        "ix_card_public_links_card_status_submitted",
        "card_public_links",
        ["card_id", "status", "submitted_at"],
    )
```

Implement a complete downgrade that removes the index/columns/foreign key and
restores the old status constraint only after mapping new statuses to
`disabled`; keep the downgrade SQL testable but never run it against production
as part of this feature.

- [ ] **Step 4: Mirror the migration in the SQLAlchemy model**

Use nullable timezone-aware datetimes, `Text`, JSONB, the user foreign key, and
`review_enabled` with `server_default="false"`.

- [ ] **Step 5: Run migration/model tests and offline SQL rendering**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_migrations.py backend/tests/test_models_smoke.py -q`

Run: `Push-Location backend; ..\backend\.venv\Scripts\python.exe -m alembic upgrade head --sql; Pop-Location`

Expected: tests pass and offline SQL contains revision `0023` without connecting
to production.

- [ ] **Step 6: Commit migration and model changes**

```powershell
git add backend/migrations/versions/0023_public_link_review_lifecycle.py backend/app/domain/constants.py backend/app/models/public_link.py backend/tests/test_migrations.py backend/tests/test_models_smoke.py
git commit -m "Add public link review lifecycle schema"
```

### Task 2: Implement baseline snapshots, transitions, and review diffs

**Files:**
- Modify: `backend/app/services/public_links.py`
- Create: `backend/tests/test_public_link_review_lifecycle.py`

**Interfaces:**
- Produces: `capture_review_baseline`, `submit_for_review`, `request_changes_for_actor`, `approve_for_actor`, `review_diff_for_actor`, and `safe_status`.
- Consumes: existing typed field values, public attachment service, permissions, and audit service.

- [ ] **Step 1: Write failing service state-machine tests**

```python
@dataclass(frozen=True)
class ReviewFixture:
    admin_id: UUID
    card_id: UUID
    field_id: UUID
    read_value: Callable[[], object]


def test_public_link_direct_edit_submit_approve_closes_access(db_session, review_fixture) -> None:
    service = PublicLinkService(db_session)
    token = service.create_public_link_for_actor(
        actor_user_id=review_fixture.admin_id,
        card_id=review_fixture.card_id,
        review_enabled=True,
    )
    service.edit_card_field_with_token(
        raw_token=token.raw_token,
        field_id=review_fixture.field_id,
        value="Новое значение",
    )
    assert review_fixture.read_value() == "Новое значение"

    submitted = service.submit_for_review(raw_token=token.raw_token)
    assert submitted.status == "submitted"
    with pytest.raises(PermissionDeniedError):
        service.edit_card_field_with_token(
            raw_token=token.raw_token,
            field_id=review_fixture.field_id,
            value="После отправки",
        )

    approved = service.approve_for_actor(
        actor_user_id=review_fixture.admin_id,
        public_link_id=token.public_link.id,
    )
    assert approved.status == "approved"
    assert approved.can_edit is False
    assert approved.can_view is False
    assert approved.disabled_at is not None
    assert review_fixture.read_value() == "Новое значение"
```

- [ ] **Step 2: Add failing request-changes, invalid-transition, safe-status, and diff tests**

Cover same-token reopening, required administrator comment, resubmission,
expired-link precedence, forbidden reviewer, old/current typed display values,
safe attachment metadata, and absence of raw token/storage data.

- [ ] **Step 3: Run the focused lifecycle test and verify RED**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_public_link_review_lifecycle.py -q`

Expected: FAIL because review lifecycle methods do not exist.

- [ ] **Step 4: Define allowed transitions and row locking**

```python
ALLOWED_PUBLIC_LINK_TRANSITIONS: dict[str, set[str]] = {
    "active": {"submitted", "disabled", "expired"},
    "changes_requested": {"submitted", "disabled", "expired"},
    "submitted": {"changes_requested", "approved", "disabled", "expired"},
    "approved": set(),
    "disabled": set(),
    "expired": set(),
}


def _locked_public_link(self, public_link_id: UUID) -> CardPublicLink:
    public_link = self.session.scalars(
        select(CardPublicLink)
        .where(CardPublicLink.id == public_link_id)
        .with_for_update()
    ).one_or_none()
    if public_link is None:
        raise PublicLinkError("Public link was not found.")
    return public_link
```

- [ ] **Step 5: Capture baseline and submission summaries safely**

Store allowed `(block_instance_id, field_id)` typed values and safe attachment
ids/titles/content lengths. Exclude raw tokens, content, storage keys, paths,
checksums, stored-file ids, and scanner secrets. Store only
`completed_public_fields` and `total_public_fields` in the submission summary.

- [ ] **Step 6: Enforce direct-edit status guards**

Update `_get_active_public_link` into separate token lookup, expiry check,
editable-state check, attachment-state check, and safe-status lookup. Permit
field edits/uploads only in `active` and `changes_requested`; permit safe status
for every recognized status.

- [ ] **Step 7: Implement submit, request changes, approve, and diff**

Every transition validates current status after locking, updates booleans and
timestamps consistently, flushes once, and records an audit event. Approval
must not call card field mutation services.

- [ ] **Step 8: Run the lifecycle and existing public-link/attachment tests**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_public_link_review_lifecycle.py backend/tests/test_api_phase_1f.py backend/tests/test_api_phase_1g.py backend/tests/test_attachment_services.py backend/tests/test_api_phase_2b_attachments.py -q`

Expected: PASS, including existing quota and attachment behavior.

- [ ] **Step 9: Commit lifecycle services**

```powershell
git add backend/app/services/public_links.py backend/tests/test_public_link_review_lifecycle.py backend/tests/test_api_phase_1f.py backend/tests/test_api_phase_1g.py backend/tests/test_attachment_services.py backend/tests/test_api_phase_2b_attachments.py
git commit -m "Implement public link review lifecycle"
```

### Task 3: Expose lifecycle API schemas and routes

**Files:**
- Modify: `backend/app/schemas/public_links.py`
- Modify: `backend/app/api/v1/endpoints/public_links.py`
- Modify: `backend/tests/test_public_link_review_lifecycle.py`

**Interfaces:**
- Produces: `PublicLinkSubmitRequest`, `PublicLinkSafeStatusRead`, `PublicLinkReviewRead`, `PublicLinkRequestChanges`, and updated create/read schemas.
- Produces: submit, status, review, request-changes, approve, and start-review-cycle routes.

- [ ] **Step 1: Add failing API tests for every new route**

```python
submitted = api_client.post(
    "/api/v1/public-links/submit",
    json={"raw_token": raw_token},
)
assert submitted.status_code == 200
assert submitted.json()["status"] == "submitted"

review = api_client.get(
    f"/api/v1/public-links/{public_link_id}/review",
    headers=actor_headers(admin_id),
)
assert review.status_code == 200
assert review.json()["changed_field_count"] == 1

approved = api_client.post(
    f"/api/v1/public-links/{public_link_id}/approve",
    headers=actor_headers(admin_id),
)
assert approved.json()["status"] == "approved"
```

- [ ] **Step 2: Run the API test and verify RED**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_public_link_review_lifecycle.py -q`

Expected: FAIL with `404` for new routes.

- [ ] **Step 3: Add exact Pydantic request/response contracts**

```python
class PublicLinkSubmitRequest(BaseModel):
    raw_token: str = Field(min_length=1)


class PublicLinkRequestChanges(BaseModel):
    comment: str = Field(min_length=1, max_length=2000)


class PublicLinkSafeStatusRead(BaseModel):
    status: str
    can_edit: bool
    submitted_at: datetime | None
    reviewed_at: datetime | None
    review_comment: str | None
    completed_public_fields: int | None
    total_public_fields: int | None


class PublicLinkReviewFieldDiffRead(BaseModel):
    block_id: UUID
    field_id: UUID
    block_instance_id: UUID | None
    label: str
    field_type: str
    before: Any
    after: Any
    changed_at: datetime | None


class PublicLinkReviewAttachmentDiffRead(BaseModel):
    attachment_id: UUID
    title: str
    original_filename: str
    content_length_bytes: int
    change: Literal["added", "archived"]


class PublicLinkReviewRead(BaseModel):
    public_link: PublicLinkRead
    changed_field_count: int
    changed_attachment_count: int
    fields: list[PublicLinkReviewFieldDiffRead]
    attachments: list[PublicLinkReviewAttachmentDiffRead]
```

The approved/disabled/expired status response must set summary and comment
fields to `None` unless the value is explicitly approved for the receipt UI.

- [ ] **Step 4: Register routes and map transition conflicts to 409**

Keep raw tokens in JSON bodies. Use existing dependency injection for admin
actors and sessions. Reuse `raise_service_http_error` only after adding stable
mapping for lifecycle conflicts and Russian-safe frontend codes.

- [ ] **Step 5: Run API and schema tests**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_public_link_review_lifecycle.py backend/tests/test_api_phase_1f.py backend/tests/test_api_phase_1g.py -q`

Expected: PASS with forbidden reviewer, closed-token privacy, invalid transition,
and token non-leak assertions.

- [ ] **Step 6: Commit the lifecycle API**

```powershell
git add backend/app/schemas/public_links.py backend/app/api/v1/endpoints/public_links.py backend/tests/test_public_link_review_lifecycle.py
git commit -m "Expose public link review API"
```

### Task 4: Add frontend API contracts and clients

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/app/uiText.ts`
- Test: `frontend/src/api/adminMutations.test.ts`
- Test: `frontend/src/app/uiText.test.ts`

**Interfaces:**
- Produces: `submitPublicLink`, `getPublicLinkStatus`, `getPublicLinkReview`, `requestPublicLinkChanges`, `approvePublicLink`, `startPublicLinkReviewCycle`.
- Consumes: the backend schemas from Task 3.

- [ ] **Step 1: Add failing client and Russian error-map tests**

Assert request methods, paths, token placement in JSON, returned lifecycle types,
and mapping for invalid transition, expired, submitted-readonly, and forbidden
review errors.

- [ ] **Step 2: Run focused frontend API tests and verify RED**

Run: `pnpm -C frontend exec vitest run src/api/adminMutations.test.ts src/app/uiText.test.ts --reporter=dot`

Expected: FAIL because lifecycle client functions and copy are absent.

- [ ] **Step 3: Add discriminated status types**

```ts
export type PublicLinkReviewStatus =
  | "active"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "disabled"
  | "expired";

export type PublicLinkSafeStatusRead = {
  status: PublicLinkReviewStatus;
  can_edit: boolean;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  completed_public_fields: number | null;
  total_public_fields: number | null;
};
```

- [ ] **Step 4: Implement client calls with body tokens**

```ts
export async function submitPublicLink(rawToken: string) {
  return apiRequest<PublicLinkSafeStatusRead>("/api/v1/public-links/submit", {
    method: "POST",
    body: { raw_token: rawToken },
  });
}
```

Use the same body-token pattern for safe status and keep admin auth tokens in
the existing `Authorization` header.

- [ ] **Step 5: Run focused tests, typecheck, and lint**

Run: `pnpm -C frontend exec vitest run src/api/adminMutations.test.ts src/app/uiText.test.ts --reporter=dot`

Run: `pnpm -C frontend typecheck`

Run: `pnpm -C frontend lint`

Expected: all commands exit `0`.

- [ ] **Step 6: Commit frontend lifecycle contracts**

```powershell
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/app/uiText.ts frontend/src/api/adminMutations.test.ts frontend/src/app/uiText.test.ts
git commit -m "Add public review frontend contracts"
```

### Task 5: Build the administrator link and review surface

**Files:**
- Create: `frontend/src/features/cards/PublicLinkReviewPanel.tsx`
- Create: `frontend/src/features/cards/PublicLinkReviewPanel.test.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: public-link list/create/disable plus review API clients.
- Produces: card-header `Отправить на заполнение`, link timeline, review diff, request-changes, approve-and-close.

- [ ] **Step 1: Write failing administrator workflow tests**

Cover opening the card-side create form, expiry/block/attachment choices,
copyable returned URL, submitted badge, lazy diff loading, required correction
comment, approval confirmation, closed timeline, and legacy start-review-cycle.

- [ ] **Step 2: Run the focused component test and verify RED**

Run: `pnpm -C frontend exec vitest run src/features/cards/PublicLinkReviewPanel.test.tsx --reporter=dot --testTimeout=10000`

Expected: FAIL because the panel does not exist.

- [ ] **Step 3: Implement the compact creation form**

Default allowed blocks/fields to public-editable schema content. Show the
direct-edit warning. Display the raw URL only from the create response and never
store it in query cache after the creation result is dismissed.

- [ ] **Step 4: Implement lazy review diff and lifecycle actions**

Load `GET /review` only when a submitted link is opened. Render old/current
typed values inside the configured block layout. Require confirmation for
approval and a non-empty comment for request changes.

- [ ] **Step 5: Integrate card-header entry and status badges**

Replace the current standalone `Создать публичную ссылку` emphasis with
`Отправить на заполнение` in the card header while keeping the
`Публичные ссылки` tab as history/status. Do not load link review data for other
card tabs.

- [ ] **Step 6: Run administrator UI tests and app regression**

Run: `pnpm -C frontend exec vitest run src/features/cards/PublicLinkReviewPanel.test.tsx src/App.test.tsx --reporter=dot --testTimeout=15000`

Expected: PASS, including existing create/disable compatibility.

- [ ] **Step 7: Commit administrator review UI**

```powershell
git add frontend/src/features/cards/PublicLinkReviewPanel.tsx frontend/src/features/cards/PublicLinkReviewPanel.test.tsx frontend/src/features/cards/CardsWorkspace.tsx frontend/src/styles/globals.css
git commit -m "Add public link administrator review UI"
```

### Task 6: Rebuild the public page around the shared layout and submit state

**Files:**
- Modify: `frontend/src/pages/PublicLinkEditPage.tsx`
- Create: `frontend/src/pages/PublicLinkEditPage.test.tsx`
- Modify: `frontend/src/features/cardLayout/CardLayoutRenderer.tsx`
- Modify: `frontend/src/styles/globals.css`

**Interfaces:**
- Consumes: public preview/edit/attachment APIs, shared layout renderer, submit and safe-status clients.
- Produces: exact-layout public edit, confirmed autosave state, submit receipt, changes-requested reopening, approved closed receipt.

- [ ] **Step 1: Write failing public lifecycle page tests**

```tsx
expect(await screen.findByText("Публичное заполнение карточки")).toBeInTheDocument();
expect(screen.getByTestId("public-block-fio")).toHaveStyle({ gridColumn: "1 / span 6" });

await user.type(screen.getByLabelText("Имя"), "Иван");
expect(screen.queryByText("Все изменения сохранены")).not.toBeInTheDocument();
await waitFor(() => expect(screen.getByText("Все изменения сохранены")).toBeInTheDocument());

await user.click(screen.getByRole("button", { name: "Отправить на проверку" }));
expect(await screen.findByText("Карточка отправлена на проверку")).toBeInTheDocument();
expect(screen.queryByLabelText("Имя")).not.toBeInTheDocument();
```

Add status fixtures for changes requested with comment, approved, disabled, and
expired.

- [ ] **Step 2: Run the public page test and verify RED**

Run: `pnpm -C frontend exec vitest run src/pages/PublicLinkEditPage.test.tsx --reporter=dot --testTimeout=10000`

Expected: FAIL against the current block list form.

- [ ] **Step 3: Render the exact shared card layout**

Pass `mode="public-edit"`, allowed fields, current values, reference options,
and public block instances into `CardLayoutRenderer`. Keep `file_ref` blocked and
preserve approved public attachment upload/list/download controls.

- [ ] **Step 4: Implement server-confirmed autosave status**

Use a per-field mutation queue. Show `Сохранение…` while a request is pending
and `Все изменения сохранены` only when the latest local value equals the latest
successful server value. Keep failed values visible with a Russian inline error.

- [ ] **Step 5: Implement submit and safe receipt states**

After submit, discard preview data from the query cache and render only
`PublicLinkSafeStatusRead`. For approved/disabled/expired status, never render
cached card values or attachment metadata.

- [ ] **Step 6: Run public tests, typecheck, lint, and build**

Run: `pnpm -C frontend exec vitest run src/pages/PublicLinkEditPage.test.tsx src/features/cards/PublicLinkReviewPanel.test.tsx --reporter=dot --testTimeout=10000`

Run: `pnpm -C frontend typecheck`

Run: `pnpm -C frontend lint`

Run: `pnpm -C frontend build`

Expected: all commands exit `0`.

- [ ] **Step 7: Commit the public lifecycle page**

```powershell
git add frontend/src/pages/PublicLinkEditPage.tsx frontend/src/pages/PublicLinkEditPage.test.tsx frontend/src/features/cardLayout/CardLayoutRenderer.tsx frontend/src/styles/globals.css
git commit -m "Add public link submit and receipt flow"
```

### Task 7: Disposable database verification, documentation, release, and live proof

**Files:**
- Modify: `PLANS.md`
- Modify: `README.md`
- Modify: `docs/PROJECT_MAP.md`
- Modify: `docs/PROJECT_TREE.md` through `scripts/project-map.ps1`

**Interfaces:**
- Produces: applied migration `0023`, synchronized release, recorded Phase 8L evidence.
- Consumes: Tasks 1-6 and the completed layout/card checkpoints.

- [ ] **Step 1: Run the full local non-database gate**

Run: `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`

Expected: all backend, frontend, build, and project-map checks pass.

- [ ] **Step 2: Verify migration and lifecycle on a disposable `_test` database**

Load ignored local configuration, set `TEST_DATABASE_URL` to the configured
database whose name ends with `_test`, then run:

```powershell
Push-Location backend
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m pytest tests/test_database_smoke.py tests/test_public_link_review_lifecycle.py -q
Pop-Location
```

Expected: migration reaches `0023_public_link_review_lifecycle`; database smoke
and lifecycle tests pass. Never point `TEST_DATABASE_URL` at production.

- [ ] **Step 3: Update docs and project maps**

Document lifecycle statuses, direct-edit semantics, safe closed receipt,
review endpoints, migration, compatibility, commands, and known limitations.

Run: `powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1`

Run: `powershell -ExecutionPolicy Bypass -File scripts/project-map.ps1 -Check`

Expected: check exits `0`.

- [ ] **Step 4: Commit documentation**

```powershell
git add PLANS.md README.md docs/PROJECT_MAP.md docs/PROJECT_TREE.md
git commit -m "Document public link review lifecycle"
```

- [ ] **Step 5: Push the verified candidate and synchronize the server checkout**

Run: `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "Release public link review lifecycle"`

Run: `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`

Expected: local, `origin/main`, and configured server checkout use the same
commit; server checks pass before production migration.

- [ ] **Step 6: Create a fresh production backup and run duplicate/data preflight**

Use the configured server/runtime environment and record the backup artifact
outside Git. Verify current production revision is `0022_card_print_layout_templates`,
review-link column names are absent before migration, and no invalid public-link
status values exist. Stop if any precondition fails.

- [ ] **Step 7: Apply the planned production migration and verify schema**

Run the configured remote Alembic upgrade against production `reg_engine`, not
`TEST_DATABASE_URL`. Then verify revision `0023_public_link_review_lifecycle`,
new columns, status constraint, index, API health, and service status. Record
commands and results in `PLANS.md`.

- [ ] **Step 8: Deploy the frontend and run live Browser validation**

Run: `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`

The flow under test is: `Карточка -> Отправить на заполнение -> открыть публичную ссылку -> изменить поля/добавить разрешённое вложение -> Отправить на проверку -> администратор открывает сравнение -> Вернуть на доработку -> повторно отправить -> Подтвердить и закрыть доступ -> открыть старую ссылку`.

Verify direct card updates before approval, audit actor/source, read-only
submitted state, same-token correction, typed diff, approval without value
rewrite, closed-token privacy, desktop/mobile layout, and no relevant console
errors.

- [ ] **Step 9: Record final evidence and commit/push it**

Add the deployed commit, backup/preflight/migration results, exact Browser flow,
screenshots stored outside Git, API/audit evidence, console result, and remaining
limitations to `PLANS.md`; commit and push the evidence update.
