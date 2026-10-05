/**
 * Sessions d'appareil (spécification V2, § 5) : règles partagées par le proxy et les écrans.
 * Fichier sans dépendance serveur : testable seul.
 */
export type SessionStatus = "ok" | "inactive" | "inactive_admin" | "absolute" | "revoked";

/** Désactivation de secours : LIMPID_SESSION_POLICY=off. */
export function sessionPolicyOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.LIMPID_SESSION_POLICY !== "off";
}

/** Identifiant de session Supabase (claim session_id du jeton d'accès), sans vérifier la signature : le jeton vient d'être validé par getUser(). */
export function sessionIdOf(accessToken: string | undefined | null): string | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken!.split(".")[1]!, "base64url").toString("utf8")) as { session_id?: unknown };
    return typeof payload.session_id === "string" && /^[0-9a-f-]{36}$/.test(payload.session_id) ? payload.session_id : null;
  } catch {
    return null;
  }
}

/** Chemins jamais soumis au contrôle (machines, déconnexion elle-même). */
export function sessionExempt(pathname: string): boolean {
  return pathname.startsWith("/api/webhooks/") || pathname === "/api/worker" || pathname === "/auth/deconnexion";
}

/**
 * Activité « de premier plan » : navigation de page ou action (écriture). Un sondage en
 * arrière-plan (GET d'API, préchargement) ne prolonge jamais une session.
 */
export function isInteractive(method: string, headers: { get(name: string): string | null }, pathname: string): boolean {
  if (headers.get("next-router-prefetch") || headers.get("purpose") === "prefetch") return false;
  if (method !== "GET" && method !== "HEAD") return !pathname.startsWith("/api/wallet");
  if (pathname.startsWith("/api/")) return false;
  return headers.get("sec-fetch-dest") === "document" || headers.get("rsc") === "1";
}
