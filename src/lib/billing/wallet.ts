/**
 * Portefeuille de crédits (spécification, § 6 à 8 et 18) : solde, droits de l'offre active,
 * réservation avant tout appel IA, livraison ou libération une seule fois. Toutes les
 * écritures passent par les fonctions SQL transactionnelles (verrou par compte).
 */
import "server-only";
import { ACTION_PRICES, PLANS, quotaWindows, REPORT_UNIT_ACTIONS, type Action, type PlanCode } from "./catalog";
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
  /** Plafonds de rapports (jour UTC, semaine du lundi) ; null : administrateur, sans plafond. */
  quotas: Quotas | null;
}

export interface Quotas {
  day: { used: number; limit: number; resetAt: string };
  week: { used: number; limit: number; resetAt: string };
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
    public readonly code: "insufficient" | "quota" | "key_reused" | "storage",
    message: string,
    public readonly detail: QuotaDetail = {},
  ) {
    super(message);
  }
}

export interface QuotaDetail {
  needed?: number;
  available?: number;
  dayUsed?: number;
  dayLimit?: number;
  weekUsed?: number;
  weekLimit?: number;
  /** Date à laquelle toutes les limites atteintes sont levées. */
  nextAt?: string | null;
}

/** Offre et mode à partir des abonnements (dates) et des lots (recharge valide). */
export function resolvePlan(subs: SubRow[], lots: LotRow[], now = new Date()): { plan: PlanCode; mode: WalletMode; active: SubRow | null } {
  const active = subs.find((s) => new Date(s.starts_at) <= now && new Date(s.ends_at) > now) ?? null;
  if (active) return { plan: active.plan, mode: "subscription", active };
  // Mode « Recharge » : une recharge valide avec des crédits disponibles ou engagés (§ 18).
  const topup = lots.some((l) => l.origin === "topup" && new Date(l.expires_at) > now && l.available + l.reserved > 0);
  return { plan: topup ? "essential" : "free", mode: topup ? "topup" : "free", active: null };
}

/**
 * Plafonds de rythme (V2, § 15) : unités rapport réservées ou livrées dans le jour UTC et la
 * semaine (lundi UTC) en cours ; une réservation rendue (échec) ne compte pas.
 */
export function quotaState(starts: string[], limits: { day: number; week: number }, now = new Date()): Quotas {
  const w = quotaWindows(now);
  const times = starts.map((s) => new Date(s).getTime());
  return {
    day: { used: times.filter((t) => t >= w.dayStart.getTime()).length, limit: limits.day, resetAt: w.dayEnd.toISOString() },
    week: { used: times.filter((t) => t >= w.weekStart.getTime()).length, limit: limits.week, resetAt: w.weekEnd.toISOString() },
  };
}

/** Limites atteintes et date à laquelle elles sont toutes levées (la plus tardive). */
export function quotaBlock(q: Quotas): QuotaDetail | null {
  const dayFull = q.day.used >= q.day.limit;
  const weekFull = q.week.used >= q.week.limit;
  if (!dayFull && !weekFull) return null;
  return {
    dayUsed: q.day.used,
    dayLimit: dayFull ? q.day.limit : undefined,
    weekUsed: q.week.used,
    weekLimit: weekFull ? q.week.limit : undefined,
    nextAt: weekFull ? q.week.resetAt : q.day.resetAt,
  };
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
  const [{ data: lots }, { data: subs }, { data: unitRows }, { data: user }, { data: profile }] = await Promise.all([
    db.from("credit_lots").select("origin, available, reserved, expires_at").eq("owner_id", userId),
    db.from("subscriptions").select("plan, starts_at, ends_at, monthly_credits").eq("owner_id", userId).order("starts_at"),
    db
      .from("credit_reservations")
      .select("created_at")
      .eq("owner_id", userId)
      .in("action", REPORT_UNIT_ACTIONS)
      .neq("status", "released")
      .gte("created_at", new Date(Math.min(quotaWindows(now).weekStart.getTime(), quotaWindows(now).dayStart.getTime())).toISOString()),
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
  // Plafonds de l'offre (le mode Recharge suit ceux d'Essentiel). Administrateurs : sans
  // plafond de rythme, mais les crédits restent dus (jamais d'accès illimité).
  const limits = PLANS[mode === "free" ? "free" : plan].limits;
  const quotas =
    profile?.role === "admin"
      ? null
      : quotaState((unitRows ?? []).map((r) => r.created_at as string), { day: limits.dailyReports, week: limits.weeklyReports }, now);
  return {
    available: valid.reduce((n, l) => n + l.available, 0),
    reserved: lotRows.reduce((n, l) => n + l.reserved, 0),
    nextExpiry,
    plan,
    mode,
    accessEndsAt,
    nextGrant,
    quotas,
  };
}

/** Droits de l'offre active (limites d'accès, filigrane). */
export async function getEntitlements(userId: string) {
  const w = await getWallet(userId);
  return { wallet: w, ...PLANS[w.mode === "free" ? "free" : w.plan] };
}

/**
 * Réserve le prix fixe d'une action avant tout appel IA. Idempotente par clé : un double clic
 * renvoie la même réservation. Lève CreditError si le solde ou un plafond de rapports manque.
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
  // Plafonds revérifiés en base, sous le même verrou que les crédits (dernière place disputée).
  const { data, error } = await db.rpc("reserve_credits_v2", {
    p_owner: userId,
    p_amount: amount,
    p_action: action,
    p_key: key,
    p_job: refs.jobId ?? null,
    p_report: refs.reportId ?? null,
    p_day_limit: wallet.quotas?.day.limit ?? null,
    p_week_limit: wallet.quotas?.week.limit ?? null,
  });
  if (error) {
    const q = /quota_atteint:(\d+):(-?\d+):(\d+):(-?\d+)/.exec(error.message ?? "");
    if (q && wallet.quotas) {
      const detail = quotaBlock({
        day: { ...wallet.quotas.day, used: Number(q[1]) },
        week: { ...wallet.quotas.week, used: Number(q[3]) },
      });
      throw new CreditError("quota", "Plafond de rapports atteint.", detail ?? {});
    }
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
