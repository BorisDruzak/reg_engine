import type { CurrentUser } from "@/api/types";

const SESSION_STORAGE_KEY = "reg_engine.session.v1";

export type SessionState = {
  token: string;
  user: CurrentUser;
  expiresAt: string;
};

export function loadSession(): SessionState | null {
  const rawValue = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawValue) as Partial<SessionState>;
    if (!parsed.token || !parsed.user?.id) {
      return null;
    }
    const expiresAt = normalizeExpiry(parsed.expiresAt) ?? tokenExpiry(parsed.token);
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
      clearSession();
      return null;
    }
    return { token: parsed.token, user: parsed.user, expiresAt: expiresAt ?? "" };
  } catch {
    return null;
  }
}

export function saveSession(session: SessionState) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function sessionExpiryTimestamp(session: SessionState) {
  const timestamp = Date.parse(session.expiresAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeExpiry(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function tokenExpiry(token: string) {
  const [encodedPayload] = token.split(".");
  if (!encodedPayload) {
    return null;
  }
  try {
    const normalizedPayload = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      "=",
    );
    const payload = JSON.parse(atob(paddedPayload)) as { exp?: unknown };
    if (typeof payload.exp !== "number") {
      return null;
    }
    return normalizeExpiry(new Date(payload.exp * 1000).toISOString());
  } catch {
    return null;
  }
}
