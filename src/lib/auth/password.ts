/**
 * Connexion par mot de passe (cahier V2, § 18) : liste blanche, réponses neutres (pas
 * d'énumération des comptes), essais limités par adresse et par IP sans verrouillage
 * permanent, règles de mot de passe simples et vérifiables.
 */
import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { isEmailAllowed } from "@/lib/config";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";

/** Fenêtre et nombre d'essais autorisés (par adresse et par IP). */
export const ATTEMPT_WINDOW_MINUTES = 15;
export const MAX_ATTEMPTS = { password: 8, reset: 3 } as const;

export async function isAllowed(email: string): Promise<boolean> {
  if (isEmailAllowed(email)) return true;
  if (!isAdminConfigured()) return false;
  const { data } = await adminClient().from("allowed_emails").select("email").eq("email", email).maybeSingle();
  return !!data;
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
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < 10) return "Le mot de passe doit contenir au moins 10 caractères.";
  if (password.length > 128) return "Le mot de passe est trop long (128 caractères au plus).";
  if (/^\d+$/.test(password)) return "Le mot de passe ne doit pas être composé uniquement de chiffres.";
  const local = email.split("@")[0]!.toLowerCase();
  if (local.length >= 4 && password.toLowerCase().includes(local)) return "Le mot de passe ne doit pas reprendre votre adresse.";
  if (new Set(password).size < 4) return "Le mot de passe est trop répétitif.";
  return null;
}

/** Méthodes d'authentification de la session (jeton Supabase, revendication « amr »). */
export function sessionMethods(accessToken: string | undefined): string[] {
  try {
    const payload = JSON.parse(Buffer.from(accessToken!.split(".")[1]!, "base64url").toString("utf8"));
    return Array.isArray(payload.amr) ? payload.amr.map((a: { method?: string }) => String(a.method)) : [];
  } catch {
    return [];
  }
}
