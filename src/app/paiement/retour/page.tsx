import type { Metadata } from "next";
import Link from "next/link";
import { ReturnWatcher } from "@/components/billing/ReturnWatcher";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { product } from "@/lib/billing/catalog";
import { intentByRef, reconcileIntent } from "@/lib/billing/purchase";
import { getWallet } from "@/lib/billing/wallet";
import { getLang, getT } from "@/lib/i18n/server";
import { adminClient } from "@/lib/supabase/admin";
import { nowMs } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.billing.ret.title };
}

/**
 * Retour de Chariow (§ 14) : l'état vient de la commande et de la vente relue côté serveur.
 * Ni un paramètre d'adresse ni le navigateur ne prouvent un paiement.
 */
export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<{ commande?: string }> }) {
  const [t, lang, user] = await Promise.all([getT(), getLang(), requireUser()]);
  const r = t.billing.ret;
  const { commande } = await searchParams;
  let intent = commande ? await intentByRef(user.id, commande) : null;
  if (!intent) {
    return (
      <Screen>
        <h1>{r.title}</h1>
        <p className="notice notice-warn">{r.notFound}</p>
        <Link href="/" className="btn">{r.backDocs}</Link>
      </Screen>
    );
  }
  if (intent.status !== "succeeded" && intent.sale_id) {
    try {
      await reconcileIntent(intent);
    } catch (e) {
      console.error("return reconcile", (e as Error).name);
    }
    intent = (await intentByRef(user.id, intent.order_ref)) ?? intent;
  }
  const p = product(intent.product_code);
  const pending = intent.status === "pending" || intent.status === "created" || intent.status === "uncertain";
  const wallet = intent.status === "succeeded" ? await getWallet(user.id) : null;
  let message = r.pending;
  if (intent.status === "succeeded" && p) {
    if (p.kind === "topup") message = r.succeededTopup(p.credits);
    else {
      const { data: sub } = await adminClient().from("subscriptions").select("starts_at").eq("sale_id", intent.sale_id ?? "").maybeSingle();
      const start = sub?.starts_at ? new Date(sub.starts_at as string) : null;
      message =
        start && start.getTime() > nowMs()
          ? r.succeededPlanLater(t.billing.planNames[p.plan]!, start.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", timeZone: "Africa/Abidjan" }))
          : r.succeededPlan(t.billing.planNames[p.plan]!);
    }
  } else if (intent.status === "failed") message = r.failed;
  else if (intent.status === "review") message = r.review(intent.order_ref);

  return (
    <Screen>
      <h1>{r.title}</h1>
      <div className={`card pay-state pay-${intent.status}`} role="status" aria-live="polite">
        <p className="big">{message}</p>
        {wallet && <p>{r.balance(wallet.available)}</p>}
        <p className="muted small">{r.reference(intent.order_ref)}</p>
      </div>
      <div className="actions-row">
        {pending && <Link href={`/paiement/retour?commande=${intent.order_ref}`} className="btn btn-primary">{r.checkAgain}</Link>}
        {intent.status === "failed" && <Link href="/offres" className="btn btn-primary">{r.retry}</Link>}
        <Link href="/" className="btn">{r.backDocs}</Link>
      </div>
      <ReturnWatcher pending={pending} />
    </Screen>
  );
}
