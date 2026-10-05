/**
 * Portefeuille de crédits (spécification, § 6 à 8 et 18) : solde, droits de l'offre active,
 * réservation avant tout appel IA, livraison ou libération une seule fois. Toutes les
 * écritures passent par les fonctions SQL transactionnelles (verrou par compte).
 */
import "server-only";
import { ACTION_PRICES, PLANS, type Action, type PlanCode } from "./catalog";
import { adminClient } from "@/lib/supabase/admin";

export type WalletMode = "free" | "topup" | "subscription";

export interface Wallet {
  available: number;
  reserved: number;
  /** Prochaine expiration d'un lot non vide. */
  nextExpiry: string | null;
  plan: PlanCode;
  mode: WalletMode;
  /** Fin de l'accès payé (dernier abonnement, renouvellements programmés compris). */
  accessEndsAt: string | null;
  /** Prochaine allocation mensuelle (gratuite ou d'abonnement) et sa quantité. */
  nextGrant: { at: string; credits: number } | null;
  /** Limite hebdomadaire de l'offre gratuite. */
  weekly: { used: number; limit: number; nextAt: string | null } | null;
}

interface LotRow {
  origin: string;
  available: number;
  reserved: number;
  expires_at: string;
}

interface SubRow {
  plan: PlanCode;
  starts_at: string;
  ends_at: string;
  monthly_credits: number;
}

export class CreditError extends Error {
  constructor(
    public readonly code: "insufficient" | "weekly" | "key_reused" | "storage",
    message: string,
    public readonly detail: { needed?: number; available?: number; nextAt?: string | null } = {},
  ) {
    super(message);
  }
}

const WEEK_MS = 7 * 24 * 3600_000;
const REPORT_ACTIONS = ["report_short", "report_standard", "report_long"];

/** Offre et mode à partir des abonnements (dates) et des lots (recharge valide). */
export function resolvePlan(subs: SubRow[], lots: LotRow[], now = new Date()): { plan: PlanCode; mode: WalletMode; active: SubRow | null } {
  const active = subs.find((s) => new Date(s.starts_at) <= now && new Date(s.ends_at) > now) ?? null;
  if (active) return { plan: active.plan, mode: "subscription", active };
  // Mode « Recharge » : une recharge valide avec des crédits disponibles ou engagés (§ 18).
  const topup = lots.some((l) => l.origin === "topup" && new Date(l.expires_at) > now && l.available + l.reserved > 0);
  return { plan: topup ? "essential" : "free", mode: topup ? "topup" : "free", active: null };
}

/** Limite hebdomadaire : rapports réservés ou livrés sur 7 jours glissants (les échecs ne comptent pas). */
export function weeklyState(starts: string[], limit: number, now = new Date()): { used: number; limit: number; nextAt: string | null } {
  const recent = starts.map((s) => new Date(s).getTime()).filter((t) => now.getTime() - t < WEEK_MS).sort((a, b) => a - b);
  const used = recent.length;
  // Prochain rapport possible : quand le plus ancien rapport de la fenêtre en sort.
  const nextAt = used >= limit ? new Date(recent[used - limit]! + WEEK_MS).toISOString() : null;
  return { used, limit, nextAt };
}

export async function ensureAllocations(userId: string) {
  const { error } = await adminClient().rpc("ensure_allocations", { p_owner: userId, p_free_credits: PLANS.free.monthlyCredits });
  if (error) console.error("ensure_allocations", error.code);
}

/**
 * Rattrapage des réservations orphelines (requête interrompue, tâche annulée hors du worker,
 * rapport supprimé en file) : livrée → consommée, terminée sans livraison → rendue. Une tâche
 * encore en file ou en cours garde sa réservation (bail et reprise du worker).
 */
export async function sweepReservations(userId: string) {
  const db = adminClient();
  const { data } = await db
    .from("credit_reservations")
    .select("id, job_id, jobs(status, cancel_requested)")
    .eq("owner_id", userId)
    .eq("status", "reserved")
    .lt("created_at", new Date(Date.now() - 20 * 60_000).toISOString())
    .limit(20);
  for (const r of data ?? []) {
    const job = r.jobs as unknown as { status: string; cancel_requested: boolean } | null;
    const status = job?.status ?? null;
    // Une tâche en file dont l'annulation est demandée (rapport supprimé) ne démarrera jamais.
    if (status === "running" || (status === "queued" && !job?.cancel_requested)) continue;
    if (status === "succeeded" || status === "incomplete_check") await settleReservation(r.id as string);
    else await releaseReservation(r.id as string);
  }
}

export async function getWallet(userId: string): Promise<Wallet> {
  await ensureAllocations(userId);
  await sweepReservations(userId);
  const db = adminClient();
  const now = new Date();
  const [{ data: lots }, { data: subs }, { data: weeklyRows }, { data: user }, { data: profile }] = await Promise.all([
    db.from("credit_lots").select("origin, available, reserved, expires_at").eq("owner_id", userId),
    db.from("subscriptions").select("plan, starts_at, ends_at, monthly_credits").eq("owner_id", userId).order("starts_at"),
    db
      .from("credit_reservations")
      .select("created_at")
      .eq("owner_id", userId)
      .in("action", REPORT_ACTIONS)
      .neq("status", "released")
      .gte("created_at", new Date(now.getTime() - WEEK_MS).toISOString()),
    db.auth.admin.getUserById(userId),
    db.from("profiles").select("role").eq("id", userId).maybeSingle(),
  ]);
  const lotRows = (lots ?? []) as LotRow[];
  const subRows = (subs ?? []) as SubRow[];
  const valid = lotRows.filter((l) => new Date(l.expires_at) > now);
  const { plan, mode, active } = resolvePlan(subRows, lotRows, now);
  const nextExpiry = valid.filter((l) => l.available > 0).map((l) => l.expires_at).sort()[0] ?? null;
  const accessEndsAt = subRows.length ? subRows.map((s) => s.ends_at).sort().at(-1)! : null;

  let nextGrant: Wallet["nextGrant"] = null;
  if (active) {
    // Fin du cycle courant de l'abonnement (allocation suivante, si l'accès continue).
    const cycleEnd = valid.filter((l) => l.origin === "subscription").map((l) => l.expires_at).sort().at(-1);
    const continues = cycleEnd && subRows.some((s) => new Date(s.ends_at) > new Date(cycleEnd));
    if (cycleEnd && continues) nextGrant = { at: cycleEnd, credits: subRows.find((s) => new Date(s.ends_at) > new Date(cycleEnd))!.monthly_credits };
  } else if (user?.user?.email_confirmed_at) {
    const cycleEnd = valid.filter((l) => l.origin === "free_cycle").map((l) => l.expires_at).sort().at(-1);
    if (cycleEnd) nextGrant = { at: cycleEnd, credits: PLANS.free.monthlyCredits };
  }
  // Administrateurs : pas de limite hebdomadaire (les crédits restent dus, jamais illimités).
  const weeklyLimit = profile?.role === "admin" ? null : PLANS[mode === "free" ? "free" : plan].limits.weeklyReports;
  return {
    available: valid.reduce((n, l) => n + l.available, 0),
    reserved: lotRows.reduce((n, l) => n + l.reserved, 0),
    nextExpiry,
    plan,
    mode,
    accessEndsAt,
    nextGrant,
    weekly: mode === "free" && weeklyLimit ? weeklyState((weeklyRows ?? []).map((r) => r.created_at as string), weeklyLimit, now) : null,
  };
}

/** Droits de l'offre active (limites d'accès, filigrane). */
export async function getEntitlements(userId: string) {
  const w = await getWallet(userId);
  return { wallet: w, ...PLANS[w.mode === "free" ? "free" : w.plan] };
}

/**
 * Réserve le prix fixe d'une action avant tout appel IA. Idempotente par clé : un double clic
 * renvoie la même réservation. Lève CreditError si le solde ou la limite hebdomadaire manque.
 */
export async function reserveCredits(
  userId: string,
  action: Action,
  key: string,
  refs: { jobId?: string; reportId?: string } = {},
  opts: { wallet?: Wallet } = {},
): Promise<{ reservationId: string; amount: number }> {
  const amount = ACTION_PRICES[action];
  const db = adminClient();
  const { data: existing } = await db.from("credit_reservations").select("id, amount, action").eq("owner_id", userId).eq("idempotency_key", key).maybeSingle();
  if (existing) {
    if (existing.action !== action || existing.amount !== amount) throw new CreditError("key_reused", "Cette demande a déjà été utilisée pour une autre action.");
    return { reservationId: existing.id as string, amount };
  }
  const wallet = opts.wallet ?? (await getWallet(userId));
  if (REPORT_ACTIONS.includes(action) && wallet.weekly && wallet.weekly.used >= wallet.weekly.limit) {
    throw new CreditError("weekly", "Limite hebdomadaire atteinte.", { nextAt: wallet.weekly.nextAt });
  }
  const { data, error } = await db.rpc("reserve_credits", {
    p_owner: userId,
    p_amount: amount,
    p_action: action,
    p_key: key,
    p_job: refs.jobId ?? null,
    p_report: refs.reportId ?? null,
  });
  if (error) {
    const m = /credits_insuffisants:(\d+)/.exec(error.message ?? "");
    if (m) throw new CreditError("insufficient", "Crédits insuffisants.", { needed: amount, available: Number(m[1]) });
    if ((error.message ?? "").includes("cle_reutilisee")) throw new CreditError("key_reused", "Cette demande a déjà été utilisée pour une autre action.");
    console.error("reserve_credits", error.code);
    throw new CreditError("storage", "Les crédits n'ont pas pu être réservés. Réessayez.");
  }
  return { reservationId: data as string, amount };
}

export async function attachReservation(reservationId: string, refs: { jobId?: string; reportId?: string }) {
  await adminClient()
    .from("credit_reservations")
    .update({ ...(refs.jobId ? { job_id: refs.jobId } : {}), ...(refs.reportId ? { report_id: refs.reportId } : {}) })
    .eq("id", reservationId);
}

export async function settleReservation(reservationId: string) {
  const { error } = await adminClient().rpc("settle_reservation", { p_reservation: reservationId });
  if (error) console.error("settle_reservation", error.code);
}

export async function releaseReservation(reservationId: string) {
  const { error } = await adminClient().rpc("release_reservation", { p_reservation: reservationId });
  if (error) console.error("release_reservation", error.code);
}

/** Fin d'une tâche : livrée → consommée ; échec ou annulation → libérée (une seule fois). */
export async function finishJobReservation(jobId: string, delivered: boolean) {
  const { data } = await adminClient().from("credit_reservations").select("id").eq("job_id", jobId).eq("status", "reserved");
  for (const r of data ?? []) await (delivered ? settleReservation(r.id as string) : releaseReservation(r.id as string));
}

/** Rapports conservés (documents générés non supprimés) et tâches en cours du compte. */
export async function accountUsage(userId: string) {
  const db = adminClient();
  const [{ count: kept }, { count: active }] = await Promise.all([
    db.from("reports").select("id", { count: "exact", head: true }).eq("owner_id", userId).is("deleted_at", null).eq("is_demo", false),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("owner_id", userId).in("status", ["queued", "running"]),
  ]);
  return { kept: kept ?? 0, active: active ?? 0 };
}
