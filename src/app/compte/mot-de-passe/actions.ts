"use server";

import { passwordProblem } from "@/lib/auth/password";
import { createUserClient } from "@/lib/supabase/server";

export interface PasswordState {
  status: "idle" | "saved" | "error";
  message: string;
}

/** Définit ou change le mot de passe de l'utilisateur connecté, puis ferme ses autres sessions. */
export async function setPassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { status: "error", message: "Les deux mots de passe ne correspondent pas." };
  const problem = passwordProblem(password, data.user.email);
  if (problem) return { status: "error", message: problem };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("auth.updateUser", error.status, error.code);
    const message =
      error.code === "same_password"
        ? "Choisissez un mot de passe différent de l'actuel."
        : error.code === "weak_password"
          ? "Ce mot de passe est jugé trop faible. Choisissez-en un plus long."
          : error.code === "reauthentication_needed"
            ? "Par sécurité, reconnectez-vous par lien puis recommencez."
            : "Le mot de passe n'a pas pu être enregistré. Réessayez.";
    return { status: "error", message };
  }
  await supabase.auth.signOut({ scope: "others" }).catch(() => undefined);
  return { status: "saved", message: "" };
}
