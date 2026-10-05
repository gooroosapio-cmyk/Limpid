import type { Metadata } from "next";
import Link from "next/link";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { formatXof } from "@/lib/billing/catalog";
import { getWallet } from "@/lib/billing/wallet";
import { getLang, getT } from "@/lib/i18n/server";
import { adminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.billing.wallet.title };
}

/** Mes crédits (§ 8, 11) : solde, lots et expirations, historique, achats. */
export default async function CreditsPage() {
  const [t, lang, user] = await Promise.all([getT(), getLang(), requireUser()]);
  const w = t.billing.wallet;
  const wallet = await getWallet(user.id);
  const db = adminClient();
  const [{ data: lots }, { data: history }, { data: orders }] = await Promise.all([
    db.from("credit_lots").select("id, origin, quantity, available, reserved, expires_at").eq("owner_id", user.id).gt("expires_at", new Date().toISOString()).order("expires_at"),
    db.from("credit_reservations").select("id, action, amount, status, created_at").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(30),
    db.from("payment_intents").select("order_ref, product_code, amount_xof, status, created_at").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(10),
  ]);
  const loc = lang === "fr" ? "fr-FR" : "en-GB";
  const day = (iso: string) => new Date(iso).toLocaleDateString(loc, { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Abidjan" });
  const when = (iso: string) => new Date(iso).toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" });
  const plan = wallet.mode === "topup" ? t.billing.topupMode : t.billing.plans[wallet.plan]!;

  return (
    <Screen>
      <h1>{w.title}</h1>
      <p className="lede">{w.lede}</p>
      <section className="card usage-card" aria-labelledby="bal-h">
        <div className="head">
          <h2 id="bal-h" className="small">{w.planLine(plan)}</h2>
          <span className="chip">{plan}</span>
        </div>
        <p className="big">{t.billing.available(wallet.available)}</p>
        {wallet.reserved > 0 && <p className="muted">{t.billing.availableReserved(wallet.available, wallet.reserved)}</p>}
        {wallet.mode === "topup" && <p>{w.topupMode}</p>}
        {wallet.accessEndsAt && wallet.mode === "subscription" && <p className="muted small">{w.accessEnds(day(wallet.accessEndsAt))}</p>}
        {wallet.nextGrant && <p className="muted small">{w.nextGrant(wallet.nextGrant.credits, day(wallet.nextGrant.at))}</p>}
        {wallet.quotas && (
          <ul className="quota-list">
            <li>
              {w.today(wallet.quotas.day.used, wallet.quotas.day.limit)}
              {wallet.quotas.day.used >= wallet.quotas.day.limit ? ` · ${w.resetAt(when(wallet.quotas.day.resetAt))}` : ""}
            </li>
            <li>
              {w.thisWeek(wallet.quotas.week.used, wallet.quotas.week.limit)}
              {wallet.quotas.week.used >= wallet.quotas.week.limit ? ` · ${w.resetAt(when(wallet.quotas.week.resetAt))}` : ""}
            </li>
          </ul>
        )}
        {!user.email_confirmed_at && <p className="notice notice-warn">{w.verify}</p>}
        <p className="muted small">{w.monthlyNoCarry}</p>
        <div className="actions-row">
          <Link href="/offres" className="btn btn-primary">{w.discover}</Link>
          <Link href="/offres#recharges" className="btn">{t.billing.topup}</Link>
        </div>
      </section>

      <h2>{w.lots}</h2>
      <ul className="rows">
        {(lots ?? []).filter((l) => l.available + l.reserved > 0).map((l) => (
          <li key={l.id as string} className="row row-static">
            <span className="row-text">
              <b>{w.origins[l.origin as string] ?? (l.origin as string)}</b>
              <small>{w.lotLine(l.available as number, l.quantity as number)} · {w.expires(day(l.expires_at as string))}</small>
            </span>
          </li>
        ))}
      </ul>

      <h2>{w.history}</h2>
      {(history ?? []).length === 0 ? (
        <p className="muted">{w.noHistory}</p>
      ) : (
        <ul className="rows">
          {(history ?? []).map((h) => (
            <li key={h.id as string} className="row row-static">
              <span className="row-text">
                <b>{w.actionNames[h.action as string] ?? (h.action as string)} · {h.status === "released" ? "0" : `−${h.amount}`}</b>
                <small>{w.entry[h.status === "consumed" ? "consume" : h.status === "released" ? "release" : "reserve"]} · {when(h.created_at as string)}</small>
              </span>
            </li>
          ))}
        </ul>
      )}

      {(orders ?? []).length > 0 && (
        <>
          <h2>{w.orders}</h2>
          <ul className="rows">
            {(orders ?? []).map((o) => (
              <li key={o.order_ref as string}>
                <Link href={`/paiement/retour?commande=${o.order_ref}`} className="row">
                  <span className="row-text">
                    <b>{formatXof(o.amount_xof as number, lang)} · {w.orderStatus[o.status as string]}</b>
                    <small>{o.product_code as string} · {when(o.created_at as string)}</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Screen>
  );
}
