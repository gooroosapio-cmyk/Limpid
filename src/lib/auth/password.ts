/**
 * Connexion par mot de passe (cahier V2, § 18) : liste blanche, réponses neutres (pas
 * d'énumération des comptes), essais limités par adresse et par IP sans verrouillage
 * permanent, règles de mot de passe simples et vérifiables.
 */
import "server-only";
import type { Dict } from "@/lib/i18n";
import { fr } from "@/lib/i18n/fr";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { isEmailAllowed } from "@/lib/config";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";

/** Fenêtre et nombre d'essais autorisés (par adresse et par IP). */
export const ATTEMPT_WINDOW_MINUTES = 15;
export const MAX_ATTEMPTS = { password: 8, reset: 3, signup: 5, magic: 5 } as const;

export async function isAllowed(email: string): Promise<boolean> {
  if (isEmailAllowed(email)) return true;
  if (!isAdminConfigured()) return false;
  const { data } = await adminClient().from("allowed_emails").select("email").eq("email", email).maybeSingle();
  return !!data || (await signupOpen());
}

/** Inscriptions publiques (offre gratuite) : ouvertes ou fermées depuis l'administration. */
export async function signupOpen(): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const { data } = await adminClient().from("app_settings").select("signup_open").maybeSingle();
  return data?.signup_open === true;
}

const hash = (s: string) => createHash("sha256").update(`limpid:${s}`).digest("hex");

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || h.get("x-real-ip") || "inconnue";
}

/**
 * Enregistre un essai et indique s'il reste sous la limite. Sans base configurée, la
 * limitation intégrée de Supabase Auth reste la seule protection.
 */
export async function recordAttempt(kind: keyof typeof MAX_ATTEMPTS, email: string): Promise<boolean> {
  if (!isAdminConfigured()) return true;
  const db = adminClient();
  const keys = [hash(`email:${email}`), hash(`ip:${await clientIp()}`)];
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60_000).toISOString();
  const { data } = await db.from("auth_attempts").select("key_hash").in("key_hash", keys).eq("kind", kind).gte("created_at", since);
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.key_hash, (counts.get(r.key_hash) ?? 0) + 1);
  if (keys.some((k) => (counts.get(k) ?? 0) >= MAX_ATTEMPTS[kind])) return false;
  await db.from("auth_attempts").insert(keys.map((key_hash) => ({ key_hash, kind })));
  // Ménage opportuniste des essais anciens.
  await db.from("auth_attempts").delete().lt("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  return true;
}

/** Règles : 10 caractères au moins, pas uniquement des chiffres, différent de l'adresse. */
export function passwordProblem(password: string, email: string, rules: Dict["auth"]["rules"] = fr.auth.rules): string | null {
  if (password.length < 10) return rules.short;
  if (password.length > 128) return rules.long;
  if (/^\d+$/.test(password)) return rules.digits;
  const local = email.split("@")[0]!.toLowerCase();
  if (local.length >= 4 && password.toLowerCase().includes(local)) return rules.email;
  if (new Set(password).size < 4) return rules.repetitive;
  return null;
}

/** Méthodes d'authentification de la session (jeton Supabase, revendication « amr »). */
/**
 * Compte créé mais jamais confirmé pour cette adresse : effacé avant l'envoi d'un lien. Sans
 * cela, quelqu'un qui s'est inscrit avec l'adresse d'un autre garderait son mot de passe une
 * fois l'adresse confirmée par son vrai titulaire. Un compte non confirmé n'a aucun contenu.
 */
export async function dropUnconfirmedAccount(email: string): Promise<void> {
  if (!isAdminConfigured()) return;
  const db = adminClient();
  const { data: id } = await db.rpc("unconfirmed_user_by_email", { p_email: email });
  if (!id) return;
  const { error } = await db.auth.admin.deleteUser(id as string);
  if (error) console.error("drop_unconfirmed", error.status);
  else await db.from("audit_log").insert({ action: "auth.drop_unconfirmed", target_kind: "user", target_id: id as string });
}

/** Adresse réservée à un administrateur (liste blanche) : pas d'inscription par mot de passe. */
export async function isAdminAddress(email: string): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const { data } = await adminClient().from("allowed_emails").select("role").eq("email", email).maybeSingle();
  return data?.role === "admin";
}

/** Dernière authentification réelle de la session (claim amr), en secondes depuis l'époque. */
export function lastAuthAt(accessToken: string | undefined): number | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken!.split(".")[1]!, "base64url").toString("utf8"));
    const times = Array.isArray(payload.amr) ? payload.amr.map((a: { timestamp?: unknown }) => Number(a.timestamp)).filter(Number.isFinite) : [];
    return times.length ? Math.max(...times) : null;
  } catch {
    return null;
  }
}

/** Authentification de moins de `maxAgeSec` (opérations sensibles : mot de passe, suppression). */
export function recentlyAuthenticated(accessToken: string | undefined, maxAgeSec = 15 * 60, now = Date.now()): boolean {
  const at = lastAuthAt(accessToken);
  return at !== null && now / 1000 - at <= maxAgeSec;
}

export function sessionMethods(accessToken: string | undefined): string[] {
  try {
    const payload = JSON.parse(Buffer.from(accessToken!.split(".")[1]!, "base64url").toString("utf8"));
    return Array.isArray(payload.amr) ? payload.amr.map((a: { method?: string }) => String(a.method)) : [];
  } catch {
    return [];
  }
}
