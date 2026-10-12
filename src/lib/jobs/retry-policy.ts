/**
 * Relances automatiques d'une génération (prompt « Fluidité », § 3) : seuls les incidents
 * transitoires sont relancés, au plus trois fois, avec un délai exponentiel et un jitter.
 * Une source illisible, un format invalide ou un droit refusé ne sont jamais relancés à l'aveugle.
 */

export const MAX_AUTO_RETRIES = 3;

/** Incidents passagers : fournisseur saturé, délai ambigu, réponse coupée, erreur interne. */
const TRANSIENT = new Set([
  "provider_timeout",
  "provider_rate_limited",
  "provider_unavailable",
  "provider_truncated",
  "provider_empty",
  "provider_invalid_json",
  "provider_schema_mismatch",
  "internal",
  "persist_segments",
  "persist_knowledge",
  "persist_evidence",
  "persist_version",
  "persist_report",
]);

/** Échecs définitifs : la même demande échouerait encore (reprise sans objet). */
const FINAL = new Set(["job_invalid", "kind_unsupported", "source_missing", "ocr_source_missing", "ocr_unreadable", "provider_refused", "provider_context_overflow"]);

export function isTransient(code: string): boolean {
  return TRANSIENT.has(code);
}

/** Une reprise par l'utilisateur a un sens (configuration, quota, incident épuisé…). */
export function isRecoverable(code: string): boolean {
  return !FINAL.has(code) && code !== "cancelled";
}

/** Délai avant la relance n° `attempt` (1, 2, 3) : 30 s, 2 min, 8 min, ± 20 %. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = 30_000 * 4 ** Math.max(0, attempt - 1);
  return Math.round(Math.min(base, 10 * 60_000) * (0.8 + 0.4 * random()));
}

/** Décision après un échec : relance programmée ou échec (reprenable ou définitif). */
export function afterFailure(code: string, attempts: number): { retry: true; delayMs: number } | { retry: false; recoverable: boolean } {
  if (isTransient(code) && attempts < MAX_AUTO_RETRIES) return { retry: true, delayMs: backoffMs(attempts + 1) };
  return { retry: false, recoverable: isRecoverable(code) };
}
