# Card audit history implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute this plan one task at a time. Each task is test-first and must leave the shared `main` worktree clean except for its own focused changes.

**Goal:** Add a system-administrator-only card change history inside the existing Audit section, with safe field value diffs, public-link creator attribution, and automatic retention: 14 days for card history and 3 days for all technical audit events.

**Architecture:** Extend the append-only audit record with an indexed card relation, a retention class, and a separate attributed user. Card and public-link services write normalized, redaction-aware field snapshots through one audit service helper. A guarded API query returns only card-history events. The Audit UI gains a secondary tab, never a tab in the card workspace. A thin CLI invokes the audit retention service from a persistent daily systemd timer.

**Tech Stack:** FastAPI, SQLAlchemy/Alembic/PostgreSQL, React/TypeScript/Vitest, PowerShell deployment scripts, systemd.

## Global constraints

- Keep card data schema-driven; do not add business-specific columns.
- Audit values for any `sensitivity_level != normal` must never be persisted in the diff.
- The card-history read API remains system-administrator-only at the backend boundary.
- Public-link edits retain `actor_type=public_link`; the link creator is attribution, not the actual editor.
- Retention is the user-approved limited exception to the general no-delete rule: only expired audit rows are deleted.
- Do not add History to the card workspace. Its only UI location is the Audit section.
- Work on `main`, per project workflow; do not create a feature branch.

---

### Task 1: Persist audit classification and retention safely

**Files:**
- Modify: `backend/app/models/audit.py`
- Modify: `backend/app/services/audit.py`
- Add: `backend/migrations/versions/0031_card_audit_history.py`
- Add: `backend/tests/test_audit_retention.py`
- Modify: `backend/tests/test_migrations.py`

- [ ] Write failing service tests for `card_history` and `technical` classification, the 14/3-day cutoff, and an exact-cutoff row.
- [ ] Add nullable `card_id`, nullable `attributed_user_id`, non-null `retention_class` (default `technical`), and indexes for history lookup and retention deletion.
- [ ] Add `AuditRetentionService` that deletes only rows older than the appropriate policy threshold in one transaction.
- [ ] Add an Alembic migration that makes all historical rows `technical` and is reversible without deleting audit data.
- [ ] Run the focused retention and migration tests; commit the focused backend foundation.

### Task 2: Produce redaction-aware card diffs and public-link attribution

**Files:**
- Modify: `backend/app/services/audit.py`
- Modify: `backend/app/services/cards.py`
- Modify: `backend/app/services/public_links.py`
- Modify: `backend/tests/test_registry_card_services.py`
- Modify: `backend/tests/test_public_link_transfer_audit_services.py`

- [ ] Write failing tests for a normal field update recording `before` and `after` with field code, label, type, and value.
- [ ] Write failing tests proving a non-normal sensitivity level stores only a redaction marker, never either raw value.
- [ ] Mark all new card/card-field/card-block/lifecycle/public-access events as `card_history` and set `card_id`.
- [ ] For public-link field edits, keep the public-link actor and add the link creator to `attributed_user_id`.
- [ ] Run focused service tests and commit the diff behavior.

### Task 3: Expose a guarded card-history API

**Files:**
- Modify: `backend/app/schemas/audit.py`
- Modify: `backend/app/services/audit.py`
- Modify: `backend/app/api/v1/endpoints/audit.py`
- Modify: `backend/tests/test_api_phase_1f.py`

- [ ] Write API tests for system-admin success, non-admin rejection, card filtering, reverse chronological order, safe diff data, and public-link creator display attribution.
- [ ] Add a bounded, paginated `GET /audit-events?scope=card_history&card_id=...` contract backed by indexed `card_id`, while preserving technical audit behavior.
- [ ] Return only display-safe actor and attribution names required by the UI; do not make the browser resolve users globally.
- [ ] Run focused API tests and commit the contract.

### Task 4: Add the Audit-section history tab

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/features/audit/AuditTable.tsx` or add `AuditPanel.tsx`
- Modify: `frontend/src/pages/HomePage.tsx`
- Modify: `frontend/src/uiText.ts`
- Modify: `frontend/src/App.test.tsx` and/or focused audit component tests

- [ ] Write a failing UI test that opens the Audit section, sees `Технический аудит` and `История карточек`, and does not find a History tab in the card workspace.
- [ ] Implement the secondary Audit tab with a system-admin card selector, lazy history request, newest-first events, actor/link-creator attribution, and expandable `Было`/`Стало` diff.
- [ ] Preserve existing lazy section loading and backend 403 handling; do not call global users APIs.
- [ ] Run focused frontend tests, typecheck, and lint; commit the UI.

### Task 5: Operate cleanup on the runtime server

**Files:**
- Add/Modify: backend CLI module for one retention run
- Add/Modify: `scripts/service.ps1` or a focused audited timer-management script
- Modify: `PLANS.md`

- [ ] Add a CLI command that calls the retention service once and returns the deletion count.
- [ ] Install/enable a `Persistent=true` daily systemd oneshot timer without secrets or hardcoded server paths.
- [ ] Test the command against disposable PostgreSQL and inspect the generated unit/timer text.
- [ ] Update `PLANS.md` with the approved retention exception, implementation status, verification evidence, and operational commands.

### Task 6: Integrate and verify

- [ ] Review the combined changes for audit leaks, especially sensitive field values and public-link attribution.
- [ ] Run backend focused tests, migration check on `_test`, frontend tests/typecheck/lint/build, and `scripts/check.ps1 -SkipRemote` as feasible.
- [ ] Commit, push `main`, deploy to the configured server, run the timer installation, and verify service health plus timer state.
