/**
 * Relance d'une préparation interrompue (V4, § 4) : une limite atteinte (quota, plafond,
 * suspension) ne propose pas de réessai immédiat promis comme fonctionnel. Le serveur ne
 * fournit pas de date de disponibilité : l'interface affiche « Réessayer plus tard ».
 * Le plafond quotidien est glissant (24 h) : il se libère au fil des heures, la relance reste
 * proposée (le serveur la refuse, avec le message du plafond, tant qu'il est atteint).
 */
const LATER = new Set(["budget_monthly", "provider_quota_exhausted", "generation_disabled"]);

export function canRetryNow(errorCode: string | null | undefined): boolean {
  return !LATER.has(errorCode ?? "");
}
