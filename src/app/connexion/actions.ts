"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dropUnconfirmedAccount, isAdminAddress, isAllowed, passwordProblem, recordAttempt, signupOpen } from "@/lib/auth/password";
import { getT } from "@/lib/i18n/server";
import { createUserClient } from "@/lib/supabase/server";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message: string;
  /** Champ en cause (message affiché sous ce champ, focus après envoi). */
  field?: "email" | "password";
  /** Adresse saisie, rendue au formulaire après une erreur (rien n'est perdu). */
  email?: string;
}

const Email = z.string().trim().toLowerCase().email().max(254);

async function siteUrl(): Promise<string> {
  if (process.env.LIMPID_SITE_URL) return process.env.LIMPID_SITE_URL.replace(/\/$/, "");
  // En production, jamais l'en-tête Host (un lien envoyé par email ne doit pas pouvoir être détourné).
  if (process.env.VERCEL_ENV === "production") return "https://limpidgooroo.vercel.app";
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Envoie un lien magique. Réponse identique que l'adresse soit autorisée ou non (pas d'énumération). */
export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const t = (await getT()).auth;
  const typed = String(form.get("email") ?? "").slice(0, 254);
  const parsed = Email.safeParse(typed);
  if (!parsed.success) return { status: "error", message: t.invalidEmail, field: "email", email: typed };
  const email = parsed.data;
  const sent: LoginState = {
    status: "sent",
    message: t.linkSent,
  };
  if (!(await recordAttempt("magic", email))) return { status: "error", message: t.tooMany, email };
  if (!(await isAllowed(email))) return sent;
  await dropUnconfirmedAccount(email);

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await siteUrl()}/auth/callback`, shouldCreateUser: true },
  });
  if (error) {
    console.error("auth.signInWithOtp", error.status, error.code);
    return { status: "error", message: t.sendFailed, email };
  }
  return sent;
}


/**
 * Connexion par mot de passe. Même message d'erreur pour une adresse inconnue, non
 * autorisée ou un mauvais mot de passe ; essais limités par adresse et par IP.
 */
export async function signInWithPassword(_prev: LoginState, form: FormData): Promise<LoginState> {
  const t = (await getT()).auth;
  const typed = String(form.get("email") ?? "").slice(0, 254);
  const parsed = Email.safeParse(typed);
  const password = String(form.get("password") ?? "");
  if (!parsed.success) return { status: "error", message: t.invalidEmail, field: "email", email: typed };
  if (!password) return { status: "error", message: t.passwordMissing, field: "password", email: typed };
  const email = parsed.data;
  if (!(await recordAttempt("password", email))) {
    return { status: "error", message: t.tooMany, email };
  }
  if (!(await isAllowed(email))) return { status: "error", message: t.wrong, email };

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code !== "invalid_credentials") console.error("auth.signInWithPassword", error.status, error.code);
    return { status: "error", message: t.wrong, email };
  }
  redirect("/");
}

/** Mot de passe oublié : lien de récupération à usage unique, réponse neutre. */
export async function requestPasswordReset(_prev: LoginState, form: FormData): Promise<LoginState> {
  const t = (await getT()).auth;
  const typed = String(form.get("email") ?? "").slice(0, 254);
  const parsed = Email.safeParse(typed);
  if (!parsed.success) return { status: "error", message: t.invalidEmail, field: "email", email: typed };
  const email = parsed.data;
  const sent: LoginState = {
    status: "sent",
    message: t.resetSent,
  };
  if (!(await recordAttempt("reset", email))) return sent;
  if (!(await isAllowed(email))) return sent;
  // (Pas d'effacement ici : la récupération impose un nouveau mot de passe, choisi par le titulaire.)
  const supabase = await createUserClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await siteUrl()}/auth/callback` });
  if (error) {
    console.error("auth.resetPasswordForEmail", error.status, error.code);
    return { status: "error", message: t.sendFailed };
  }
  return sent;
}

/**
 * Inscription gratuite (§ 9, 11) : email et mot de passe ; l'adresse est confirmée par un
 * lien avant tout crédit. Réponse identique si l'adresse existe déjà (pas d'énumération).
 * Le rôle est toujours « user » (décidé en base, jamais par le formulaire).
 */
export async function signUp(_prev: LoginState, form: FormData): Promise<LoginState> {
  const t = await getT();
  if (!(await signupOpen())) return { status: "error", message: t.signup.closed };
  const typed = String(form.get("email") ?? "").slice(0, 254);
  const parsed = Email.safeParse(typed);
  if (!parsed.success) return { status: "error", message: t.auth.invalidEmail, field: "email", email: typed };
  const email = parsed.data;
  const password = String(form.get("password") ?? "");
  const problem = passwordProblem(password, email, t.auth.rules);
  if (problem) return { status: "error", message: problem, field: "password", email };
  const sent: LoginState = { status: "sent", message: t.signup.sent };
  if (!(await recordAttempt("signup", email))) return { status: "error", message: t.auth.tooMany, email };
  // Adresse d'administrateur : connexion par lien uniquement (même réponse, pas d'énumération).
  if (await isAdminAddress(email)) return sent;
  const supabase = await createUserClient();
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${await siteUrl()}/auth/callback` } });
  if (error) {
    if (error.code === "weak_password") return { status: "error", message: t.auth.weakPassword, field: "password", email };
    if (error.code === "user_already_exists" || error.code === "email_exists") return sent;
    console.error("auth.signUp", error.status, error.code);
    return { status: "error", message: t.auth.sendFailed, email };
  }
  return sent;
}
