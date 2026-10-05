import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutForm } from "@/components/billing/CheckoutForm";
import { CopyEmail } from "@/components/billing/CopyEmail";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { formatXof, product } from "@/lib/billing/catalog";
import { productIds } from "@/lib/billing/chariow";
import { nextSubscriptionStart } from "@/lib/billing/purchase";
import { getLang, getT } from "@/lib/i18n/server";
import { nowMs } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.billing.checkout.title };
}

/** Récapitulatif avant paiement (§ 13) : offre, durée, total, crédits, compte, règles. */
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ produit?: string }> }) {
  const [t, lang, user] = await Promise.all([getT(), getLang(), requireUser()]);
  const c = t.billing.checkout;
  const { produit } = await searchParams;
  const p = produit ? product(produit) : null;
  if (!p) {
    return (
      <Screen>
        <h1>{c.title}</h1>
        <p className="notice notice-warn">{c.unknownProduct}</p>
        <Link href="/offres" className="btn">{t.billing.seeOffers}</Link>
      </Screen>
    );
  }
  const day = (d: Date) => d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Abidjan" });
  const start = p.kind === "subscription" ? await nextSubscriptionStart(user.id) : null;
  const later = !!start && start.getTime() > nowMs() + 60_000;
  const configured = !!productIds()[p.code] && !!process.env.CHARIOW_API_KEY;
  const name = p.kind === "subscription" ? t.billing.planNames[p.plan]! : t.billing.offers.topupsTitle;
  const amount = formatXof(p.xof, lang);

  return (
    <Screen>
      <h1>{c.title}</h1>
      <dl className="card recap">
        <dt>{c.offer}</dt>
        <dd>{name}</dd>
        {p.kind === "subscription" && (
          <>
            <dt>{c.duration}</dt>
            <dd>{p.period === "yearly" ? c.twelveMonths : c.oneMonth}</dd>
          </>
        )}
        <dt>{c.allocation}</dt>
        <dd>{p.kind === "subscription" ? c.allocationMonthly(p.monthlyCredits) : c.allocationTopup(p.credits)}</dd>
        <dt>{c.account}</dt>
        <dd>{user.email && <CopyEmail email={user.email} label={c.copyEmail} done={c.copied} />}</dd>
        {p.kind === "subscription" && (
          <>
            <dt>{c.starts}</dt>
            <dd>{later && start ? c.startsAt(day(start)) : c.startsNow}</dd>
          </>
        )}
        <dt>{c.total}</dt>
        <dd className="recap-total">{amount}</dd>
      </dl>
      <p className="notice" role="note">{c.emailNotice}</p>
      <p className="muted small">{p.kind === "topup" ? c.topupNote : c.rules}</p>
      {!user.email_confirmed_at ? (
        <p className="notice notice-warn">{c.verifyFirst}</p>
      ) : configured ? (
        <CheckoutForm product={p.code} payLabel={c.pay(amount)} lang={lang} />
      ) : (
        <p className="notice notice-warn" role="status">{c.notConfigured}</p>
      )}
      <p><Link href="/offres" className="btn-link">{t.billing.seeOffers}</Link></p>
    </Screen>
  );
}
