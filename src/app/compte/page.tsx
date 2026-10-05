import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { LinkRow } from "@/components/LinkRow";
import { Screen } from "@/components/shell/Screen";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { getLang, getT } from "@/lib/i18n/server";
import { getWallet } from "@/lib/billing/wallet";
import { isAdminConfigured } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.nav.profile };
}

function initials(email: string): string {
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "?";
}

/** Profil (kit V3, écran 29) : identité, utilisation réelle, abonnement, données et sécurité. */
export default async function AccountPage() {
  const t = await getT();
  const user = await requireUser();
  const email = user.email ?? "";
  const [admin, wallet, lang] = await Promise.all([
    isAdmin(user.id),
    isAdminConfigured() ? getWallet(user.id).catch(() => null) : Promise.resolve(null),
    getLang(),
  ]);
  const r = t.compte.rows;
  const b = t.billing;
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", timeZone: "Africa/Abidjan" });

  return (
    <Screen>
      <div className="stagger">
        <h1>{t.nav.profile}</h1>
        <div className="profile">
          <span className="avatar avatar-lg" aria-hidden="true">{initials(email)}</span>
          <div>
            <h2>{email}</h2>
            <p>{admin ? `${t.compte.profile} · ${t.compte.admin}` : t.compte.profile}</p>
          </div>
        </div>

        {wallet && (
          <section className="card usage-card" aria-labelledby="usage-h">
            <div className="head">
              <h2 id="usage-h" className="small">{b.wallet.title}</h2>
              <span className="chip">{wallet.mode === "topup" ? b.topupMode : b.plans[wallet.plan]}</span>
            </div>
            <p className="big">{b.available(wallet.available)}</p>
            {wallet.reserved > 0 && <p className="muted small">{b.availableReserved(wallet.available, wallet.reserved)}</p>}
            {wallet.nextGrant && <p className="muted small">{b.wallet.nextGrant(wallet.nextGrant.credits, day(wallet.nextGrant.at))}</p>}
            {wallet.weekly && <p className="muted small">{b.wallet.weekly(wallet.weekly.used, wallet.weekly.limit)}</p>}
            <div className="actions-row">
              <Link href="/compte/credits" className="btn">{b.wallet.title}</Link>
              {wallet.mode !== "subscription" && <Link href="/offres" className="btn btn-primary">{b.wallet.discover}</Link>}
            </div>
          </section>
        )}

        <ul className="rows">
          <LinkRow href="/parametres" icon="settings" title={r.settings![0]} sub={r.settings![1]} />
          <LinkRow href="/offres" icon="star" title={r.subscription![0]} sub={r.subscription![1]} />
          <LinkRow href="/compte/credits" icon="clock" title={r.usage![0]} sub={r.usage![1]} />
          <LinkRow href="/compte/donnees" icon="shield" title={r.data![0]} sub={r.data![1]} />
          <LinkRow href="/compte/installer" icon="download" title={r.install![0]} sub={r.install![1]} />
          <LinkRow href="/compte/mot-de-passe" icon="eye" title={r.password![0]} sub={r.password![1]} />
          {admin && <LinkRow href="/admin" icon="shield" title={r.admin![0]} sub={r.admin![1]} />}
        </ul>
        <form action="/auth/deconnexion" method="post" className="logout-form">
          <button type="submit" className="btn btn-block"><Icon name="logout" /> {t.compte.logout}</button>
        </form>
      </div>
    </Screen>
  );
}
