import type { Metadata } from "next";
import Link from "next/link";
import { OffersGrid } from "@/components/billing/OffersGrid";
import { Screen } from "@/components/shell/Screen";
import { currentUser } from "@/lib/auth";
import { ACTION_PRICES, formatXof, PAID_PLANS, PLANS, reportsFor, TOPUPS, type PlanCode } from "@/lib/billing/catalog";
import { getWallet } from "@/lib/billing/wallet";
import { getLang, getT } from "@/lib/i18n/server";
import { isAdminConfigured } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.billing.offers.title };
}

/** Offres et recharges (§ 12) : lisible sans compte ; l'achat demande une connexion. */
export default async function OffersPage() {
  const [t, lang, user] = await Promise.all([getT(), getLang(), currentUser()]);
  const o = t.billing.offers;
  const wallet = user && isAdminConfigured() ? await getWallet(user.id).catch(() => null) : null;
  const scheduleFrom = wallet?.mode === "subscription" ? wallet.accessEndsAt : null;
  const all: PlanCode[] = ["free", ...PAID_PLANS];
  const c = o.compare;

  return (
    <Screen wide>
      <h1>{o.title}</h1>
      <p className="lede">{o.lede}</p>
      <OffersGrid lang={lang} current={wallet ? { plan: wallet.plan, mode: wallet.mode } : null} scheduleFrom={scheduleFrom} />
      <p className="muted">{o.note}</p>
      <p className="muted">{o.prepaid}</p>

      <section id="recharges" aria-labelledby="topups-h">
        <h2 id="topups-h">{o.topupsTitle}</h2>
        <p className="muted">{o.topupsLede}</p>
        <ul className="topups">
          {Object.values(TOPUPS).map((tp) => (
            <li key={tp.code} className="card topup">
              <p className="offer-credits">{t.billing.credits(tp.credits)}</p>
              <p className="muted small">{t.billing.reports(reportsFor(tp.credits))}</p>
              <Link href={`/offres/paiement?produit=${tp.code}`} className="btn btn-block">{o.buy(formatXof(tp.xof, lang))}</Link>
            </li>
          ))}
        </ul>
      </section>

      <details className="card compare">
        <summary><h2>{o.compareTitle}</h2></summary>
        <div className="table-scroll" role="region" aria-label={o.compareTitle} tabIndex={0}>
          <table>
            <thead>
              <tr><th scope="col"><span className="sr-only">{o.compareTitle}</span></th>{all.map((p) => <th key={p} scope="col">{t.billing.planNames[p]}</th>)}</tr>
            </thead>
            <tbody>
              <tr><th scope="row">{c.price}</th>{all.map((p) => <td key={p}>{formatXof(PLANS[p].monthlyXof, lang)}</td>)}</tr>
              <tr><th scope="row">{c.yearly}</th>{all.map((p) => <td key={p}>{p === "free" ? c.none : formatXof(PLANS[p].yearlyXof, lang)}</td>)}</tr>
              <tr><th scope="row">{c.credits}</th>{all.map((p) => <td key={p}>{PLANS[p].monthlyCredits.toLocaleString(lang)}</td>)}</tr>
              <tr><th scope="row">{c.reports}</th>{all.map((p) => <td key={p}>{reportsFor(PLANS[p].monthlyCredits)}</td>)}</tr>
              <tr><th scope="row">{c.weekly}</th>{all.map((p) => <td key={p}>{PLANS[p].limits.weeklyReports ?? c.noLimit}</td>)}</tr>
              <tr><th scope="row">{c.kept}</th>{all.map((p) => <td key={p}>{PLANS[p].limits.keptReports}</td>)}</tr>
              <tr><th scope="row">{c.sources}</th>{all.map((p) => <td key={p}>{PLANS[p].limits.sourcesPerReport}</td>)}</tr>
              <tr><th scope="row">{c.concurrent}</th>{all.map((p) => <td key={p}>{PLANS[p].limits.concurrentJobs}</td>)}</tr>
              <tr><th scope="row">{c.watermark}</th>{all.map((p) => <td key={p}>{PLANS[p].watermark ? c.yes : c.no}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <h3>{o.actionsTitle}</h3>
        <ul className="price-list">
          {(Object.keys(ACTION_PRICES) as (keyof typeof ACTION_PRICES)[]).map((a) => (
            <li key={a}><span>{o.actions[a]}</span><b>{t.billing.actionCost(ACTION_PRICES[a])}</b></li>
          ))}
          <li><span>{o.actions.free}</span><b>{o.freeAction}</b></li>
        </ul>
        <h3>{o.expiryTitle}</h3>
        <p>{o.expiry}</p>
      </details>

      <section aria-labelledby="faq-h">
        <h2 id="faq-h">{o.faqTitle}</h2>
        {o.faq.map(([q, a]) => (
          <details key={q} className="faq">
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
    </Screen>
  );
}
