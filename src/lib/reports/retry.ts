/**
 * « Reprendre la génération » d'un Limpid interrompu (V4, § 13 ; prompt « Fluidité », § 6) :
 * la même tâche repart (mêmes réglages, même document, étapes déjà validées conservées) ; seules
 * les unités manquantes sont refaites. L'échec a rendu les crédits : la reprise réserve à nouveau
 * le prix du devis d'origine, donc un seul débit au total, sans surcoût. Idempotent par clé.
 */
import "server-only";
import { recordLimitEvent, REPORT_CREATED } from "@/lib/jobs/limits";
import { ACTION_PRICES, type Action } from "@/lib/billing/catalog";
import { accountUsage, attachReservation, CreditError, getEntitlements, releaseReservation, reserveCredits } from "@/lib/billing/wallet";
import { automaticSettings, courseQuote } from "@/lib/reports/create";
import { adminClient } from "@/lib/supabase/admin";

export class RetryError extends Error {
  constructor(
    readonly code: "not_found" | "not_failed" | "limit" | "disabled" | "storage" | "credits" | "quota",
    message: string,
    readonly detail: { needed?: number; available?: number; nextAt?: string | null; limit?: number; periodLimit?: number } = {},
  ) {
    super(message);
  }
}

export async function retryReport(userId: string, reportId: string, idempotencyKey: string): Promise<void> {
  const db = adminClient();
  const { data: existing } = await db.from("jobs").select("id").eq("owner_id", userId).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing) return;
  const { data: report } = await db
    .from("reports")
    .select("id, current_version_id, source_id")
    .eq("id", reportId)
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!report) throw new RetryError("not_found", "Limpid introuvable.");
  const { data: last } = await db
    .from("jobs")
    .select("id, status, kind, params, source_id, recoverable")
    .eq("report_id", reportId)
    .neq("kind", "generate_support")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Une première génération en échec peut avoir publié une version partielle : elle se relance aussi.
  if (!last || last.kind !== "generate_report" || ["queued", "running", "retrying", "succeeded", "incomplete_check"].includes(last.status)) {
    // Même clé déjà acceptée (double toucher, accusé perdu) : la reprise est en cours.
    const { data: same } = await db.from("credit_reservations").select("id").eq("owner_id", userId).eq("idempotency_key", `report:${idempotencyKey}`).maybeSingle();
    if (same) return;
    throw new RetryError("not_failed", "Ce Limpid n'est pas en échec.");
  }
  const { data: settings } = await db.from("app_settings").select("generation_enabled").single();
  if (!settings?.generation_enabled) throw new RetryError("disabled", "La génération est suspendue par l'administrateur.");
  // L'échec a rendu les crédits : la nouvelle tentative réserve à nouveau son prix fixe.
  const ent = await getEntitlements(userId);
  if ((await accountUsage(userId)).active >= ent.limits.concurrentJobs) {
    throw new RetryError("limit", "Un rapport est déjà en préparation. Attendez qu'il soit prêt pour en lancer un autre.");
  }
  const { data: set } = await db.from("report_sources").select("source_id").eq("report_id", reportId).order("position");
  const sourceIds = set?.length ? set.map((r) => r.source_id as string) : [(last.source_id ?? report.source_id) as string];
  // Même prix que le devis d'origine (prix continu, ou ancien palier fixe) ; à défaut, nouveau devis.
  const credits = (last.params as { credits?: { action?: string; amount?: number } } | null)?.credits;
  let action: Action;
  let amount: number;
  if (credits?.action === "report" && credits.amount) [action, amount] = ["report", credits.amount];
  else if (credits?.action && credits.action in ACTION_PRICES) [action, amount] = [credits.action as Action, ACTION_PRICES[credits.action as keyof typeof ACTION_PRICES]];
  else [action, amount] = ["report", courseQuote((await automaticSettings(userId, sourceIds)).measure, 0).credits];
  let reservationId: string;
  try {
    ({ reservationId } = await reserveCredits(userId, action, `report:${idempotencyKey}`, { reportId }, { wallet: ent.wallet, amount }));
  } catch (e) {
    if (e instanceof CreditError && (e.code === "insufficient" || e.code === "quota")) {
      throw new RetryError(e.code === "insufficient" ? "credits" : "quota", e.message, e.detail);
    }
    throw e;
  }
  // Même tâche logique : ses étapes enregistrées (lecture, plan, chapitres) sont réutilisées.
  if (last.status === "failed" || last.status === "uncertain") {
    const { data: resumed } = await db
      .from("jobs")
      .update({ status: "queued", error_code: null, recoverable: null, attempts: 0, next_run_at: null, finished_at: null, cancel_requested: false })
      .eq("id", last.id)
      .in("status", ["failed", "uncertain"])
      .select("id");
    if (!resumed?.length) {
      // Double toucher : la reprise a déjà été lancée par une autre requête.
      await releaseReservation(reservationId);
      return;
    }
    await attachReservation(reservationId, { jobId: last.id as string });
    await recordLimitEvent(userId, REPORT_CREATED, reportId);
    return;
  }
  const { data: job, error } = await db.from("jobs").insert({
    owner_id: userId,
    report_id: reportId,
    source_id: last.source_id ?? report.source_id,
    kind: "generate_report",
    idempotency_key: idempotencyKey,
    params: last.params,
  }).select("id").single();
  if (error?.code === "23505") return;
  if (error || !job) {
    await releaseReservation(reservationId);
    throw new RetryError("storage", "La nouvelle tentative n'a pas pu être lancée.");
  }
  await attachReservation(reservationId, { jobId: job.id as string });
  await recordLimitEvent(userId, REPORT_CREATED, reportId);
}
