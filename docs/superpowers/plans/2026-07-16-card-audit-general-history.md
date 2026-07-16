# Общая история карточек — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать историю карточек общим журналом с фильтрами, группировкой и безопасными точными различиями.

**Architecture:** Расширить `GET /api/v1/audit-events`, сохранив серверное ограничение системным администратором. Сервис вернёт метаданные карточки и безопасно нормализует составные snapshots; React запросит общий журнал, сгруппирует события по карточке и применит фильтры на сервере.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, pytest; React, TypeScript, TanStack Query, Vitest, Testing Library.

## Global Constraints

- История карточек доступна только системному администратору и хранится 14 дней; технический аудит не меняется и хранится 3 дня.
- Чувствительные значения не возвращаются в читаемом diff; поля и карточки остаются schema-driven.
- `lifecycle_sync` исключается из пользовательской истории.
- UI и новые сообщения Russian-first; backend — единственная граница проверки прав.

---

## File Structure

- `backend/app/api/v1/endpoints/audit.py` — query-параметры общего журнала.
- `backend/app/services/audit.py` — фильтрация, метаданные карточки и safe diff.
- `backend/app/schemas/audit.py` — расширенный DTO.
- `backend/tests/test_api_phase_1f.py` — API/RBAC/diff тесты.
- `frontend/src/api/types.ts`, `frontend/src/api/client.ts` — клиентский контракт.
- `frontend/src/pages/HomePage.tsx` — users query включается и для Audit.
- `frontend/src/app/uiText.ts` — русские подписи.
- `frontend/src/features/audit/AuditPanel.tsx`, `.test.tsx` — фильтры, группы, переход и diff.

### Task 1: Общий API-журнал и фильтрация

**Files:**
- Modify: `backend/app/api/v1/endpoints/audit.py:15-37`
- Modify: `backend/app/services/audit.py:21-335`
- Modify: `backend/app/schemas/audit.py:8-57`
- Test: `backend/tests/test_api_phase_1f.py:247-390`

**Interfaces:**
- Produces `list_events_for_actor(..., card_id: UUID | None, card_status: Literal["active", "archived", "all"], actor_filter_user_id: UUID | None)`.
- Produces `AuditEventRead.card_display_name` and `AuditEventRead.card_lifecycle_status`.

- [ ] **Step 1: Write failing API tests**

```python
response = api_client.get(
    "/api/v1/audit-events?scope=card_history&card_status=active&limit=50",
    headers=_actor_headers(system_admin.id),
)
assert response.status_code == 200
assert [item["card_id"] for item in response.json()["items"]] == [str(active_card.id)]
assert response.json()["items"][0]["card_display_name"] == active_card.display_name

by_creator = api_client.get(
    f"/api/v1/audit-events?scope=card_history&actor_user_id={public_link_creator.id}",
    headers=_actor_headers(system_admin.id),
)
assert [item["id"] for item in by_creator.json()["items"]] == [str(public_event.id)]
```

- [ ] **Step 2: Run RED**

Run: `python -m pytest backend/tests/test_api_phase_1f.py -k "card_history_general or card_history_status or card_history_actor" -q`

Expected: FAIL because `card_id` is currently mandatory and filters do not exist.

- [ ] **Step 3: Implement the endpoint and query**

```python
def list_audit_events(
    ...,
    card_id: Annotated[UUID | None, Query()] = None,
    card_status: Annotated[Literal["active", "archived", "all"], Query()] = "active",
    actor_filter_user_id: Annotated[UUID | None, Query(alias="actor_user_id")] = None,
) -> AuditEventListRead:
    events = AuditService(session).list_events_for_actor(
        actor_user_id=actor_user_id, scope=scope, card_id=card_id,
        card_status=card_status, actor_filter_user_id=actor_filter_user_id, limit=limit,
    )
```

For `scope="card_history"`, join `Card`, always exclude `lifecycle_sync`, apply `card_id` only when supplied and use:

```python
if card_status == "active":
    criteria.extend([Card.archived_at.is_(None), Card.lifecycle_status.not_in(("archived", "superseded"))])
elif card_status == "archived":
    criteria.append(or_(Card.archived_at.is_not(None), Card.lifecycle_status.in_(("archived", "superseded"))))
if actor_filter_user_id is not None:
    criteria.append(or_(AuditEvent.actor_user_id == actor_filter_user_id, AuditEvent.attributed_user_id == actor_filter_user_id))
```

Return card name/status via `AuditEventListItem` and `AuditEventRead`; keep the superuser check before querying.

- [ ] **Step 4: Run GREEN**

Run: `python -m pytest backend/tests/test_api_phase_1f.py -k "card_history" -q`

Expected: PASS; replace the old `requires_card_id` expectation with default active general-list coverage.

- [ ] **Step 5: Commit**

Run: `git add backend/app/api/v1/endpoints/audit.py backend/app/services/audit.py backend/app/schemas/audit.py backend/tests/test_api_phase_1f.py; git commit -m "feat: add general card audit filters"`

### Task 2: Безопасный diff составных событий

**Files:**
- Modify: `backend/app/services/audit.py:45-335`
- Test: `backend/tests/test_api_phase_1f.py`

**Interfaces:**
- Produces a field snapshot or `{ "changes": [{ "label": str, "old": object, "new": object }] }` in both display-snapshot positions.

- [ ] **Step 1: Write a failing exact-diff and redaction test**

```python
item = response.json()["items"][0]
assert item["old_data_json"] == {
    "changes": [{"label": "Публичное редактирование", "old": "Отключено", "new": "Включено"}]
}
assert item["new_data_json"] == item["old_data_json"]
assert "secret-before" not in json.dumps(item, ensure_ascii=False)
```

The fixture contains a changed card flag, an unchanged public-field setting and a sensitive-field snapshot.

- [ ] **Step 2: Run RED**

Run: `python -m pytest backend/tests/test_api_phase_1f.py -k "card_history_diff" -q`

Expected: FAIL because raw object snapshots currently reach the UI.

- [ ] **Step 3: Implement the safe normalizer**

```python
def _normalized_change_snapshot(
    *, object_type: str, old_data: dict[str, Any] | None, new_data: dict[str, Any] | None,
) -> list[dict[str, object]] | None:
    if object_type not in {"card", "card_public_access"}:
        return None
    # Compare only allowlisted card/public-access attributes.
    # Convert booleans to "Включено" / "Отключено" and omit unchanged entries.
```

Call it from `_card_history_display_snapshots`; preserve the existing field-snapshot path. Resolve public-field IDs to schema labels. Do not emit raw UUIDs/JSON; sensitive data remains `{ "redacted": true }`. For irrecoverable legacy data return a safe event description, not `Изменено → Изменено`.

- [ ] **Step 4: Run GREEN**

Run: `python -m pytest backend/tests/test_api_phase_1f.py -k "card_history" -q; python -m ruff check backend/app/services/audit.py; python -m ruff format --check backend/app/services/audit.py`

Expected: all pass.

- [ ] **Step 5: Commit**

Run: `git add backend/app/services/audit.py backend/tests/test_api_phase_1f.py; git commit -m "fix: show card audit value differences"`

### Task 3: Клиентский контракт и audit-only supporting data

**Files:**
- Modify: `frontend/src/api/types.ts:945-970`
- Modify: `frontend/src/api/client.ts:1035-1048`
- Modify: `frontend/src/pages/HomePage.tsx:77-180,552-556`
- Test: `frontend/src/features/audit/AuditPanel.test.tsx`

**Interfaces:**
- Produces `listCardHistoryEvents(token, filters: CardHistoryFilters)` where filters have `cardId?`, `cardStatus`, `actorUserId?`.

- [ ] **Step 1: Write a failing request test**

```tsx
await user.click(screen.getByRole("tab", { name: "История карточек" }));
await waitFor(() => {
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("scope=card_history&card_status=active&limit=50"),
    expect.anything(),
  );
});
```

- [ ] **Step 2: Run RED**

Run: `pnpm --dir=frontend exec vitest run src/features/audit/AuditPanel.test.tsx`

Expected: FAIL because querying is disabled without a selected card.

- [ ] **Step 3: Implement client contract**

```ts
export type CardHistoryFilters = {
  cardId?: string;
  cardStatus: "active" | "archived" | "all";
  actorUserId?: string;
};

export async function listCardHistoryEvents(token: string, filters: CardHistoryFilters) {
  const query = new URLSearchParams({ scope: "card_history", card_status: filters.cardStatus, limit: "50" });
  if (filters.cardId) query.set("card_id", filters.cardId);
  if (filters.actorUserId) query.set("actor_user_id", filters.actorUserId);
  return apiRequest<AuditEventListRead>(`/api/v1/audit-events?${query}`, { token });
}
```

Set `usersQuery.enabled` to `Boolean(token && (needsUsers || needsAudit))` and pass users only to `AuditPanel`. Keep the existing audit card selector `includeArchive: true`.

- [ ] **Step 4: Run GREEN**

Run: `pnpm --dir=frontend exec vitest run src/features/audit/AuditPanel.test.tsx; pnpm --dir=frontend typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/pages/HomePage.tsx frontend/src/features/audit/AuditPanel.test.tsx; git commit -m "feat: request general card audit history"`

### Task 4: Фильтры, группы, переход и сброс

**Files:**
- Modify: `frontend/src/features/audit/AuditPanel.tsx:1-151`
- Modify: `frontend/src/features/audit/AuditPanel.test.tsx:1-124`
- Modify: `frontend/src/app/uiText.ts`

**Interfaces:**
- Consumes `AuditEventRead.card_id`, `card_display_name`, `card_lifecycle_status`, `CardHistoryFilters`, `UserRead[]`.
- Produces controls `Статус карточки`, `Карточка`, `Изменение выполнил`, `Сбросить фильтры`; clickable group headers.

- [ ] **Step 1: Write failing interaction tests**

```tsx
expect(await screen.findByRole("button", { name: "Карточка для аудита" })).toBeVisible();
await user.click(screen.getByRole("button", { name: "Карточка для аудита" }));
expect(screen.getByLabelText("Карточка")).toHaveValue(card.id);
await user.selectOptions(screen.getByLabelText("Изменение выполнил"), "user-1");
expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("actor_user_id=user-1"), expect.anything());
await user.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
expect(screen.getByLabelText("Статус карточки")).toHaveValue("active");
```

Add a separate test that `{ changes: [...] }` renders `Включено`/`Отключено`, never JSON and never `Изменено`.

- [ ] **Step 2: Run RED**

Run: `pnpm --dir=frontend exec vitest run src/features/audit/AuditPanel.test.tsx`

Expected: FAIL because no controls, grouping or composite-diff renderer exists.

- [ ] **Step 3: Implement accessible grouped rendering**

```tsx
const [filters, setFilters] = useState<CardHistoryFilters>({ cardStatus: "active" });
const resetFilters = () => setFilters({ cardStatus: "active" });
const groupedEvents = groupHistoryEvents(historyQuery.data?.items ?? []);

{groupedEvents.map((group) => (
  <section key={group.cardId} className="audit-history-card-group">
    <button type="button" onClick={() => setFilters((value) => ({ ...value, cardId: group.cardId }))}>
      {group.cardDisplayName}
    </button>
    <CardHistoryTable events={group.events} />
  </section>
))}
```

Render explicit Russian labels for all three selects. Reset clears card/executor and resets status to `active`. Render field snapshots and `{ changes }` without serializing objects, preserving `Скрыто` and `Нет значения`.

- [ ] **Step 4: Run UI quality checks**

Run: `pnpm --dir=frontend exec vitest run src/features/audit/AuditPanel.test.tsx; pnpm --dir=frontend lint; pnpm --dir=frontend typecheck; pnpm --dir=frontend build`

Expected: tests pass, no new lint errors, typecheck and build pass.

- [ ] **Step 5: Commit**

Run: `git add frontend/src/features/audit/AuditPanel.tsx frontend/src/features/audit/AuditPanel.test.tsx frontend/src/app/uiText.ts; git commit -m "feat: group and filter card audit history"`

### Task 5: Регрессия, документация и выкладка

**Files:**
- Modify: `PLANS.md`
- Modify: `docs/superpowers/specs/2026-07-16-card-audit-general-history-design.md` only for a proven design correction.

- [ ] **Step 1: Run regression and static checks**

Run: `powershell -ExecutionPolicy Bypass -File scripts/test.ps1; powershell -ExecutionPolicy Bypass -File scripts/lint.ps1; powershell -ExecutionPolicy Bypass -File scripts/typecheck.ps1; git diff --check`

Expected: all affected checks pass; record only proven unrelated failures in `PLANS.md`.

- [ ] **Step 2: Document evidence and deploy**

Update `PLANS.md` with commands/results, retention boundaries and administrator-only access. Then run `git add PLANS.md docs/superpowers/specs/2026-07-16-card-audit-general-history-design.md docs/superpowers/plans/2026-07-16-card-audit-general-history.md; git commit -m "docs: record card audit history delivery"`; `scripts/push-git.ps1`; `scripts/deploy.ps1`; and `scripts/deploy-frontend.ps1`.

- [ ] **Step 3: Smoke-test without modifying data**

Run: `powershell -ExecutionPolicy Bypass -File scripts/server-check.ps1`

In the authenticated browser, verify default active general list, three filters, click-through group, reset and one normalized diff. Do not create, edit, archive or disclose card data.

## Self-Review

- Task 1 covers the general API, filtering, creator attribution and RBAC.
- Task 2 covers exact safe diffs and avoids generic changed values.
- Task 3 limits support-data loading to the audit workflow.
- Task 4 covers grouping, card navigation and reset behavior.
- Task 5 covers evidence, deployment and non-mutating visual verification.
