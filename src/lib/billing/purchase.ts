/**
 * Achats (spécification, § 13 à 17) : commande interne liée au compte connecté, paiement sur
 * Chariow, puis attribution unique après relecture de la vente. Le navigateur ne fournit
 * jamais un montant ni une quantité de crédits : seulement un code produit.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { product, type Product } from "./catalog";
import { ChariowError, checkSale, getSale, initCheckout, productIds } from "./chariow";
import { recordStorePurchase, recoverStuckClaims } from "./store";
import { adminClient } from "@/lib/supabase/admin";

export const CheckoutRequest = z.strictObject({
  product: z.string().max(40),
  first_name: z.string().trim().min(1).max(50),
  last_name: z.string().trim().min(1).max(50),
  phone_number: z.string().trim().regex(/^\d{6,15}$/),
  country_code: z.string().trim().regex(/^[A-Z]{2}$/),
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
});
export type CheckoutRequest = z.infer<typeof CheckoutRequest>;

export class PurchaseError extends Error {
  constructor(
    public readonly code: "unknown_product" | "not_configured" | "unverified" | "already_purchased" | "rejected" | "failed" | "busy",
    message: string,
  ) {
    super(message);
  }
}

export interface IntentRow {
  id: string;
  origin?: "checkout" | "store";
  owner_id: string;
  order_ref: string;
  product_code: string;
  amount_xof: number;
  status: "created" | "pending" | "succeeded" | "failed" | "review" | "uncertain";
  provider_product_id: string;
  sale_id: string | null;
  checkout_url: string | null;
  created_at: string;
  fulfilled_at: string | null;
}

const INTENT_COLUMNS = "id, origin, owner_id, order_ref, product_code, amount_xof, status, provider_product_id, sale_id, checkout_url, created_at, fulfilled_at";

/** Référence opaque de commande (aucune donnée devinable). */
export function newOrderRef(): string {
  return `lmp_${randomBytes(15).toString("hex").slice(0, 24)}`;
}

function siteUrl(): string {
  return (process.env.LIMPID_SITE_URL ?? "https://limpidgooroo.vercel.app").replace(/\/$/, "");
}

/** Crée (ou retrouve, double clic) la commande et renvoie l'adresse de paiement Chariow. */
export async function startCheckout(
  user: { id: string; email: string | null; emailConfirmed: boolean },
  input: CheckoutRequest,
  customerIp: string | null,
): Promise<{ checkoutUrl: string; orderRef: string }> {
  const p = product(input.product);
  if (!p) throw new PurchaseError("unknown_product", "Offre inconnue.");
  const providerId = productIds()[p.code];
  if (!providerId || !process.env.CHARIOW_API_KEY) throw new PurchaseError("not_configured", "Paiement non configuré.");
  if (!user.email || !user.emailConfirmed) throw new PurchaseError("unverified", "Adresse email non vérifiée.");

  const db = adminClient();
  const { data: existing } = await db.from("payment_intents").select(INTENT_COLUMNS).eq("owner_id", user.id).eq("idempotency_key", input.idempotency_key).maybeSingle();
  if (existing?.checkout_url && existing.status === "pending") return { checkoutUrl: existing.checkout_url as string, orderRef: existing.order_ref as string };
  // Double clic : la première demande prépare encore le paiement chez Chariow.
  if (existing?.status === "created") throw new PurchaseError("busy", "Paiement en cours de préparation.");
  if (existing) throw new PurchaseError("failed", "Cette demande de paiement est déjà traitée.");

  const orderRef = newOrderRef();
  const { data: intent, error } = await db
    .from("payment_intents")
    .insert({
      owner_id: user.id,
      order_ref: orderRef,
      product_code: p.code,
      amount_xof: p.xof,
      provider_product_id: providerId,
      idempotency_key: input.idempotency_key,
    })
    .select("id")
    .single();
  if (error || !intent) {
    if (error?.code === "23505") return startCheckout(user, input, customerIp);
    throw new PurchaseError("failed", "La commande n'a pas pu être enregistrée.");
  }
  try {
    const { saleId, checkoutUrl } = await initCheckout({
      productId: providerId,
      email: user.email,
      firstName: input.first_name,
      lastName: input.last_name,
      phone: { number: input.phone_number, countryCode: input.country_code },
      redirectUrl: `${siteUrl()}/paiement/retour?commande=${orderRef}`,
      orderRef,
      customerIp,
    });
    await db.from("payment_intents").update({ sale_id: saleId, checkout_url: checkoutUrl, status: "pending" }).eq("id", intent.id);
    await db.from("audit_log").insert({ actor_id: user.id, action: "billing.checkout", target_kind: "order", target_id: orderRef, meta: { product: p.code } });
    return { checkoutUrl, orderRef };
  } catch (e) {
    const ce = e instanceof ChariowError ? e : null;
    // Délai ou panne : la vente a pu être créée chez Chariow ; elle sera rapprochée, jamais recréée à l'aveugle.
    await db
      .from("payment_intents")
      .update({ status: ce?.code === "unavailable" ? "uncertain" : "failed", review_reason: ce ? `${ce.code}${ce.status ? ` ${ce.status}` : ""}` : "erreur" })
      .eq("id", intent.id);
    console.error("chariow checkout", ce?.code ?? (e as Error).name, ce?.status ?? "");
    if (ce?.code === "already_purchased") throw new PurchaseError("already_purchased", ce.message);
    if (ce?.code === "rejected") throw new PurchaseError("rejected", ce.message);
    if (ce?.code === "not_configured") throw new PurchaseError("not_configured", ce.message);
    throw new PurchaseError("failed", "Le paiement n'a pas pu être préparé.");
  }
}

/**
 * Rapproche une commande avec sa vente Chariow et attribue l'avantage une seule fois.
 * Un échec ancien n'annule jamais une commande déjà payée.
 */
export async function reconcileIntent(intent: IntentRow, saleIdHint?: string | null): Promise<IntentRow["status"]> {
  if (intent.status === "succeeded") return "succeeded";
  const saleId = intent.sale_id ?? saleIdHint ?? null;
  if (!saleId) return intent.status;
  const db = adminClient();
  const sale = await getSale(saleId);
  if (!sale) return intent.status;
  const verdict = checkSale(sale, { productId: intent.provider_product_id, amountXof: intent.amount_xof, storeId: process.env.CHARIOW_STORE_ID || null });
  if (!verdict.ok) {
    if (verdict.state === "pending") {
      if (!intent.sale_id) await db.from("payment_intents").update({ sale_id: saleId }).eq("id", intent.id);
      return intent.status;
    }
    const status = verdict.state === "failed" ? "failed" : "review";
    await db.from("payment_intents").update({ status, review_reason: verdict.reason, sale_id: saleId }).eq("id", intent.id).neq("status", "succeeded");
    if (status === "review") {
      await db.from("audit_log").insert({ actor_id: intent.owner_id, action: "billing.review", target_kind: "order", target_id: intent.order_ref, meta: { reason: verdict.reason } });
    }
    return status;
  }
  // CAS A : payé avec une autre adresse que celle du compte → vérification, rien d'attribué.
  const paidWith = sale.customer?.email?.trim().toLowerCase();
  if (paidWith && intent.origin !== "store") {
    const { data: owner } = await db.auth.admin.getUserById(intent.owner_id);
    const accountEmail = owner?.user?.email?.toLowerCase();
    if (accountEmail && accountEmail !== paidWith) {
      await db.from("payment_intents").update({ status: "review", review_reason: "adresse de paiement différente du compte", sale_id: saleId }).eq("id", intent.id).neq("status", "succeeded");
      await db.from("audit_log").insert({ actor_id: intent.owner_id, action: "billing.review", target_kind: "order", target_id: intent.order_ref, meta: { reason: "email" } });
      return "review";
    }
  }
  return (await fulfillIntent(intent, saleId)) ? "succeeded" : intent.status;
}

/** Attribution unique (fulfill_purchase) d'une commande dont la vente est vérifiée. */
export async function fulfillIntent(intent: IntentRow, saleId: string): Promise<boolean> {
  const p = product(intent.product_code) as Product;
  const { data, error } = await adminClient().rpc("fulfill_purchase", {
    p_intent: intent.id,
    p_sale: saleId,
    p_benefit: p.kind,
    p_plan: p.kind === "subscription" ? p.plan : null,
    p_period: p.kind === "subscription" ? p.period : null,
    p_monthly: p.kind === "subscription" ? p.monthlyCredits : null,
    p_topup: p.kind === "topup" ? p.credits : null,
  });
  if (error) {
    console.error("fulfill_purchase", error.code);
    return false;
  }
  return data === "attribue" || data === "deja_attribue";
}

/**
 * Décision de l'administrateur sur une commande « à vérifier » (adresse différente, montant
 * ou produit inattendus) : validée seulement si la vente est réellement payée chez Chariow.
 */
export async function adminDecideIntent(orderRef: string, approve: boolean): Promise<"approved" | "rejected" | "not_paid" | "not_found"> {
  const db = adminClient();
  const { data } = await db.from("payment_intents").select(INTENT_COLUMNS).eq("order_ref", orderRef).in("status", ["review", "uncertain", "pending", "failed"]).maybeSingle();
  const intent = data as IntentRow | null;
  if (!intent) return "not_found";
  if (!approve) {
    await db.from("payment_intents").update({ status: "failed", review_reason: "refusé par l'administrateur" }).eq("id", intent.id).neq("status", "succeeded");
    return "rejected";
  }
  if (!intent.sale_id) return "not_paid";
  const sale = await getSale(intent.sale_id);
  const paid = !!sale && (sale.status === "completed" || sale.status === "settled") && sale.payment?.status === "success";
  if (!paid) return "not_paid";
  return (await fulfillIntent(intent, intent.sale_id)) ? "approved" : "not_found";
}

export async function intentByRef(ownerId: string, orderRef: string): Promise<IntentRow | null> {
  if (!/^lmp_[a-z0-9]{20,40}$/.test(orderRef)) return null;
  const { data } = await adminClient().from("payment_intents").select(INTENT_COLUMNS).eq("owner_id", ownerId).eq("order_ref", orderRef).maybeSingle();
  return (data as IntentRow | null) ?? null;
}

/** Pulse Chariow : retrouve la commande par vente ou par référence, puis rapproche. */
export async function handlePulse(event: string, saleId: string | null, orderRef: string | null): Promise<"processed" | "ignored"> {
  if (!["successful.sale", "failed.sale", "abandoned.sale"].includes(event)) return "ignored";
  const db = adminClient();
  let intent: IntentRow | null = null;
  if (saleId) intent = ((await db.from("payment_intents").select(INTENT_COLUMNS).eq("sale_id", saleId).maybeSingle()).data as IntentRow | null) ?? null;
  if (!intent && orderRef && /^lmp_[a-z0-9]{20,40}$/.test(orderRef)) {
    intent = ((await db.from("payment_intents").select(INTENT_COLUMNS).eq("order_ref", orderRef).maybeSingle()).data as IntentRow | null) ?? null;
    // Référence d'une autre vente : à rapprocher manuellement, jamais attribuée.
    if (intent?.sale_id && saleId && intent.sale_id !== saleId) {
      await db.from("audit_log").insert({ action: "billing.unmatched_sale", target_kind: "sale", target_id: saleId, meta: { order_ref: orderRef } });
      return "ignored";
    }
  }
  if (!intent) {
    // Vente sans commande Limpid (achat direct sur la boutique) : conservée et rattachée par
    // l'adresse confirmée ; jamais de compte créé automatiquement.
    if (!saleId || event !== "successful.sale") return "ignored";
    const r = await recordStorePurchase(saleId);
    return r === "ignored" ? "ignored" : "processed";
  }
  await reconcileIntent(intent, saleId);
  return "processed";
}

/**
 * Rapprochement périodique (webhooks perdus, onglet fermé) : les commandes les moins
 * récemment relues d'abord, pour qu'aucune commande ne bloque la file ; les Pulses
 * interrompus ou en échec sont rejoués ; les attentes sans issue sont closes.
 */
export async function reconcilePending(limit = 25): Promise<number> {
  const db = adminClient();
  const now = Date.now();
  const before = new Date(now - 2 * 60_000).toISOString();
  const { data } = await db
    .from("payment_intents")
    .select(INTENT_COLUMNS)
    .in("status", ["pending", "uncertain"])
    .lt("updated_at", before)
    .order("updated_at")
    .limit(limit);
  let n = 0;
  for (const i of (data ?? []) as IntentRow[]) {
    try {
      const status = await reconcileIntent(i);
      if (status !== i.status) {
        n++;
        continue;
      }
      // Toujours sans paiement confirmé après 7 jours (ou sans vente connue après 2 jours) :
      // close. Un Pulse tardif la rouvre encore (retrouvée par sa vente ou sa référence).
      const age = now - new Date(i.created_at).getTime();
      const stale = (i.status === "pending" && age > 7 * 24 * 3600_000) || (i.status === "uncertain" && !i.sale_id && age > 2 * 24 * 3600_000);
      await db
        .from("payment_intents")
        .update(stale ? { status: "failed", review_reason: "paiement non confirmé" } : { updated_at: new Date().toISOString() })
        .eq("id", i.id)
        .eq("status", i.status);
    } catch (e) {
      console.error("reconcile", (e as Error).name);
    }
  }
  // Pulses en échec, ou restés « reçus » (traitement interrompu) : rejoués pendant 7 jours.
  const { data: pulses } = await db
    .from("webhook_inbox")
    .select("id, event, sale_id, order_ref, attempts, status, received_at")
    .eq("is_test", false)
    .or(`status.eq.failed,and(status.eq.received,received_at.lt.${new Date(now - 10 * 60_000).toISOString()})`)
    .lt("attempts", 20)
    .gt("received_at", new Date(now - 7 * 24 * 3600_000).toISOString())
    .order("received_at")
    .limit(limit);
  for (const w of pulses ?? []) {
    try {
      const outcome = await handlePulse(w.event as string, w.sale_id as string | null, w.order_ref as string | null);
      await db.from("webhook_inbox").update({ status: outcome, processed_at: new Date().toISOString(), attempts: (w.attempts as number) + 1 }).eq("id", w.id);
    } catch (e) {
      await db.from("webhook_inbox").update({ status: "failed", attempts: (w.attempts as number) + 1, last_error: (e as Error).name.slice(0, 100) }).eq("id", w.id);
    }
  }
  await recoverStuckClaims();
  // Commandes jamais transmises à Chariow depuis plus d'un jour : closes.
  await db
    .from("payment_intents")
    .update({ status: "failed", review_reason: "paiement non commencé" })
    .eq("status", "created")
    .lt("created_at", new Date(now - 24 * 3600_000).toISOString());
  return n;
}

/** Date de début d'un nouvel abonnement : à la fin de l'accès déjà payé (§ 17). */
export async function nextSubscriptionStart(ownerId: string): Promise<Date> {
  const { data } = await adminClient().from("subscriptions").select("ends_at").eq("owner_id", ownerId).order("ends_at", { ascending: false }).limit(1).maybeSingle();
  const end = data?.ends_at ? new Date(data.ends_at as string) : null;
  return end && end > new Date() ? end : new Date();
}
