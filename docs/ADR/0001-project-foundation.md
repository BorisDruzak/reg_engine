# ADR 0001: Project Foundation

## Status

Accepted

## Context

Registry Engine needs a maintainable foundation before business features. The project should support Codex-driven development from Windows while running on a Linux VM.

## Decisions

- Use a monorepo-style repository with `backend/` and `frontend/`.
- Use FastAPI for the backend foundation.
- Use React + TypeScript + Vite for the frontend foundation.
- Use pytest, ruff, and mypy as backend quality gates.
- Use Vitest, Testing Library, Playwright, ESLint, Prettier, and TypeScript as frontend quality gates.
- Use PowerShell scripts as the primary local automation layer.
- Keep PostgreSQL configured on the server, but do not require it for healthcheck tests or CI in this phase.

## Consequences

- The repository has more setup files upfront, but future work has predictable checks.
- Windows Codex workflows can run one script instead of remembering backend/frontend command details.
- Business logic remains deliberately absent until the next phase.

