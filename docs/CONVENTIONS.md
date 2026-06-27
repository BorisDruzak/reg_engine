# Conventions

## Python

- Use Python 3.12+ syntax compatible with the configured backend version range.
- Keep API endpoints thin.
- Put settings in `backend/app/core/config.py`.
- Put future persistence code in repositories, not API handlers.
- Name tests `test_*.py`.

## TypeScript

- Use strict TypeScript.
- Keep route-level components in `frontend/src/pages/`.
- Keep shared app wiring in `frontend/src/app/`.
- Prefer named exports for app modules.
- Name component tests `*.test.tsx`.

## Scripts

- PowerShell scripts must resolve the repository root through `scripts/lib/RegEngine.ps1`.
- Scripts should fail fast with non-zero exits on failed checks.
- Scripts must not print secrets or `.env` values.

## Environment Variables

- Use uppercase names.
- Store examples only in `.env.example`.
- Keep real `.env` files outside Git.

## Commits

- Keep commits scoped.
- Mention the changed subsystem in the message when practical.
- Do not commit generated caches, dumps, private keys, MDB/ACCDB files, or real personal data.

