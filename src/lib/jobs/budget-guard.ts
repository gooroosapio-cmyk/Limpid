/**
 * Coupe-circuit de dépense IA (cadrage Q17) : plafond global mensuel et plafond par compte
 * sur 24 h, vérifiés avant chaque appel facturable (génération, OCR, correction de quiz).
 */
import "server-only";
import { budget } from "@/lib/config";
import { adminClient } from "@/lib/supabase/admin";

export class BudgetError extends Error {
  constructor(public readonly code: "generation_disabled" | "budget_monthly" | "budget_daily" | "budget_unreadable") {
    super(code);
  }
}

const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};
const dayStart = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();

async function spentCents(filter: { since: string; ownerId?: string }): Promise<number> {
  let q = adminClient().from("usage_ledger").select("actual_cents, reserved_cents").gte("created_at", filter.since);
  if (filter.ownerId) q = q.eq("owner_id", filter.ownerId);
  const { data, error } = await q;
  if (error) throw new BudgetError("budget_unreadable");
  return (data ?? []).reduce((sum, r) => sum + (r.actual_cents ?? r.reserved_cents ?? 0), 0);
}

/** `reserveCents` : coût maximal prévu de l'opération (un rapport par défaut). */
export async function assertBudget(ownerId: string, reserveCents = budget.perReportCapCents) {
  const db = adminClient();
  const { data: settings } = await db.from("app_settings").select("generation_enabled, monthly_cap_cents").single();
  if (!settings?.generation_enabled) throw new BudgetError("generation_disabled");
  const cap = Math.min(settings.monthly_cap_cents ?? budget.monthlyCapCents, budget.monthlyCapCents);
  if ((await spentCents({ since: monthStart() })) + reserveCents > cap) throw new BudgetError("budget_monthly");
  if ((await spentCents({ since: dayStart(), ownerId })) + reserveCents > budget.perAccountDailyCapCents) {
    throw new BudgetError("budget_daily");
  }
}
