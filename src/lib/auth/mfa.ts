/**
 * Code supplémentaire de l'administration (prompt « Fluidité », § 9) : retiré par défaut. Un
 * administrateur déjà connecté accède directement à l'administration ; son rôle reste vérifié en
 * base à chaque requête. `LIMPID_ADMIN_MFA=on` rétablit l'exigence d'une session aal2 (code TOTP).
 */
export type MfaStep = "ok" | "verify" | "enroll";

export function adminMfaRequired(env: Record<string, string | undefined> = process.env): boolean {
  return env.LIMPID_ADMIN_MFA === "on";
}

/** Étape à franchir selon le niveau de la session et l'existence d'un facteur vérifié. */
export function mfaStep(aal: { currentLevel: string | null; nextLevel: string | null } | null, required: boolean): MfaStep {
  if (!required || aal?.currentLevel === "aal2") return "ok";
  return aal?.nextLevel === "aal2" ? "verify" : "enroll";
}

/** Code à 6 chiffres (espaces tolérés à la saisie). */
export function totpCode(raw: unknown): string | null {
  const code = String(raw ?? "").replace(/\s+/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

/** Le QR code renvoyé par Supabase est un SVG ; il peut déjà être une adresse data:. */
export function qrDataUrl(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`;
}
