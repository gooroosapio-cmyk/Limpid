"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isAllowed, recordAttempt } from "@/lib/auth/password";
import { getT } from "@/lib/i18n/server";
import { createUserClient } from "@/lib/supabase/server";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message: string;
}

const Email = z.string().trim().toLowerCase().email().max(254);

async function siteUrl(): Promise<string> {
  if (process.env.LIMPID_SITE_URL) return process.env.LIMPID_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Envoie un lien magique. Réponse identique que l'adresse soit autorisée ou non (pas d'énumération). */
export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const t = (await getT()).auth;
  const parsed = Email.safeParse(form.get("email"));
  if (!parsed.success) return { status: "error", message: t.invalidEmail };
  const email = parsed.data;
  const sent: LoginState = {
    status: "sent",
    message: t.linkSent,
  };
  if (!(await isAllowed(email))) return sent;

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await siteUrl()}/auth/callback`, shouldCreateUser: true },
  });
  if (error) {
    console.error("auth.signInWithOtp", error.status, error.code);
    return { status: "error", message: t.sendFailed };
  }
  return sent;
}


/**
 * Connexion par mot de passe. Même message d'erreur pour une adresse inconnue, non
 * autorisée ou un mauvais mot de passe ; essais limités par adresse et par IP.
 */
export async function signInWithPassword(_prev: LoginState, form: FormData): Promise<LoginState> {
  const t = (await getT()).auth;
  const parsed = Email.safeParse(form.get("email"));
  const password = String(form.get("password") ?? "");
  if (!parsed.success) return { status: "error", message: t.invalidEmail };
  if (!password) return { status: "error", message: t.passwordMissing };
  const email = parsed.data;
  if (!(await recordAttempt("password", email))) {
    return { status: "error", message: t.tooMany };
  }
  if (!(await isAllowed(email))) return { status: "error", message: t.wrong };

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code !== "invalid_credentials") console.error("auth.signInWithPassword", error.status, error.code);
    return { status: "error", message: t.wrong };
  }
  redirect("/");
}

/** Mot de passe oublié : lien de récupération à usage unique, réponse neutre. */
export async function requestPasswordReset(_prev: LoginState, form: FormData): Promise<LoginState> {
  const t = (await getT()).auth;
  const parsed = Email.safeParse(form.get("email"));
  if (!parsed.success) return { status: "error", message: t.invalidEmail };
  const email = parsed.data;
  const sent: LoginState = {
    status: "sent",
    message: t.resetSent,
  };
  if (!(await recordAttempt("reset", email))) return sent;
  if (!(await isAllowed(email))) return sent;
  const supabase = await createUserClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await siteUrl()}/auth/callback` });
  if (error) {
    console.error("auth.resetPasswordForEmail", error.status, error.code);
    return { status: "error", message: t.sendFailed };
  }
  return sent;
}
