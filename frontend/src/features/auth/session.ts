import type { CurrentUser } from "@/api/types";

const SESSION_STORAGE_KEY = "reg_engine.session.v1";

export type SessionState = {
  token: string;
  user: CurrentUser;
};

export function loadSession(): SessionState | null {
  const rawValue = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawValue) as SessionState;
    if (!parsed.token || !parsed.user?.id) {
      return null;
    }
    return parsed;
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
