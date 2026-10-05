"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { reconcileIntent, type IntentRow } from "@/lib/billing/purchase";
import { claimStorePurchases } from "@/lib/billing/store";
import { adminClient } from "@/lib/supabase/admin";

/**
 * « J'ai déjà payé » : rattache les achats faits sur la boutique avec l'adresse confirmée du
 * compte et relit auprès de Chariow les commandes encore en attente. Rien n'est attribué sans
 * vente vérifiée ; un second clic ne donne rien de plus.
 */
export async function recoverPayments() {
  const user = await requireUser();
  let found = 0;
  try {
    found += await claimStorePurchases({ id: user.id, email: user.email ?? null, emailConfirmed: !!user.email_confirmed_at });
    const { data } = await adminClient()
      .from("payment_intents")
      .select("id, origin, owner_id, order_ref, product_code, amount_xof, status, provider_product_id, sale_id, checkout_url, created_at, fulfilled_at")
      .eq("owner_id", user.id)
      .in("status", ["pending", "uncertain"])
      .order("created_at", { ascending: false })
      .limit(5);
    for (const i of (data ?? []) as IntentRow[]) if ((await reconcileIntent(i)) === "succeeded") found++;
  } catch (e) {
    console.error("recover", (e as Error).message);
    redirect("/compte/credits?recuperation=erreur");
  }
  redirect(`/compte/credits?recuperation=${found > 0 ? "ok" : "rien"}`);
}
