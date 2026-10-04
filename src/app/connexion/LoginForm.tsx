"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle", message: "" });
  return (
    <form action={action} className="card" aria-describedby="login-status">
      <label htmlFor="email">Adresse email</label>
      <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
      <p id="login-status" role="status" className={state.status === "error" ? "notice notice-warn" : "muted"}>
        {state.message}
      </p>
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Envoi…" : "Recevoir un lien de connexion"}
      </button>
    </form>
  );
}
