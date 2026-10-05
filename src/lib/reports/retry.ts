/**
 * « Réessayer » un Limpid dont la préparation a échoué (V4, § 13) : nouvelle tâche avec les
 * mêmes réglages et le même document, soumise aux limites du compte. Idempotent par clé.
 */
import "server-only";
import { recordLimitEvent, REPORT_CREATED } from "@/lib/jobs/limits";
import { reportAction } from "@/lib/billing/catalog";
import { accountUsage, attachReservation, CreditError, getEntitlements, releaseReservation, reserveCredits } from "@/lib/billing/wallet";
import { automaticSettings } from "@/lib/reports/create";
import { adminClient } from "@/lib/supabase/admin";

export class RetryError extends Error {
  constructor(
    readonly code: "not_found" | "not_failed" | "limit" | "disabled" | "storage" | "credits" | "weekly",
    message: string,
    readonly detail: { needed?: number; available?: number; nextAt?: string | null; limit?: number } = {},
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
    .select("status, kind, params, source_id")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (report.current_version_id || !last || last.kind !== "generate_report" || ["queued", "running", "succeeded"].includes(last.status)) {
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
  const action = reportAction((await automaticSettings(userId, sourceIds)).chars);
  let reservationId: string;
  try {
    ({ reservationId } = await reserveCredits(userId, action, `report:${idempotencyKey}`, { reportId }, { wallet: ent.wallet }));
  } catch (e) {
    if (e instanceof CreditError && (e.code === "insufficient" || e.code === "weekly")) {
      throw new RetryError(e.code === "insufficient" ? "credits" : "weekly", e.message, e.detail);
    }
    throw e;
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
