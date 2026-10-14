/**
 * Ajout ou reprise d'un support dérivé sur un Limpid existant (§ 4 et § 13) : la base commune
 * conservée (version courante) est réutilisée, sans relire le document ni refacturer la
 * préparation. Devis à coût marginal, réservation atomique avant l'unité payante, une seule
 * unité active par support, idempotent par clé client.
 */
import "server-only";
import { reportAction, ACTION_PRICES, supportAction } from "@/lib/billing/catalog";
import { attachReservation, CreditError, releaseReservation, reserveCredits } from "@/lib/billing/wallet";
import { automaticSettings } from "@/lib/reports/create";
import { adminClient } from "@/lib/supabase/admin";
import { readSupports, type DerivedSupport } from "./supports";

export class SupportRequestError extends Error {
  constructor(
    public readonly code: "not_found" | "not_ready" | "busy" | "ready" | "credits" | "quota" | "storage",
    message: string,
    public readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function requestSupport(userId: string, reportId: string, support: DerivedSupport, key: string): Promise<{ jobId: string }> {
  const db = adminClient();
  const unitKey = `${key}-${support}`;
  const { data: same } = await db.from("jobs").select("id").eq("owner_id", userId).eq("idempotency_key", unitKey).maybeSingle();
  if (same) return { jobId: same.id as string };
  const { data: report } = await db
    .from("reports")
    .select("id, current_version_id, source_id, requested_supports")
    .eq("id", reportId)
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!report) throw new SupportRequestError("not_found", "Limpid introuvable.");
  if (!report.current_version_id) throw new SupportRequestError("not_ready", "Le cours n'est pas encore prêt.");
  const { data: done } = await db.from("support_artifacts").select("id").eq("report_version_id", report.current_version_id).eq("type", support).maybeSingle();
  if (done) throw new SupportRequestError("ready", "Ce support est déjà prêt.");
  const { data: active } = await db
    .from("jobs")
    .select("id")
    .eq("report_id", reportId)
    .eq("kind", "generate_support")
    .eq("params->>support", support)
    .in("status", ["queued", "running", "retrying", "awaiting_confirmation"])
    .limit(1)
    .maybeSingle();
  if (active) throw new SupportRequestError("busy", "Ce support est déjà en préparation.");

  // Coût marginal selon la taille du cours (sources figées au lancement).
  const { data: set } = await db.from("report_sources").select("source_id").eq("report_id", reportId).order("position");
  const ids = (set ?? []).map((r) => r.source_id as string);
  const settings = await automaticSettings(userId, ids.length ? ids : (report.source_id as string));
  const action = supportAction(reportAction(settings.pages));
  let reservationId: string;
  try {
    ({ reservationId } = await reserveCredits(userId, action, `support:${unitKey}`, { reportId }));
  } catch (e) {
    if (e instanceof CreditError && (e.code === "insufficient" || e.code === "quota")) {
      throw new SupportRequestError(e.code === "insufficient" ? "credits" : "quota", e.message, { ...e.detail, needed: ACTION_PRICES[action] });
    }
    throw new SupportRequestError("storage", "Réservation impossible.");
  }
  const job = await db
    .from("jobs")
    .insert({
      owner_id: userId,
      report_id: reportId,
      source_id: report.source_id,
      kind: "generate_support",
      idempotency_key: unitKey,
      params: { support, version_id: report.current_version_id, language: settings.language, credits: { action, amount: ACTION_PRICES[action] } },
    })
    .select("id")
    .single();
  if (job.error || !job.data) {
    if (job.error?.code === "23505") {
      // Même clé déjà acceptée (double envoi) : la réservation est la sienne, jamais rendue ici.
      const { data: winner } = await db.from("jobs").select("id").eq("owner_id", userId).eq("idempotency_key", unitKey).maybeSingle();
      if (winner) return { jobId: winner.id as string };
      // Autre unité active pour ce support (index unique) : cette réservation-ci est rendue.
      await releaseReservation(reservationId);
      throw new SupportRequestError("busy", "Ce support est déjà en préparation.");
    }
    await releaseReservation(reservationId);
    throw new SupportRequestError("storage", "Création de la tâche impossible.");
  }
  await attachReservation(reservationId, { jobId: job.data.id as string, reportId });
  const supports = readSupports(report.requested_supports);
  if (!supports.includes(support)) await db.from("reports").update({ requested_supports: [...supports, support] }).eq("id", reportId);
  return { jobId: job.data.id as string };
}
