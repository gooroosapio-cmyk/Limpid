"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";

/**
 * Crédits insuffisants (planche 03) : besoin, solde et différence calculés par le serveur.
 * Rien n'est lancé ni débité ; le document reste disponible pour reprendre après recharge.
 */
export function InsufficientCreditsState({ needed, available, topup = "/offres#recharges", kept = true }: { needed: number; available: number; topup?: string | null; kept?: boolean }) {
  const t = useT();
  const c = t.fluid.credits;
  const missing = Math.max(0, needed - available);
  return (
    <section className="fl-card fl-credits" role="alert" aria-labelledby="fl-credits-title">
      <div className="fl-credits-head">
        <span className="fl-coin" aria-hidden="true"><Icon name="coins" size={26} /></span>
        <div>
          <h2 id="fl-credits-title">{c.missing(missing)}</h2>
          <p className="muted">{kept ? c.kept : c.notStarted}</p>
        </div>
      </div>
      <dl className="fl-credit-rows">
        <div><dt>{c.cost}</dt><dd>{c.amount(needed)}</dd></div>
        <div><dt>{c.available}</dt><dd>{c.amount(available)}</dd></div>
      </dl>
      <div className="fl-actions">
        <Link href={topup ?? "/offres#recharges"} className="btn btn-primary btn-block">{c.get}</Link>
        <Link href="/bibliotheque" className="btn btn-block">{t.fluid.backToLibrary}</Link>
      </div>
      <p className="fl-info"><Icon name="info" size={18} /> <span>{c.noCharge}</span></p>
    </section>
  );
}
