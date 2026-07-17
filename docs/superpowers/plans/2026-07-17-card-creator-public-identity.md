# Card Creator and Public Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each card's creator in authenticated card views and record the entered FIO as the immutable per-event executor of every public card mutation.

**Architecture:** Preserve the existing internal `Card.created_by -> User.display_name` relationship and add `Card.public_creator_name` for cards first created through a public creation link. Add `AuditEvent.actor_display_name` as a separate event-time snapshot for public executors; do not create users or overwrite card creators. Server APIs validate and receive `actor_name` for every public mutation, while public-page state provides the early interaction guard and Russian hint.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic, React, TypeScript, TanStack Query, Vitest, pytest.

## Global Constraints

- All business authorization and the nonempty FIO rule are enforced by the backend; frontend guards are UX only.
- Card schemas remain dynamic; creator identity is system metadata, not a business field.
- `actor_name` is a claimed public text value, trimmed and limited to 200 characters; it must never create or impersonate a system user.
- `cards.public_creator_name` is assigned only on first successful public card creation and is never overwritten by later public edits.
- `audit_events.actor_display_name` is an event snapshot and must not be put inside the safe diff JSON.
- Public actor names are page-memory-only and must not be stored in browser persistence.
- Preserve `created_by`, `attributed_user_id`, raw-token secrecy, retention, notification ownership, and all existing RBAC semantics.
- User-visible text is Russian-first; the blocked-edit hint is exactly `Сначала укажите ФИО`.
- Do not modify unrelated untracked `.playwright-cli/` or existing text-validation work.

---

### Task 1: Persist creator and public event identity

**Files:**
- Create: `backend/migrations/versions/<next>_card_creator_public_actor_name.py`
- Modify: `backend/app/models/card.py`
- Modify: `backend/app/models/audit.py`
- Modify: `backend/app/services/audit.py`
- Modify: `backend/app/schemas/cards.py`
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/api/v1/endpoints/cards.py`
- Test: `backend/tests/test_api_phase_1g.py`
- Test: `backend/tests/test_audit_schema.py`

**Interfaces:**
- Consumes: `Card.created_by`, `User.display_name`, and the existing public-link audit identity fields.
- Produces: `Card.creator_display_name: str | None`, `Card.public_creator_name: str | None`, `AuditEvent.actor_display_name: str | None`, and `creator_display_name` on `CardSummaryRead` / `CardRead`.

- [ ] **Step 1: Write failing API and schema tests**

```python
def test_card_reads_creator_display_name_for_internal_and_public_creation(...):
    internal = client.get(f"/api/v1/cards/{internal_card_id}", headers=admin_headers)
    public = client.get(f"/api/v1/cards/{public_card_id}", headers=admin_headers)

    assert internal.json()["creator_display_name"] == "Системный администратор"
    assert public.json()["creator_display_name"] == "Иванов Иван Иванович"


def test_audit_schema_serializes_public_actor_display_name():
    event = AuditEventRead.model_validate({..., "actor_display_name": "Иванов Иван Иванович"})
    assert event.actor_display_name == "Иванов Иван Иванович"
```

- [ ] **Step 2: Run the focused tests and confirm the missing contracts fail**

Run: `pytest backend/tests/test_api_phase_1g.py backend/tests/test_audit_schema.py -q`
Expected: failure because creator/public actor fields are absent.

- [ ] **Step 3: Add nullable persistence and one read-side resolver**

```python
class Card(...):
    public_creator_name: Mapped[str | None] = mapped_column(String(200), nullable=True)


class AuditEvent(...):
    actor_display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)


def creator_display_name_for_card(self, card: Card) -> str | None:
    if card.public_creator_name:
        return card.public_creator_name
    return self._user_display_name_for_id(card.created_by)
```

Add the Alembic upgrade/downgrade for both nullable columns. Extend only authenticated card read/list mappers with `creator_display_name`; do not expose it from anonymous public previews.

- [ ] **Step 4: Extend audit writer plumbing without changing current callers**

```python
def record_public_link_event(..., actor_display_name: str | None = None, ...) -> AuditEvent:
    return self._record(..., actor_display_name=actor_display_name, ...)
```

Keep user and reference-edit events compatible with their present call sites. Extend the audit list projection so an event snapshot wins over the generic public-link label and internal user naming remains unchanged.

- [ ] **Step 5: Run focused tests and migration checks**

Run: `pytest backend/tests/test_api_phase_1g.py backend/tests/test_audit_schema.py -q`
Expected: PASS.

Run: `powershell -ExecutionPolicy Bypass -File scripts/test.ps1`
Expected: PASS with the repository test wrapper.

- [ ] **Step 6: Commit the data-contract task**

```powershell
git add backend/migrations/versions backend/app/models backend/app/services/audit.py backend/app/services/cards.py backend/app/schemas/cards.py backend/app/api/v1/endpoints/cards.py backend/tests/test_api_phase_1g.py backend/tests/test_audit_schema.py
git commit -m "feat: add card creator and public audit identity"
```

### Task 2: Require and attribute public actor names on server mutations

**Files:**
- Modify: `backend/app/schemas/public_links.py`
- Modify: `backend/app/schemas/card_creation_links.py`
- Modify: `backend/app/api/v1/endpoints/public_links.py`
- Modify: `backend/app/api/v1/endpoints/card_creation_links.py`
- Modify: `backend/app/services/public_links.py`
- Modify: `backend/app/services/card_creation_links.py`
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/services/attachments.py`
- Modify: `backend/app/services/card_change_notifications.py`
- Test: `backend/tests/test_public_link_review_lifecycle.py`
- Test: `backend/tests/test_card_creation_links.py`
- Test: `backend/tests/test_api_phase_2b_attachments.py`
- Test: `backend/tests/test_api_card_change_notifications.py`

**Interfaces:**
- Consumes: Task 1's `public_creator_name` and `actor_display_name` columns plus `AuditService.record_public_link_event(..., actor_display_name=...)`.
- Produces: JSON/multipart public mutations requiring `actor_name`, public-created cards storing the initial name, and audits/notifications carrying the per-request name.

- [ ] **Step 1: Write failing request-validation and attribution tests**

```python
def test_public_field_edit_requires_actor_name(client, active_public_link):
    response = client.post("/api/v1/public-links/edit", json={
        "raw_token": active_public_link.raw_token,
        "field_id": str(field_id), "value": "значение",
    })
    assert response.status_code == 422


def test_public_edit_snapshots_actor_without_changing_card_creator(...):
    first = edit_public(..., actor_name="Петров Пётр Петрович")
    second = edit_public(..., actor_name="Сидоров Сидор Сидорович")
    assert card.public_creator_name == "Иванов Иван Иванович"
    assert history[0].actor_display_name == "Сидоров Сидор Сидорович"
    assert history[1].actor_display_name == "Петров Пётр Петрович"
```

Cover `edit`, `submit`, creation-link `create-draft`, legacy `first-save`, and multipart attachment upload. Verify blank/whitespace/over-200 names fail before mutation and that authenticated/admin requests do not accept this field.

- [ ] **Step 2: Run the focused tests and confirm expected failure**

Run: `pytest backend/tests/test_public_link_review_lifecycle.py backend/tests/test_card_creation_links.py backend/tests/test_api_phase_2b_attachments.py backend/tests/test_api_card_change_notifications.py -q`
Expected: failures because `actor_name` is not required or no snapshot is recorded.

- [ ] **Step 3: Introduce a single server normalizer and thread its output**

```python
def normalize_public_actor_name(actor_name: str) -> str:
    normalized = " ".join(actor_name.split())
    if not normalized or len(normalized) > 200:
        raise PublicLinkError("Сначала укажите ФИО")
    return normalized
```

Add `actor_name: str` to `PublicLinkEditRequest`, `PublicLinkSubmitRequest`, `CardCreationLinkDraftCreateRequest`, and `CardCreationLinkFirstSaveRequest`; use an equivalent required multipart form argument for upload. Pass the normalized value through services to every public audit write.

- [ ] **Step 4: Preserve creator semantics in public card creation**

```python
created = CardService.create_card(..., created_by=None, public_creator_name=actor_name)
AuditService(...).record_public_link_event(
    ..., card_id=created.id, actor_display_name=actor_name,
)
```

The initial creation writes the card's public creator exactly once. Existing-card edits and later child-link edits only write the event snapshot. Keep `attributed_user_id` as the administrative link creator for existing history and notification authorization.

- [ ] **Step 5: Pass the snapshot to attachment and notification audit paths**

Update the public-upload service signature so the attachment audit has the same `actor_display_name`. Ensure card-change notifications use the snapshot when present, otherwise retain their current generic public actor fallback. Do not alter attachment `created_by` ownership.

- [ ] **Step 6: Run targeted regression suites**

Run: `pytest backend/tests/test_public_link_review_lifecycle.py backend/tests/test_card_creation_links.py backend/tests/test_api_phase_2b_attachments.py backend/tests/test_api_card_change_notifications.py -q`
Expected: PASS.

- [ ] **Step 7: Commit the public-mutation task**

```powershell
git add backend/app/schemas backend/app/api/v1/endpoints backend/app/services backend/tests/test_public_link_review_lifecycle.py backend/tests/test_card_creation_links.py backend/tests/test_api_phase_2b_attachments.py backend/tests/test_api_card_change_notifications.py
git commit -m "feat: require public actor name for card changes"
```

### Task 3: Add public-page FIO guard and client payload contracts

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/pages/PublicCardCreationPage.tsx`
- Modify: `frontend/src/pages/PublicLinkEditPage.tsx`
- Test: `frontend/src/pages/PublicCardCreationPage.test.tsx`
- Test: `frontend/src/pages/PublicLinkEditPage.test.tsx`
- Test: `frontend/src/api/adminMutations.test.ts`

**Interfaces:**
- Consumes: Task 2 JSON/multipart `actor_name` requirement.
- Produces: an in-memory `actorName` on both public pages, a click-to-explain edit guard, and client helpers that always serialize `actor_name` for public writes.

- [ ] **Step 1: Write failing UI/client tests**

```tsx
it("blocks public card creation until FIO is provided", async () => {
  await user.click(screen.getByRole("button", { name: /организация/i }));
  expect(screen.getByRole("status")).toHaveTextContent("Сначала укажите ФИО");
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("create-draft"), expect.anything());
});

it("sends actor_name when a public field is autosaved", async () => {
  await user.type(screen.getByLabelText("ФИО"), "Иванов Иван Иванович");
  await user.click(screen.getByLabelText("Поле"));
  expect(lastRequestBody()).toMatchObject({ actor_name: "Иванов Иван Иванович" });
});
```

Also cover no browser persistence after remount, legacy first-save client payload, public submit payload, and multipart upload `FormData`.

- [ ] **Step 2: Run focused frontend tests and confirm expected failure**

Run: `pnpm -C frontend exec vitest run src/pages/PublicCardCreationPage.test.tsx src/pages/PublicLinkEditPage.test.tsx src/api/adminMutations.test.ts`
Expected: failure because no input/guard or `actor_name` exists.

- [ ] **Step 3: Extend the public API helper boundary**

```ts
export async function updatePublicLinkFieldValue(
  rawToken: string, actorName: string, fieldId: string, value: unknown, blockInstanceId: string | null,
) {
  return apiRequest<FieldValueRead>("/api/v1/public-links/edit", {
    method: "POST",
    body: { raw_token: rawToken, actor_name: actorName, field_id: fieldId, value, block_instance_id: blockInstanceId },
  });
}
```

Apply the same explicit parameter to `createCardDraftFromCreationLink`, `firstSaveCardFromCreationLink`, `submitPublicLink`, and `uploadPublicLinkAttachment`. Read-only preview/status/download helpers remain unchanged.

- [ ] **Step 4: Add the shared public-page interaction behavior**

```tsx
const normalizedActorName = actorName.trim().replace(/\s+/g, " ");
const requireActorName = () => {
  if (normalizedActorName) return true;
  setActorHint("Сначала укажите ФИО");
  return false;
};
```

Render a visible `ФИО` input above each public workflow. Call `requireActorName` before draft creation and in the public field pointer/keyboard activation path; retain visual availability of fields rather than using a blanket disabled attribute. Render a temporary `role="status"` hint. Keep FIO in component state only and retain existing lifecycle-denial refresh handling.

- [ ] **Step 5: Run focused tests, typecheck, and formatting checks**

Run: `pnpm -C frontend exec vitest run src/pages/PublicCardCreationPage.test.tsx src/pages/PublicLinkEditPage.test.tsx src/api/adminMutations.test.ts`
Expected: PASS.

Run: `pnpm -C frontend run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit the public UX task**

```powershell
git add frontend/src/api/client.ts frontend/src/api/types.ts frontend/src/pages/PublicCardCreationPage.tsx frontend/src/pages/PublicLinkEditPage.tsx frontend/src/pages/PublicCardCreationPage.test.tsx frontend/src/pages/PublicLinkEditPage.test.tsx frontend/src/api/adminMutations.test.ts
git commit -m "feat: identify public card editors by name"
```

### Task 4: Render creator and public executor in authenticated UI

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/features/cards/CardBaseBlockSurface.tsx`
- Modify: `frontend/src/features/cards/CardsWorkspace.tsx`
- Modify: `frontend/src/features/audit/AuditPanel.tsx`
- Test: `frontend/src/features/cards/CardBaseBlockSurface.test.tsx`
- Test: `frontend/src/features/cards/CardsWorkspace.test.tsx`
- Test: `frontend/src/features/audit/AuditPanel.test.tsx`

**Interfaces:**
- Consumes: authenticated API field `creator_display_name` and event-time `actor_display_name` from Tasks 1-2.
- Produces: Russian creator content in the base block/list and `Публичный пользователь: <ФИО>` in card history.

- [ ] **Step 1: Write failing component tests**

```tsx
it("renders the creator in the base block and selected-card list detail", () => {
  renderWorkspace({ creator_display_name: "Иванов Иван Иванович" });
  expect(screen.getByText("Создатель")).toBeVisible();
  expect(screen.getAllByText("Иванов Иван Иванович").length).toBeGreaterThan(0);
});

it("labels a public audit event with its snapshot executor", () => {
  renderAudit({ actor_type: "public_link", actor_display_name: "Петров Пётр Петрович" });
  expect(screen.getByText("Публичный пользователь: Петров Пётр Петрович")).toBeVisible();
});
```

- [ ] **Step 2: Run focused component tests and confirm expected failure**

Run: `pnpm -C frontend exec vitest run src/features/cards/CardBaseBlockSurface.test.tsx src/features/cards/CardsWorkspace.test.tsx src/features/audit/AuditPanel.test.tsx`
Expected: failure because no creator or public-user label is rendered.

- [ ] **Step 3: Wire server-provided data without frontend derivation**

Add `creator_display_name?: string | null` to `CardSummaryRead` and `CardRead`. Pass the detailed-card value from `CardsWorkspace` into the admin `CardBaseBlockSurface`; render `Не указан` only if the server returns no creator. Add creator content to the card list detail using the summary value, without client-side user lookups.

- [ ] **Step 4: Make history distinguish executor from link creator**

In `AuditPanel`, when `event.actor_type === "public_link"` and the server supplies `actor_display_name`, render exactly `Публичный пользователь: <name>`. Preserve the existing second line for `attributed_user_display_name`, labelled as the creator of the public link; do not substitute one for the other.

- [ ] **Step 5: Run focused frontend regression tests**

Run: `pnpm -C frontend exec vitest run src/features/cards/CardBaseBlockSurface.test.tsx src/features/cards/CardsWorkspace.test.tsx src/features/audit/AuditPanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit the authenticated UI task**

```powershell
git add frontend/src/api/types.ts frontend/src/features/cards/CardBaseBlockSurface.tsx frontend/src/features/cards/CardsWorkspace.tsx frontend/src/features/audit/AuditPanel.tsx frontend/src/features/cards/CardBaseBlockSurface.test.tsx frontend/src/features/cards/CardsWorkspace.test.tsx frontend/src/features/audit/AuditPanel.test.tsx
git commit -m "feat: show card creators and public audit actors"
```

### Task 5: Integrate, document, deploy, and prove the feature

**Files:**
- Modify: `PLANS.md`
- Test: affected backend and frontend suites from Tasks 1-4

**Interfaces:**
- Consumes: all preceding data, API, and UI contracts.
- Produces: a documented, deployed implementation with test, migration, and browser proof.

- [ ] **Step 1: Run the combined feature test suites**

Run: `pytest backend/tests/test_api_phase_1g.py backend/tests/test_audit_schema.py backend/tests/test_public_link_review_lifecycle.py backend/tests/test_card_creation_links.py backend/tests/test_api_phase_2b_attachments.py backend/tests/test_api_card_change_notifications.py -q`
Expected: PASS.

Run: `pnpm -C frontend exec vitest run src/pages/PublicCardCreationPage.test.tsx src/pages/PublicLinkEditPage.test.tsx src/api/adminMutations.test.ts src/features/cards/CardBaseBlockSurface.test.tsx src/features/cards/CardsWorkspace.test.tsx src/features/audit/AuditPanel.test.tsx`
Expected: PASS.

- [ ] **Step 2: Run repository quality gates**

Run: `powershell -ExecutionPolicy Bypass -File scripts/check.ps1 -SkipRemote`
Expected: exit code 0, or record only pre-existing unrelated failures without masking new errors.

Run: `powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1`
Expected: exit code 0.

- [ ] **Step 3: Record completed scope and verification in the plan register**

Add one concise `PLANS.md` checkpoint covering the two new nullable columns, public-mutation FIO rule, creator/audit UI, exact test commands, migration backup/preflight, and known fact that public FIO is claimed rather than authenticated.

- [ ] **Step 4: Commit the integration documentation**

```powershell
git add PLANS.md
git commit -m "docs: record public card actor identity"
```

- [ ] **Step 5: Push, deploy, and run post-deploy checks**

Run: `powershell -ExecutionPolicy Bypass -File scripts/push-git.ps1 -Message "feat: show card creators and identify public changes"`
Expected: `main` reaches `origin/main`.

Run: `powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1`
Expected: server checkout fast-forwards from `origin/main` and server checks pass.

Run: `powershell -ExecutionPolicy Bypass -File scripts/deploy-frontend.ps1`
Expected: frontend asset deploys and same-origin smoke check passes.

- [ ] **Step 6: Browser proof on the staging surface**

Verify an internal card shows its creator in the base block and list. Verify a public creation/edit link shows the FIO guard, blocks a field click before FIO with the exact Russian hint, then saves after FIO; confirm the authenticated audit history shows the public executor and does not change the stored card creator.

## Plan self-review

- Spec coverage: Tasks 1-2 cover persistence, API validation, immutable public creator, all public writes, safe audit, notifications, and migration. Task 3 covers both public pages, nonpersistent FIO, client contracts, and the exact hint. Task 4 covers base block, list, audit executor, and preserved public-link creator. Task 5 covers quality gates, `PLANS.md`, deployment, and live proof.
- Placeholder scan: no deferred implementation markers or unspecified interfaces are used; the migration revision is intentionally generated from the repository's current Alembic head at execution time.
- Type consistency: `creator_display_name` is read-only authenticated card data; `actor_name` is request data; `actor_display_name` is the stored audit event snapshot. These names remain distinct in every task.
