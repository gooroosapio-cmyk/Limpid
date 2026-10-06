/**
 * Relance d'une préparation interrompue (V4, § 4) : une limite atteinte (quota, plafond,
 * suspension) ne propose pas de réessai immédiat promis comme fonctionnel. Le serveur ne
 * fournit pas de date de disponibilité : l'interface affiche « Réessayer plus tard ».
 */
const LATER = new Set(["budget_daily", "budget_monthly", "provider_quota_exhausted", "generation_disabled"]);

export function canRetryNow(errorCode: string | null | undefined): boolean {
  return !LATER.has(errorCode ?? "");
}
