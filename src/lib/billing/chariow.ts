/**
 * Chariow (spécification, § 13 à 16) : création du paiement, signature des Pulses et
 * vérification d'une vente. Contrat vérifié sur chariow.dev le 5 octobre 2026 :
 *  - POST https://api.chariow.com/v1/checkout (product_id, email, first_name, last_name,
 *    phone { number, country_code }, redirect_url, custom_metadata ≤ 10 clés) ;
 *    réponse data.step = payment | completed | already_purchased, data.purchase.id,
 *    data.payment.checkout_url ;
 *  - Pulse : HMAC-SHA256 du corps brut, en-tête x-chariow-signature « sha256=<hex> »,
 *    x-pulse-delivery-id (absent pour un test), événement dans le corps (« event ») ;
 *  - GET https://api.chariow.com/v1/sales/{id} : data.status, data.payment.status,
 *    data.amount { value, currency }, data.product.id, data.store.id.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { PRODUCT_CODES, type ProductCode } from "./catalog";

const API = "https://api.chariow.com/v1";

export class ChariowError extends Error {
  constructor(
    public readonly code: "not_configured" | "already_purchased" | "rejected" | "unavailable" | "unexpected",
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

/** Produits Chariow : CHARIOW_PRODUCTS = {"essential_monthly":"prd_…", …} (identifiants réels de la boutique). */
export function productIds(env: Record<string, string | undefined> = process.env): Partial<Record<ProductCode, string>> {
  try {
    const raw = JSON.parse(env.CHARIOW_PRODUCTS ?? "{}") as Record<string, unknown>;
    const out: Partial<Record<ProductCode, string>> = {};
    for (const code of PRODUCT_CODES) {
      const id = raw[code];
      if (typeof id === "string" && /^[A-Za-z0-9_-]{3,100}$/.test(id)) out[code] = id;
    }
    return out;
  } catch {
    return {};
  }
}

export function chariowConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.CHARIOW_API_KEY && !!env.CHARIOW_PULSE_SECRET;
}

/** Vérification de signature sur les octets bruts, en temps constant (§ 15). */
export function verifySignature(rawBody: Buffer, header: string | null, secrets: string[]): boolean {
  if (!header) return false;
  const m = /^sha256=([a-f0-9]{64})$/.exec(header.trim());
  if (!m) return false;
  const given = Buffer.from(m[1]!, "hex");
  return secrets.some((secret) => {
    if (!secret) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest();
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}

/** Secrets acceptés : le courant et, pendant une rotation bornée, le précédent. */
export function pulseSecrets(env: Record<string, string | undefined> = process.env): string[] {
  return [env.CHARIOW_PULSE_SECRET, env.CHARIOW_PULSE_SECRET_PREVIOUS].filter((s): s is string => !!s);
}

async function call(path: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
  const key = process.env.CHARIOW_API_KEY;
  if (!key) throw new ChariowError("not_configured", "Paiement non configuré.");
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    throw new ChariowError("unavailable", "Chariow injoignable.");
  }
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const CheckoutResponse = z.object({
  data: z.object({
    step: z.string(),
    purchase: z.object({ id: z.string() }).nullable().optional(),
    payment: z.object({ checkout_url: z.string().nullable().optional() }).nullable().optional(),
  }),
});

export interface CheckoutInput {
  productId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: { number: string; countryCode: string };
  redirectUrl: string;
  orderRef: string;
  customerIp?: string | null;
}

/** Crée la vente Chariow et renvoie l'adresse de paiement (domaine HTTPS contrôlé). */
export async function initCheckout(input: CheckoutInput): Promise<{ saleId: string; checkoutUrl: string }> {
  const { status, body } = await call("/checkout", {
    method: "POST",
    body: JSON.stringify({
      product_id: input.productId,
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      phone: { number: input.phone.number, country_code: input.phone.countryCode },
      redirect_url: input.redirectUrl,
      custom_metadata: { order_ref: input.orderRef },
      ...(input.customerIp ? { customer_ip: input.customerIp } : {}),
    }),
  });
  if (status === 401 || status === 404) throw new ChariowError("not_configured", "Produit ou clé Chariow invalide.", status);
  if (status === 422) throw new ChariowError("rejected", "Données refusées par Chariow.", status);
  if (status >= 500) throw new ChariowError("unavailable", "Chariow indisponible.", status);
  const parsed = CheckoutResponse.safeParse(body);
  if (!parsed.success) throw new ChariowError("unexpected", "Réponse Chariow inattendue.", status);
  const d = parsed.data.data;
  if (d.step === "already_purchased") throw new ChariowError("already_purchased", "Produit déjà acheté.", status);
  // « completed » sans paiement = produit gratuit : jamais accepté pour une offre payante.
  if (d.step !== "payment" || !d.purchase?.id || !d.payment?.checkout_url) throw new ChariowError("unexpected", `Étape inattendue : ${d.step}.`, status);
  if (!safeCheckoutUrl(d.payment.checkout_url)) throw new ChariowError("unexpected", "Adresse de paiement inattendue.", status);
  return { saleId: d.purchase.id, checkoutUrl: d.payment.checkout_url };
}

/** Adresse de paiement : HTTPS uniquement, sur un domaine Chariow ou de son prestataire. */
export function safeCheckoutUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const allowed = (process.env.CHARIOW_CHECKOUT_HOSTS ?? "chariow.com,mychariow.com,chariow.shop,moneroo.io")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    const host = u.hostname.toLowerCase();
    return allowed.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

const Money = z.object({ value: z.union([z.number(), z.string()]), currency: z.string() });
const SaleResponse = z.object({
  data: z.object({
    id: z.string(),
    status: z.string(),
    amount: Money.nullable().optional(),
    payment: z.object({ status: z.string().nullable().optional() }).nullable().optional(),
    product: z.object({ id: z.string() }).nullable().optional(),
    store: z.object({ id: z.string() }).nullable().optional(),
  }),
});
export type Sale = z.infer<typeof SaleResponse>["data"];

/** Relit la vente auprès de l'API (la seule référence : jamais le navigateur ni le seul webhook). */
export async function getSale(saleId: string): Promise<Sale | null> {
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(saleId)) return null;
  const { status, body } = await call(`/sales/${encodeURIComponent(saleId)}`, { method: "GET" });
  if (status === 404) return null;
  if (status >= 400) throw new ChariowError(status >= 500 ? "unavailable" : "unexpected", `Lecture de la vente impossible (${status}).`, status);
  const parsed = SaleResponse.safeParse(body);
  if (!parsed.success) throw new ChariowError("unexpected", "Vente illisible.", status);
  return parsed.data.data;
}

export type SaleVerdict =
  | { ok: true }
  | { ok: false; state: "pending" | "failed" | "review"; reason: string };

/**
 * Contrôle d'une vente avant attribution (§ 16) : payée (completed/settled + paiement success),
 * bon produit, montant et devise du catalogue, bonne boutique si elle est configurée.
 */
export function checkSale(
  sale: Sale,
  expected: { productId: string; amountXof: number; storeId?: string | null },
): SaleVerdict {
  if (sale.status === "failed" || sale.status === "abandoned" || sale.payment?.status === "failed" || sale.payment?.status === "cancelled") {
    return { ok: false, state: "failed", reason: `vente ${sale.status}` };
  }
  const paid = (sale.status === "completed" || sale.status === "settled") && sale.payment?.status === "success";
  if (!paid) return { ok: false, state: "pending", reason: `vente ${sale.status}, paiement ${sale.payment?.status ?? "inconnu"}` };
  if (sale.product?.id !== expected.productId) return { ok: false, state: "review", reason: "produit inattendu" };
  if (expected.storeId && sale.store?.id !== expected.storeId) return { ok: false, state: "review", reason: "boutique inattendue" };
  const value = Number(sale.amount?.value);
  if (sale.amount?.currency !== "XOF" || !Number.isFinite(value) || Math.round(value) !== expected.amountXof) {
    return { ok: false, state: "review", reason: `montant inattendu (${sale.amount?.value} ${sale.amount?.currency})` };
  }
  return { ok: true };
}

/** Champs utiles d'un Pulse (aucune donnée client conservée). */
const PulseBody = z.object({
  event: z.string(),
  sale: z.object({ id: z.string(), custom_metadata: z.record(z.string(), z.unknown()).nullable().optional() }).nullable().optional(),
});
export function parsePulse(raw: string): { event: string; saleId: string | null; orderRef: string | null } | null {
  try {
    const p = PulseBody.safeParse(JSON.parse(raw));
    if (!p.success) return null;
    const ref = p.data.sale?.custom_metadata?.order_ref;
    return { event: p.data.event, saleId: p.data.sale?.id ?? null, orderRef: typeof ref === "string" ? ref : null };
  } catch {
    return null;
  }
}
