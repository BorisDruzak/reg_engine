# Municipal service calculator implementation plan

**Goal:** Deliver the approved calculator and date-based service experience in the existing schema-driven card workflow.

**Spec:** `docs/superpowers/specs/2026-10-26-municipal-service-calculator.md`.

**Architecture:** Pure versioned calendar engine; existing JSONB storage, card transaction/audit and summary consumers; explicit authenticated calculator routes; opt-in schema configuration and reusable modal. No migration or dependency.

## Work

- [x] Domain module and targeted pure tests: calendar/leap boundaries, inclusivity, gaps/adjacency, overlaps/conflicts, 1:2, baseline, closed/open/excluded/review/future and strict limits.
- [x] Backend persistence and routes: read/preview/save/manual, RBAC and field/template/instance scope, optimistic revision, generic/public overwrite prevention, dismissed cutoff, summaries/audit/copy compatibility.
- [x] Frontend modal/client and tests: persisted records, date inputs, live preview, current-date baseline convenience, explicit save/manual and close/cancel.
- [x] Schema setting UI and backend validation; wire field actions into filled-card layout while retaining bulk editor behavior.
- [ ] Targeted compatibility checks, browser desktop/mobile full scenario and documented limits; commit/push main, deploy via project scripts, enable only the requested field through audited service/API and verify safe runtime reads.

## Progress

- User approved residual normalization after examples on 2026-10-26.
- Creator check: the selected legacy card records the shared admin account and no public creator name; a human author cannot be reconstructed. Existing personal-profile display already works; no guessed attribution.
- Verification: 248 backend tests passed, 99 skipped; 190 focused frontend tests passed. Ruff/format, mypy, frontend lint/typecheck/build, scoped Prettier and project-map checks passed. Existing hook, deprecation and bundle-size warnings remain.
- Chromium scenario passed at desktop 1280x800 and mobile 390x844 with synthetic API fixtures. Manual input and dated recalculation remain independent from saved service periods; close stays visible during modal scrolling; no horizontal overflow or page errors.
- No migration. Release and activation of only the requested field are pending. Existing field values must be unchanged by activation; verify this with before/after storage hashes.
