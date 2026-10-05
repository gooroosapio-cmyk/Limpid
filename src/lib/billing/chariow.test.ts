import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkSale, parsePulse, productIds, safeCheckoutUrl, verifySignature, type Sale } from "./chariow";

const SECRET = "whsec_test_secret";
const sign = (body: Buffer, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("signature des Pulses (T33, T34)", () => {
  // Corps tel qu'envoyé : barres obliques échappées et caractères accentués.
  const raw = Buffer.from('{"event":"successful.sale","sale":{"id":"sal_1","custom_metadata":{"order_ref":"lmp_aaaaaaaaaaaaaaaaaaaaaaaa"}},"store":{"url":"https:\\/\\/boutique.mychariow.com"},"customer":{"name":"Aïcha Koné"}}', "utf8");

  it("valide sur les octets bruts reçus", () => {
    expect(verifySignature(raw, sign(raw), [SECRET])).toBe(true);
  });
  it("re-sérialiser le JSON casserait la signature : on ne le fait pas", () => {
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(raw.toString("utf8"))), "utf8");
    expect(verifySignature(reserialized, sign(raw), [SECRET])).toBe(false);
  });
  it("absente, mal formée, mauvais secret ou corps modifié : refusée", () => {
    expect(verifySignature(raw, null, [SECRET])).toBe(false);
    expect(verifySignature(raw, "sha256=abc", [SECRET])).toBe(false);
    expect(verifySignature(raw, sign(raw).replace("sha256=", ""), [SECRET])).toBe(false);
    expect(verifySignature(raw, sign(raw, "autre"), [SECRET])).toBe(false);
    expect(verifySignature(Buffer.concat([raw, Buffer.from(" ")]), sign(raw), [SECRET])).toBe(false);
    expect(verifySignature(raw, sign(raw), [])).toBe(false);
  });
  it("rotation : l'ancien secret reste accepté tant qu'il est déclaré", () => {
    expect(verifySignature(raw, sign(raw, "ancien"), [SECRET, "ancien"])).toBe(true);
  });
  it("lecture du Pulse : événement, vente et référence seulement", () => {
    expect(parsePulse(raw.toString("utf8"))).toEqual({ event: "successful.sale", saleId: "sal_1", orderRef: "lmp_aaaaaaaaaaaaaaaaaaaaaaaa" });
    expect(parsePulse("pas du json")).toBeNull();
  });
});

describe("vérification d'une vente avant attribution (T41, T43)", () => {
  const sale = (o: Partial<Sale> = {}): Sale => ({
    id: "sal_1",
    status: "completed",
    amount: { value: 5900, currency: "XOF" },
    payment: { status: "success" },
    product: { id: "prd_plus_m" },
    store: { id: "str_1" },
    ...o,
  });
  const expected = { productId: "prd_plus_m", amountXof: 5_900, storeId: "str_1" };

  it("payée (completed ou settled + success), bon produit, bon montant : attribuable", () => {
    expect(checkSale(sale(), expected)).toEqual({ ok: true });
    expect(checkSale(sale({ status: "settled" }), expected)).toEqual({ ok: true });
    expect(checkSale(sale({ amount: { value: "5900.00", currency: "XOF" } }), expected)).toEqual({ ok: true });
  });
  it("en attente de paiement : rien n'est attribué", () => {
    expect(checkSale(sale({ status: "awaiting_payment", payment: { status: "pending" } }), expected)).toMatchObject({ ok: false, state: "pending" });
  });
  it("échec ou abandon : non confirmé", () => {
    expect(checkSale(sale({ status: "failed" }), expected)).toMatchObject({ ok: false, state: "failed" });
    expect(checkSale(sale({ status: "abandoned" }), expected)).toMatchObject({ ok: false, state: "failed" });
  });
  it("produit, montant, devise ou boutique inattendus : revue, sans attribution", () => {
    expect(checkSale(sale({ product: { id: "prd_pro_m" } }), expected)).toMatchObject({ ok: false, state: "review" });
    expect(checkSale(sale({ amount: { value: 2900, currency: "XOF" } }), expected)).toMatchObject({ ok: false, state: "review" });
    expect(checkSale(sale({ amount: { value: 5900, currency: "EUR" } }), expected)).toMatchObject({ ok: false, state: "review" });
    expect(checkSale(sale({ store: { id: "str_autre" } }), expected)).toMatchObject({ ok: false, state: "review" });
  });
});

describe("configuration", () => {
  it("produits : seuls les neuf codes du catalogue, identifiants bien formés", () => {
    const ids = productIds({ CHARIOW_PRODUCTS: JSON.stringify({ plus_monthly: "prd_abc", admin: "prd_x", pro_yearly: "bad id!" }) });
    expect(ids).toEqual({ plus_monthly: "prd_abc" });
    expect(productIds({ CHARIOW_PRODUCTS: "pas du json" })).toEqual({});
  });
  it("adresse de paiement : HTTPS sur un domaine autorisé seulement", () => {
    expect(safeCheckoutUrl("https://checkout.chariow.com/pay/123")).toBe(true);
    expect(safeCheckoutUrl("https://boutique.mychariow.com/checkout/sal_1")).toBe(true);
    expect(safeCheckoutUrl("http://checkout.chariow.com/pay")).toBe(false);
    expect(safeCheckoutUrl("https://chariow.com.evil.example/pay")).toBe(false);
    expect(safeCheckoutUrl("javascript:alert(1)")).toBe(false);
  });
});

// ---------------------------------------------------------------- route du webhook (T33, T35, T36, T46)

const inbox: { delivery_id: string | null; body_sha256: string; status: string }[] = [];
let failInsert = false;
const handlePulse = vi.fn(async () => "processed" as const);

vi.mock("@/lib/billing/purchase", () => ({ handlePulse: (...a: unknown[]) => handlePulse(...(a as [])) }));
vi.mock("next/server", async (orig) => {
  const mod = (await orig()) as Record<string, unknown>;
  return { ...mod, after: (fn: () => Promise<void>) => void fn() };
});
vi.mock("@/lib/supabase/admin", () => {
  const table = (name: string) => {
    const q: Record<string, unknown> = {};
    let pending: Record<string, unknown> | null = null;
    q.insert = (row: Record<string, unknown>) => {
      pending = row;
      return q;
    };
    q.update = () => q;
    q.eq = () => q;
    q.select = () => q;
    q.maybeSingle = async () => ({ data: inbox.find((r) => r.delivery_id) ?? null });
    q.single = async () => {
      if (name !== "webhook_inbox" || !pending) return { data: { id: "x" }, error: null };
      if (failInsert) return { data: null, error: { code: "08006" } };
      const row = pending as { delivery_id: string | null; body_sha256: string; status: string };
      if (row.delivery_id && inbox.some((r) => r.delivery_id === row.delivery_id)) return { data: null, error: { code: "23505" } };
      inbox.push(row);
      return { data: { id: String(inbox.length) }, error: null };
    };
    q.then = (res: (v: unknown) => void) => res({ data: null, error: null });
    return q;
  };
  return { adminClient: () => ({ from: table }), isAdminConfigured: () => true };
});

describe("webhook Chariow", () => {
  const body = Buffer.from('{"event":"successful.sale","sale":{"id":"sal_9","custom_metadata":{"order_ref":"lmp_bbbbbbbbbbbbbbbbbbbbbbbb"}}}');
  const post = async (headers: Record<string, string>, b = body) => {
    const { POST } = await import("@/app/api/webhooks/chariow/route");
    const { NextRequest } = await import("next/server");
    return POST(new NextRequest("https://limpid.test/api/webhooks/chariow", { method: "POST", body: b, headers }));
  };
  beforeEach(() => {
    process.env.CHARIOW_API_KEY = "sk_test";
    process.env.CHARIOW_PULSE_SECRET = SECRET;
    inbox.length = 0;
    failInsert = false;
    handlePulse.mockClear();
  });
  afterEach(() => {
    delete process.env.CHARIOW_API_KEY;
    delete process.env.CHARIOW_PULSE_SECRET;
  });

  it("signature invalide : 401, rien n'est enregistré ni traité", async () => {
    const res = await post({ "x-chariow-signature": sign(body, "faux"), "x-pulse-delivery-id": "dlv_1" });
    expect(res.status).toBe(401);
    expect(inbox).toHaveLength(0);
    expect(handlePulse).not.toHaveBeenCalled();
  });
  it("dix livraisons identiques : une seule entrée et un seul traitement", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await post({ "x-chariow-signature": sign(body), "x-pulse-delivery-id": "dlv_2" });
      expect(res.status).toBe(200);
    }
    expect(inbox).toHaveLength(1);
    expect(handlePulse).toHaveBeenCalledTimes(1);
    expect(handlePulse).toHaveBeenCalledWith("successful.sale", "sal_9", "lmp_bbbbbbbbbbbbbbbbbbbbbbbb");
  });
  it("test signé du tableau de bord (sans identifiant de livraison) : enregistré, jamais attribué", async () => {
    const res = await post({ "x-chariow-signature": sign(body) });
    expect(res.status).toBe(200);
    expect(inbox[0]).toMatchObject({ delivery_id: null, status: "ignored" });
    expect(handlePulse).not.toHaveBeenCalled();
  });
  it("base indisponible : pas d'accusé de réception (Chariow réessaiera)", async () => {
    failInsert = true;
    const res = await post({ "x-chariow-signature": sign(body), "x-pulse-delivery-id": "dlv_3" });
    expect(res.status).toBe(500);
    expect(handlePulse).not.toHaveBeenCalled();
  });
});
