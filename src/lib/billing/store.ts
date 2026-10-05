/**
 * Achats faits directement sur la boutique Chariow (V2, rattachement par email) :
 *  - CAS B : un compte a confirmé cette adresse → rattaché tout de suite ;
 *  - CAS C : aucun compte (ou adresse pas encore confirmée) → conservé, puis rattaché dès
 *    que l'adresse est confirmée (retour de lien, connexion, « J'ai déjà payé ») ;
 *  - CAS D : vente non conforme (produit, montant, boutique) → mise en vérification, rien n'est attribué.
 * L'avantage reste attribué par fulfill_purchase, une seule fois par vente.
 */
import "server-only";
import { product } from "./catalog";
import { checkSale, getSale, productCodeFor, productIds } from "./chariow";
import { fulfillIntent, newOrderRef, reconcileIntent, type IntentRow } from "./purchase";
import { adminClient } from "@/lib/supabase/admin";

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class StorePending extends Error {}

/** Vente sans commande Limpid : relue, vérifiée, conservée, puis rattachée si possible. */
export async function recordStorePurchase(saleId: string): Promise<"claimed" | "unclaimed" | "review" | "ignored"> {
  const db = adminClient();
  const sale = await getSale(saleId);
  if (!sale) return "ignored";
  const code = sale.product?.id ? productCodeFor(sale.product.id) : null;
  const p = code ? product(code) : null;
  if (!code || !p) {
    // Produit d'une autre offre de la boutique : rien pour Limpid.
    await db.from("audit_log").insert({ action: "billing.unmatched_sale", target_kind: "sale", target_id: saleId, meta: { reason: "produit hors catalogue" } });
    return "ignored";
  }
  const verdict = checkSale(sale, { productId: productIds()[code]!, amountXof: p.xof, storeId: process.env.CHARIOW_STORE_ID || null });
  // Paiement pas encore confirmé : réessayé par le rapprochement périodique.
  if (!verdict.ok && verdict.state === "pending") throw new StorePending(verdict.reason);
  if (!verdict.ok && verdict.state === "failed") return "ignored";
  const raw = sale.customer?.email ?? "";
  const email = normalizeEmail(raw);
  const review = !verdict.ok ? verdict.reason : !EMAIL.test(email) ? "adresse de paiement absente" : null;
  const { error } = await db.from("store_purchases").insert({
    sale_id: saleId,
    product_code: code,
    amount_xof: p.xof,
    email: EMAIL.test(email) ? email : `inconnue+${saleId.toLowerCase().replace(/[^a-z0-9]/g, "")}@invalid`,
    status: review ? "review" : "unclaimed",
    review_reason: review,
  });
  if (error && error.code !== "23505") throw new Error(`store_purchases ${error.code}`);
  if (review) {
    await db.from("audit_log").insert({ action: "billing.review", target_kind: "sale", target_id: saleId, meta: { reason: review } });
    return "review";
  }
  const { data: owner } = await db.rpc("user_by_verified_email", { p_email: email });
  if (!owner) return "unclaimed";
  const n = await claimStorePurchases({ id: owner as string, email, emailConfirmed: true });
  return n > 0 ? "claimed" : "unclaimed";
}

/**
 * Rattache au compte les achats conservés pour son adresse confirmée. Sans danger à appeler
 * souvent : la réservation est atomique et l'attribution unique par vente.
 */
export async function claimStorePurchases(user: { id: string; email: string | null; emailConfirmed: boolean }): Promise<number> {
  if (!user.email || !user.emailConfirmed) return 0;
  const db = adminClient();
  const { data: rows, error } = await db.rpc("claim_store_purchases", { p_owner: user.id, p_email: normalizeEmail(user.email) });
  if (error) throw new Error(`claim_store_purchases ${error.code}`);
  let n = 0;
  for (const r of (rows ?? []) as { sale_id: string; product_code: string; amount_xof: number }[]) {
    if ((await createStoreIntent(user.id, r)) === "succeeded") n++;
  }
  return n;
}

/** Remet un achat dans la file des achats à rattacher (commande interne pas créée). */
async function unclaim(saleId: string) {
  await adminClient().from("store_purchases").update({ status: "unclaimed", owner_id: null, claimed_at: null }).eq("sale_id", saleId).is("intent_id", null);
}

/**
 * Commande interne d'un achat réservé pour un compte, puis attribution. Si la commande ne peut
 * pas être créée, l'achat redevient « à rattacher » : jamais marqué rattaché sans commande.
 */
async function createStoreIntent(ownerId: string, r: { sale_id: string; product_code: string; amount_xof: number }, skipChecks = false): Promise<"succeeded" | "pending" | "failed"> {
  const db = adminClient();
  const providerId = productIds()[r.product_code as keyof ReturnType<typeof productIds>];
  if (!providerId) {
    await unclaim(r.sale_id);
    return "failed";
  }
  {
    const { data: intent, error: e } = await db
      .from("payment_intents")
      .insert({
        owner_id: ownerId,
        order_ref: newOrderRef(),
        product_code: r.product_code,
        amount_xof: r.amount_xof,
        provider_product_id: providerId,
        idempotency_key: `store_${r.sale_id}`.slice(0, 100),
        sale_id: r.sale_id,
        status: "pending",
        origin: "store",
      })
      .select("id, owner_id, order_ref, product_code, amount_xof, status, provider_product_id, sale_id, checkout_url, created_at, fulfilled_at")
      .single();
    if (e || !intent) {
      if (e?.code === "23505") {
        // Vente déjà rattachée à une commande : on relie l'achat à cette commande.
        const { data: other } = await db.from("payment_intents").select("id, status").eq("sale_id", r.sale_id).maybeSingle();
        if (other) await db.from("store_purchases").update({ intent_id: other.id }).eq("sale_id", r.sale_id);
        return other?.status === "succeeded" ? "succeeded" : "pending";
      }
      console.error("store intent", e?.code);
      await unclaim(r.sale_id);
      return "failed";
    }
    await db.from("store_purchases").update({ intent_id: intent.id }).eq("sale_id", r.sale_id);
    await db.from("audit_log").insert({ actor_id: ownerId, action: "billing.store_claimed", target_kind: "sale", target_id: r.sale_id, meta: { product: r.product_code } });
    if (skipChecks) return (await fulfillIntent(intent as IntentRow, r.sale_id)) ? "succeeded" : "pending";
    return (await reconcileIntent(intent as IntentRow)) === "succeeded" ? "succeeded" : "pending";
  }
}

/** Achats restés « rattachés » sans commande (interruption) : remis en file puis rattachés. */
export async function recoverStuckClaims() {
  const db = adminClient();
  const { data } = await db
    .from("store_purchases")
    .select("sale_id, email")
    .eq("status", "claimed")
    .is("intent_id", null)
    .lt("claimed_at", new Date(Date.now() - 10 * 60_000).toISOString())
    .limit(20);
  for (const r of data ?? []) {
    await unclaim(r.sale_id as string);
    const { data: owner } = await db.rpc("user_by_verified_email", { p_email: r.email });
    if (owner) await claimStorePurchases({ id: owner as string, email: r.email as string, emailConfirmed: true });
  }
}

/**
 * Décision de l'administrateur sur un achat de la boutique non rattaché ou à vérifier :
 * rattaché au compte dont l'adresse confirmée est donnée (ex. adresse Apple masquée), si la
 * vente est bien payée ; ou refusé (rien n'est attribué).
 */
export async function adminDecideStorePurchase(saleId: string, accountEmail: string | null): Promise<"approved" | "rejected" | "no_account" | "not_paid" | "not_found"> {
  const db = adminClient();
  const { data: row } = await db.from("store_purchases").select("sale_id, product_code, amount_xof, status").eq("sale_id", saleId).in("status", ["unclaimed", "review"]).maybeSingle();
  if (!row) return "not_found";
  if (!accountEmail) {
    await db.from("store_purchases").update({ status: "rejected", review_reason: "refusé par l'administrateur" }).eq("sale_id", saleId).in("status", ["unclaimed", "review"]);
    return "rejected";
  }
  const { data: owner } = await db.rpc("user_by_verified_email", { p_email: normalizeEmail(accountEmail) });
  if (!owner) return "no_account";
  const sale = await getSale(saleId);
  const paid = !!sale && (sale.status === "completed" || sale.status === "settled") && sale.payment?.status === "success";
  if (!paid) return "not_paid";
  const { data: taken } = await db
    .from("store_purchases")
    .update({ status: "claimed", owner_id: owner, claimed_at: new Date().toISOString() })
    .eq("sale_id", saleId)
    .in("status", ["unclaimed", "review"])
    .select("sale_id")
    .maybeSingle();
  if (!taken) return "not_found";
  const r = await createStoreIntent(owner as string, { sale_id: row.sale_id as string, product_code: row.product_code as string, amount_xof: row.amount_xof as number }, true);
  return r === "succeeded" ? "approved" : "not_found";
}
