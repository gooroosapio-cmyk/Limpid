/**
 * Conservation des rapports (cahier V2, § 19 ; décision du 4 octobre 2026 : 30 jours) :
 * un rapport, ses versions, sa source et ses illustrations sont effacés 30 jours après sa
 * création. La suppression immédiate reste possible à tout moment.
 */
import "server-only";
import { retention } from "@/lib/config";
import { adminClient } from "@/lib/supabase/admin";
import { deleteReport } from "./delete";

const DAY_MS = 86_400_000;

/** Date de suppression automatique, ou null si la conservation est illimitée (0 jour). */
export function reportExpiresAt(createdAt: Date, days: number = retention.reportDays): Date | null {
  return days > 0 ? new Date(createdAt.getTime() + days * DAY_MS) : null;
}

/** Rapports échus : effacement complet, comme une suppression par le lecteur. Renvoie le nombre traité. */
export async function purgeExpiredReports(limit = 100, days: number = retention.reportDays): Promise<number> {
  if (days <= 0) return 0;
  const db = adminClient();
  const cutoff = new Date(Date.now() - days * DAY_MS).toISOString();
  const { data } = await db
    .from("reports")
    .select("id, owner_id")
    .is("deleted_at", null)
    .eq("is_demo", false)
    .lt("created_at", cutoff)
    .order("created_at")
    .limit(limit);
  let n = 0;
  for (const r of data ?? []) {
    const result = await deleteReport(r.owner_id, r.id);
    if (result === "not_found") continue;
    await db.from("audit_log").insert({ actor_id: null, action: "report.expired", target_kind: "report", target_id: r.id, meta: { days, result } });
    n++;
  }
  return n;
}
