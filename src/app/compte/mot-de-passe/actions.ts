"use server";

import { passwordProblem } from "@/lib/auth/password";
import { getT } from "@/lib/i18n/server";
import { createUserClient } from "@/lib/supabase/server";

export interface PasswordState {
  status: "idle" | "saved" | "error";
  message: string;
}

/** Définit ou change le mot de passe de l'utilisateur connecté, puis ferme ses autres sessions. */
export async function setPassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const t = (await getT()).auth;
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) return { status: "error", message: t.expired };
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { status: "error", message: t.mismatch };
  const problem = passwordProblem(password, data.user.email, t.rules);
  if (problem) return { status: "error", message: problem };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("auth.updateUser", error.status, error.code);
    const message =
      error.code === "same_password"
        ? t.samePassword
        : error.code === "weak_password"
          ? t.weakPassword
          : error.code === "reauthentication_needed"
            ? t.reauth
            : t.saveFailed;
    return { status: "error", message };
  }
  await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);
  return { status: "saved", message: "" };
}
