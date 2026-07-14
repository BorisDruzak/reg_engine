import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { login } from "@/api/client";
import { uiText } from "@/app/uiText";
import { errorText } from "@/components/common/dataUtils";

import type { SessionState } from "./session";

export function LoginScreen({ onLogin }: { onLogin: (session: SessionState) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const loginMutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: (response) => {
      onLogin({ token: response.access_token, user: response.user });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loginMutation.mutate();
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand-lockup login-brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>{uiText.productName}</h1>
            <span>{uiText.adminWorkspace}</span>
          </div>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            {uiText.email}
            <input
              autoComplete="username"
              name="login"
              type="text"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            {uiText.password}
            <input
              autoComplete="current-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {loginMutation.error && <p className="form-error">{errorText(loginMutation.error)}</p>}
          <button type="submit" className="primary-button" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? uiText.signingIn : uiText.signIn}
          </button>
        </form>
      </section>
    </main>
  );
}
