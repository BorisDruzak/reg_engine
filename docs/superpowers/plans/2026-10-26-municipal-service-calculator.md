# Municipal service calculator implementation plan

**Goal:** Deliver the approved calculator and date-based service experience in the existing schema-driven card workflow.

**Spec:** `docs/superpowers/specs/2026-10-26-municipal-service-calculator.md`.

**Architecture:** Pure versioned calendar engine; existing JSONB storage, card transaction/audit and summary consumers; explicit authenticated calculator routes; opt-in schema configuration and reusable modal. No migration or dependency.

## Work

- [x] Domain module and targeted pure tests: calendar/leap boundaries, inclusivity, gaps/adjacency, overlaps/conflicts, 1:2, baseline, closed/open/excluded/review/future and strict limits.
- [x] Backend persistence and routes: read/preview/save/manual, RBAC and field/template/instance scope, optimistic revision, generic/public overwrite prevention, dismissed cutoff, summaries/audit/copy compatibility.
- [x] Frontend modal/client and tests: persisted records, date inputs, live preview, current-date baseline convenience, explicit save/manual and close/cancel.
- [x] Schema setting UI and backend validation; wire field actions into filled-card layout while retaining bulk editor behavior.
- [x] Targeted compatibility checks, browser desktop/mobile full scenario and documented limits; commit/push main, deploy via project scripts, enable only the requested field through audited service/API and verify safe runtime reads.

## Progress

- User approved residual normalization after examples on 2026-10-26.
- Creator check: the selected legacy card records the shared admin account and no public creator name; a human author cannot be reconstructed. Existing personal-profile display already works; no guessed attribution.
- Verification: 248 backend tests passed, 99 skipped; 190 focused frontend tests passed. Ruff/format, mypy, frontend lint/typecheck/build, scoped Prettier and project-map checks passed. Existing hook, deprecation and bundle-size warnings remain.
- Chromium scenario passed at desktop 1280x800 and mobile 390x844 with synthetic API fixtures. Manual input and dated recalculation remain independent from saved service periods; close stays visible during modal scrolling; no horizontal overflow or page errors.
- Published code: `d78ff36007f37065543b598d925f51520d92f111`; sizing fix: `5ad1616d7d586d51be8d0810f135dd1329f534bd`. Both project deployment scripts passed, with active service, database/storage checks and same-origin health/frontend smoke. Final assets: `index-BWK8bwfl.js`, `index-CRUNUC48.css`.
- Enabled only the requested field using the audited schema service. All 219 field storage rows had identical before/after hashes; all 227 card lifecycle snapshots were unchanged. No migration or fabricated period.
- Runtime read-only checks: 217 manual summaries and 2 empty values valid, all 16 actors checked against organization scope (4 allowed/12 denied for the sample), preview did not save, unauthenticated HTTP GET returned 401.
- The real authenticated in-app tab confirmed both actions, manual server preview, no fabricated periods and closing without a save. It exposed a manual-dialog clipping defect: numeric input sizing was previously scoped only to card/public editors. Extending that sizing to both new overlays and constraining grid tracks fixed it. The new internal-bounds assertion failed before the fix and passed after it at 1280x800, 1072x884 and 390x844, both locally and against deployed assets with synthetic API fixtures. The real in-app overlay was visually checked again after publication.

## Verification commands

```powershell
backend/.venv/Scripts/python.exe -m pytest -o addopts='' backend/tests/test_municipal_service_experience.py backend/tests/test_municipal_service_persistence.py backend/tests/test_work_experience.py backend/tests/test_registry_card_services.py backend/tests/test_public_link_transfer_audit_services.py backend/tests/test_api_phase_1g.py backend/tests/test_card_export_templates.py backend/tests/test_api_phase_3_import_export.py backend/tests/test_document_generation_services.py backend/tests/test_card_list_sorting.py -q --tb=short
pnpm -C frontend test:run src/features/cards/ManualExperienceRecalculation.test.tsx src/features/cards/MunicipalServiceCalculator.test.tsx src/features/cards/FilledCardLayout.test.tsx src/features/cards/CardsWorkspace.test.tsx src/features/cards/WorkExperienceEditor.test.tsx src/features/cardLayout/InlineFieldEditor.test.tsx src/features/cardLayout/CardLayoutRenderer.test.tsx src/features/registry/ImportExportPanel.test.tsx src/components/common/AdminMutation.test.tsx
pnpm -C frontend e2e municipal-service-calculator.spec.ts --project=chromium --workers=1
pnpm -C frontend lint
pnpm -C frontend typecheck
pnpm -C frontend build
backend/.venv/Scripts/python.exe -m mypy backend/app
git diff --check
```

Scoped Ruff check/format and Prettier check covered all changed Python and frontend source/test files. Project-map generation/check used process-local exclusions for unrelated untracked QA output directories, without changing Git configuration.
