import { createHash } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { chariowConfigured, parsePulse, pulseSecrets, verifySignature } from "@/lib/billing/chariow";
import { handlePulse, reconcilePending } from "@/lib/billing/purchase";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";

export const maxDuration = 60;
const MAX_BODY = 256 * 1024;

/**
 * Pulse Chariow (§ 15) : signature vérifiée sur le corps brut, livraison persistée AVANT
 * l'accusé de réception, puis traitement (relecture de la vente et attribution unique).
 * Aucune donnée client n'est conservée : seulement l'événement, la vente et la référence.
 */
export async function POST(request: NextRequest) {
  if (!chariowConfigured() || !isAdminConfigured()) return NextResponse.json({ error: "non_configure" }, { status: 503 });
  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length === 0 || raw.length > MAX_BODY) return NextResponse.json({ error: "taille" }, { status: 413 });
  if (!verifySignature(raw, request.headers.get("x-chariow-signature"), pulseSecrets())) {
    return NextResponse.json({ error: "signature" }, { status: 401 });
  }
  const pulse = parsePulse(raw.toString("utf8"));
  if (!pulse) return NextResponse.json({ error: "format" }, { status: 400 });

  const deliveryId = request.headers.get("x-pulse-delivery-id")?.slice(0, 200) || null;
  const sha = createHash("sha256").update(raw).digest("hex");
  const db = adminClient();
  // Un test du tableau de bord n'a pas d'identifiant de livraison : enregistré, jamais attribué.
  const isTest = !deliveryId;
  const { data: row, error } = await db
    .from("webhook_inbox")
    .insert({ delivery_id: deliveryId, event: pulse.event.slice(0, 60), sale_id: pulse.saleId, order_ref: pulse.orderRef, body_sha256: sha, is_test: isTest, status: isTest ? "ignored" : "received" })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      // Même livraison reçue à nouveau : déjà persistée. Corps différent : collision tracée.
      const { data: prev } = await db.from("webhook_inbox").select("body_sha256").eq("provider", "chariow").eq("delivery_id", deliveryId!).maybeSingle();
      if (prev && prev.body_sha256 !== sha) {
        await db.from("audit_log").insert({ action: "billing.delivery_collision", target_kind: "pulse", target_id: deliveryId });
      }
      return NextResponse.json({ status: "duplicate" });
    }
    // Rien n'est persisté : pas d'accusé de réception, Chariow réessaiera.
    console.error("webhook_inbox", error.code);
    return NextResponse.json({ error: "stockage" }, { status: 500 });
  }
  if (!isTest) {
    after(async () => {
      try {
        const outcome = await handlePulse(pulse.event, pulse.saleId, pulse.orderRef);
        await db.from("webhook_inbox").update({ status: outcome, processed_at: new Date().toISOString(), attempts: 1 }).eq("id", row.id);
      } catch (e) {
        // Rattrapé par le rapprochement périodique des commandes en attente.
        await db.from("webhook_inbox").update({ status: "failed", attempts: 1, last_error: (e as Error).name.slice(0, 100) }).eq("id", row.id);
      }
      // Chaque Pulse relance aussi le rapprochement : le cron Vercel ne passe qu'une fois par jour.
      await reconcilePending(10).catch((e) => console.error("reconcile", (e as Error).name));
    });
  }
  return NextResponse.json({ status: "received" });
}
