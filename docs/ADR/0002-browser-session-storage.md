# ADR 0002: Browser Session Storage For MVP

## Status

Accepted

## Context

The current frontend stores the bearer access token and a small current-user snapshot in browser `localStorage` under `reg_engine.session.v1`. This keeps the MVP admin shell simple and preserves a session across page reloads without adding server-side session tables yet.

Browser storage is readable by JavaScript. If an XSS bug is introduced, an attacker could read the bearer token until it expires. The current logout endpoint validates the token but does not revoke it server-side.

## Decision

Keep browser `localStorage` session persistence only for MVP, local development, disposable test environments, and internal staging.

Do not treat `localStorage` bearer-token persistence as production-ready for externally hosted or untrusted-client deployments.

Before production frontend hosting, replace this with:

- server-side session or refresh-token persistence;
- hashed session/refresh tokens stored in PostgreSQL;
- explicit logout revocation;
- httpOnly, `Secure`, `SameSite` cookies for browser session transport;
- short-lived access tokens;
- CSRF protection for cookie-authenticated unsafe methods;
- audit events for login, logout, session revocation, and suspicious session failures.

## MVP Mitigation Assumptions

- `AUTH_TOKEN_SECRET` is deployment-specific and never uses the development default in production-like runtimes.
- `AUTH_ACCESS_TOKEN_MINUTES` remains bounded and intentionally configured.
- The frontend is served only from trusted origins configured by `CORS_ALLOWED_ORIGINS`.
- The app avoids rendering untrusted HTML and does not use unsafe DOM injection.
- Content-Security-Policy should be added before production hosting.
- Operators understand that logout clears browser storage but does not revoke already issued bearer tokens server-side.

## Consequences

- MVP development remains simple and does not introduce a session table during Phase 1L.
- The production readiness checklist must include a dedicated session persistence phase before public deployment.
- Any future feature that increases XSS surface area must re-check this ADR before release.
