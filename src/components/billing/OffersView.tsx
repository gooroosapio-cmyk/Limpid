"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { formatXof, PLANS, type Period, type PlanCode } from "@/lib/billing/catalog";
import { OffersGrid } from "./OffersGrid";

/**
 * Haut de la page Offres (maquette 07) : période Mensuel / Annuel, carte « Votre offre »,
 * carte « Pour aller plus loin » et accès « J'ai une clé d'accès ». La période choisie
 * s'applique aussi au détail des offres plus bas.
 */
export function OffersView({
  lang,
  current,
  scheduleFrom,
  keyHref,
  currentArt,
  furtherArt,
}: {
  lang: "fr" | "en";
  current: { plan: PlanCode; mode: "free" | "topup" | "subscription"; period: Period | null } | null;
  scheduleFrom: string | null;
  keyHref: string;
  currentArt: React.ReactNode;
  furtherArt: React.ReactNode;
}) {
  const t = useT();
  const o = t.billing.offers;
  const v = o.v2;
  const [period, setPeriod] = useState<Period>(current?.period ?? "monthly");
  const plan = current ? PLANS[current.plan] : null;
  const price = plan ? (period === "yearly" ? plan.yearlyXof : plan.monthlyXof) : 0;
  const amount = formatXof(price, lang).replace(/\s?FCFA$/, "");

  return (
    <>
      <div className="seg period-pill" role="radiogroup" aria-label={`${o.monthly} / ${o.yearly}`}>
        {(["monthly", "yearly"] as const).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={period === p} className={period === p ? "on" : ""} onClick={() => setPeriod(p)}>
            {p === "monthly" ? o.monthly : o.yearly}
          </button>
        ))}
      </div>
      {period === "yearly" && <p className="muted small period-note">{o.twoMonths}</p>}

      {current && plan && (
        <section className="plan-current" aria-labelledby="plan-current-h">
          {currentArt}
          <p className="plan-eyebrow">{o.yourPlan}</p>
          <h2 id="plan-current-h">{current.mode === "topup" ? t.billing.topupMode : t.billing.planNames[current.plan]}</h2>
          <p className="plan-price"><span>{amount}</span> FCFA</p>
          <p className="plan-credits">{o.creditsPerMonth(plan.monthlyCredits)}</p>
          <p className="plan-tag"><Icon name="book" /> {o.taglinesShort[current.plan]}</p>
        </section>
      )}

      <section className="plan-further" aria-labelledby="plan-further-h">
        {furtherArt}
        <p className="plan-eyebrow plan-eyebrow-yellow">{v.furtherEyebrow}</p>
        <h2 id="plan-further-h">{v.furtherTitle}</h2>
        <ul className="plan-checks">
          {v.furtherPoints.map((p) => <li key={p}>{p}</li>)}
        </ul>
        <a href="#details" className="btn btn-primary plan-cta">{v.seeDetails} <Icon name="arrow" /></a>
      </section>

      <p className="plan-key">
        <Icon name="key" />
        <Link href={keyHref}>{v.accessKey}</Link>
      </p>

      <section id="details" aria-labelledby="details-h" className="plan-details">
        <h2 id="details-h">{v.detailsTitle}</h2>
        <OffersGrid lang={lang} current={current ? { plan: current.plan, mode: current.mode } : null} scheduleFrom={scheduleFrom} period={period} />
      </section>
    </>
  );
}
