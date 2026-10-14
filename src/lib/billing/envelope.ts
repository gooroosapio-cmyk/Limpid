/**
 * Enveloppe de coût fournisseur par compte et par période (spécification du 14 octobre 2026,
 * § 7.1 et 7.2) : 30 % du revenu reconnu de la période (abonnement réparti sur sa durée), au moins
 * la réserve interne de 3 FCFA par crédit engagé dans la période (gratuit, recharges, cours).
 * Comparée au coût réel des appels (journal d'usage), réserve de l'appel suivant comprise.
 */
import "server-only";
import { PLANS, type PlanCode } from "./catalog";
import { XOF_PER_CREDIT } from "./quote";
import { periodStart } from "./wallet";
import { adminClient } from "@/lib/supabase/admin";

/** Parité fixe du franc CFA (BCEAO) : les coûts du journal sont en centimes d'euro. */
export const XOF_PER_EUR = 655.957;
export const ENVELOPE_SHARE = 0.3;

export const centsToXof = (cents: number) => (cents / 100) * XOF_PER_EUR;

/** Budget de la période : 30 % du revenu reconnu, au moins 3 FCFA par crédit engagé. */
export function envelopeXof(monthlyRevenueXof: number, creditsUsed: number): number {
  return Math.max(ENVELOPE_SHARE * monthlyRevenueXof, XOF_PER_CREDIT * creditsUsed);
}

/** Revenu reconnu par mois d'un abonnement : prix mensuel, ou prix annuel réparti sur 12 mois. */
export function monthlyRevenueXof(plan: PlanCode, period: "monthly" | "yearly"): number {
  return period === "yearly" ? PLANS[plan].yearlyXof / 12 : PLANS[plan].monthlyXof;
}

export interface AccountEnvelope {
  since: string;
  revenueXof: number;
  creditsUsed: number;
  budgetXof: number;
  spentXof: number;
  /** Administrateur : suivi, jamais bloqué. */
  exempt: boolean;
}

export async function accountEnvelope(userId: string, now = new Date()): Promise<AccountEnvelope> {
  const db = adminClient();
  const since = (await periodStart(userId, now)).toISOString();
  const [{ data: subs }, { data: reservations }, { data: usage }, { data: profile }] = await Promise.all([
    db.from("subscriptions").select("plan, period").eq("owner_id", userId).lte("starts_at", now.toISOString()).gt("ends_at", now.toISOString()),
    db.from("credit_reservations").select("amount").eq("owner_id", userId).neq("status", "released").gte("created_at", since),
    db.from("usage_ledger").select("actual_cents, reserved_cents").eq("owner_id", userId).gte("created_at", since),
    db.from("profiles").select("role").eq("id", userId).maybeSingle(),
  ]);
  const revenueXof = (subs ?? []).reduce((n, s) => n + monthlyRevenueXof(s.plan as PlanCode, s.period as "monthly" | "yearly"), 0);
  const creditsUsed = (reservations ?? []).reduce((n, r) => n + (r.amount as number), 0);
  const spentXof = centsToXof((usage ?? []).reduce((n, r) => n + ((r.actual_cents as number | null) ?? (r.reserved_cents as number | null) ?? 0), 0));
  return { since, revenueXof, creditsUsed, budgetXof: envelopeXof(revenueXof, creditsUsed), spentXof, exempt: profile?.role === "admin" };
}

/** L'appel suivant (réserve comprise) dépasserait-il l'enveloppe de la période ? */
export function overEnvelope(e: Pick<AccountEnvelope, "budgetXof" | "spentXof" | "exempt">, reserveCents: number): boolean {
  return !e.exempt && e.spentXof + centsToXof(reserveCents) > e.budgetXof;
}
