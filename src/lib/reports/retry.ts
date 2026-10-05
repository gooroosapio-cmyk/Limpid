/**
 * « Réessayer » un Limpid dont la préparation a échoué (V4, § 13) : nouvelle tâche avec les
 * mêmes réglages et le même document, soumise aux limites du compte. Idempotent par clé.
 */
import "server-only";
import { assertCanStartJob, LimitError, recordLimitEvent, REPORT_CREATED } from "@/lib/jobs/limits";
import { adminClient } from "@/lib/supabase/admin";

export class RetryError extends Error {
  constructor(readonly code: "not_found" | "not_failed" | "limit" | "disabled" | "storage", message: string) {
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
  try {
    // Un échec technique a rendu le crédit : la nouvelle tentative compte comme une création.
    await assertCanStartJob(userId, { newReport: true });
  } catch (e) {
    if (e instanceof LimitError) throw new RetryError("limit", e.message);
    throw e;
  }
  const { error } = await db.from("jobs").insert({
    owner_id: userId,
    report_id: reportId,
    source_id: last.source_id ?? report.source_id,
    kind: "generate_report",
    idempotency_key: idempotencyKey,
    params: last.params,
  });
  if (error?.code === "23505") return;
  if (error) throw new RetryError("storage", "La nouvelle tentative n'a pas pu être lancée.");
  await recordLimitEvent(userId, REPORT_CREATED, reportId);
}
