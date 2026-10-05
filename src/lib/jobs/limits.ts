/**
 * Traces des rapports lancés et des crédits rendus (journal d'audit, sans contenu). Les
 * plafonds eux-mêmes sont ceux des offres (billing/catalog.ts), contrôlés à la réservation.
 */
import "server-only";
import { adminClient } from "@/lib/supabase/admin";

export const REPORT_CREATED = "report.create";
export const CREDIT_RETURNED = "report.credit_returned";

/** Trace sans contenu, utilisée pour compter les rapports lancés. */
export async function recordLimitEvent(userId: string, action: typeof REPORT_CREATED | typeof CREDIT_RETURNED, reportId: string) {
  await adminClient().from("audit_log").insert({ actor_id: userId, action, target_kind: "report", target_id: reportId });
}
