"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { formatXof, PAID_PLANS, PLANS, reportsFor, type PaidPlan, type Period } from "@/lib/billing/catalog";

/**
 * Cartes des offres (§ 12) : sélecteur Mensuel / Annuel, prix total visible, crédits et
 * équivalent en rapports, bouton principal. Le gratuit reste visible (pas de carrousel).
 */
export function OffersGrid({
  lang,
  current,
  scheduleFrom,
}: {
  lang: "fr" | "en";
  /** Offre active (null : visiteur non connecté). */
  current: { plan: string; mode: "free" | "topup" | "subscription" } | null;
  /** Fin de l'accès payé en cours : un nouvel achat est programmé à cette date. */
  scheduleFrom: string | null;
}) {
  const t = useT();
  const o = t.billing.offers;
  const [period, setPeriod] = useState<Period>("monthly");
  const day = scheduleFrom
    ? new Date(scheduleFrom).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", timeZone: "Africa/Abidjan" })
    : null;

  return (
    <>
      <div className="period-switch" role="radiogroup" aria-label={`${o.monthly} / ${o.yearly}`}>
        {(["monthly", "yearly"] as const).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={period === p} className={period === p ? "on" : ""} onClick={() => setPeriod(p)}>
            {p === "monthly" ? o.monthly : o.yearly}
            {p === "yearly" && <span className="badge-soft">{o.twoMonths}</span>}
          </button>
        ))}
      </div>

      <ul className="offers">
        <li className="offer">
          <h2>{t.billing.planNames.free}</h2>
          <p className="muted">{o.taglines.free}</p>
          <p className="offer-price">0 FCFA</p>
          <p className="offer-credits">{o.creditsPerMonth(PLANS.free.monthlyCredits)}</p>
          <p className="muted small">{t.billing.reports(reportsFor(PLANS.free.monthlyCredits))}</p>
          <p className="muted small">{o.perDayWeek(PLANS.free.limits.dailyReports, PLANS.free.limits.weeklyReports)}</p>
          <ul className="offer-features">{o.features.free!.map((f) => <li key={f}>{f}</li>)}</ul>
          {current?.mode === "free" ? (
            <span className="btn btn-block" aria-disabled="true">{o.current}</span>
          ) : (
            <Link href="/" className="btn btn-block">{o.continueFree}</Link>
          )}
        </li>
        {PAID_PLANS.map((code: PaidPlan) => {
          const plan = PLANS[code];
          const price = period === "yearly" ? plan.yearlyXof : plan.monthlyXof;
          const name = t.billing.planNames[code]!;
          const isCurrent = current?.mode === "subscription" && current.plan === code;
          return (
            <li key={code} className={`offer${code === "plus" ? " featured" : ""}`}>
              {code === "plus" && <span className="offer-badge">{o.recommended}</span>}
              <h2>{name}</h2>
              <p className="muted">{o.taglines[code]}</p>
              <p className="offer-price">
                {formatXof(price, lang)}
                <span className="muted small">{period === "yearly" ? o.perYear : o.perMonth}</span>
              </p>
              {period === "yearly" && <p className="muted small">{o.yearlyEquiv(formatXof(Math.round(plan.yearlyXof / 12), lang))}</p>}
              <p className="offer-credits">{o.creditsPerMonth(plan.monthlyCredits)}</p>
              <p className="muted small">{t.billing.reports(reportsFor(plan.monthlyCredits))}</p>
              <p className="muted small">{o.perDayWeek(plan.limits.dailyReports, plan.limits.weeklyReports)}</p>
              <ul className="offer-features">{o.features[code]!.map((f) => <li key={f}>{f}</li>)}</ul>
              <Link href={`/offres/paiement?produit=${code}_${period}`} className={`btn btn-block${code === "plus" ? " btn-primary" : ""}`}>
                {day ? o.schedule(name, day) : isCurrent ? o.current : o.choose(name)}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
