/**
 * Limites anti-abus par compte (cahier V2, § 13) : nouveaux rapports sur 24 h glissantes
 * et tâches actives simultanées. Valeurs configurables ; vérifiées côté serveur avant
 * toute lecture de document ou tout appel IA.
 */
import "server-only";
import { adminClient } from "@/lib/supabase/admin";

function positive(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const ACCOUNT_LIMITS = {
  dailyReports: positive("LIMPID_DAILY_REPORTS", 3),
  activeJobs: positive("LIMPID_ACTIVE_JOBS_PER_ACCOUNT", 1),
};

export const REPORT_CREATED = "report.create";
export const CREDIT_RETURNED = "report.credit_returned";

/** Trace sans contenu, utilisée pour compter les rapports lancés. */
export async function recordLimitEvent(userId: string, action: typeof REPORT_CREATED | typeof CREDIT_RETURNED, reportId: string) {
  await adminClient().from("audit_log").insert({ actor_id: userId, action, target_kind: "report", target_id: reportId });
}

export class LimitError extends Error {
  constructor(
    public readonly code: "busy" | "daily_reports",
    message: string,
  ) {
    super(message);
  }
}

export async function assertCanStartJob(userId: string, opts: { newReport: boolean }) {
  const db = adminClient();
  const { count: active } = await db
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .in("status", ["queued", "running"]);
  if ((active ?? 0) >= ACCOUNT_LIMITS.activeJobs) {
    throw new LimitError("busy", "Un rapport est déjà en préparation. Attendez qu'il soit prêt pour en lancer un autre.");
  }
  if (!opts.newReport) return;
  // Compté dans le journal d'audit, qui survit à la suppression des rapports (supprimer puis
  // recréer ne contourne pas la limite) ; un échec technique rend le crédit (cahier V2, § 14).
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const count = async (action: string) =>
    (await db.from("audit_log").select("id", { count: "exact", head: true }).eq("actor_id", userId).eq("action", action).gte("created_at", since))
      .count ?? 0;
  const today = (await count(REPORT_CREATED)) - (await count(CREDIT_RETURNED));
  if (today >= ACCOUNT_LIMITS.dailyReports) {
    throw new LimitError(
      "daily_reports",
      `Vous avez lancé ${ACCOUNT_LIMITS.dailyReports} rapports ces dernières 24 heures, le maximum pendant l'alpha. Réessayez plus tard.`,
    );
  }
}
