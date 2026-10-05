import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { LinkRow } from "@/components/LinkRow";
import { MotionRow } from "@/components/account/DisplaySettings";
import { Screen } from "@/components/shell/Screen";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { readDisplayPrefs } from "@/lib/display/prefs";
import { getLang, getT } from "@/lib/i18n/server";
import { getWallet } from "@/lib/billing/wallet";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";
import { Illustration } from "@/components/Illustration";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.nav.profile };
}

function initials(email: string): string {
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "?";
}

/**
 * Votre espace (V2, écran 06) : identité (initiales, jamais un avatar inventé), offre et
 * crédits, préférences en lignes simples, puis compte, sécurité et confidentialité.
 */
export default async function AccountPage() {
  const [t, lang, jar] = await Promise.all([getT(), getLang(), cookies()]);
  const user = await requireUser();
  const email = user.email ?? "";
  const display = readDisplayPrefs((n) => jar.get(n)?.value);
  const supabase = await createUserClient();
  const [admin, wallet, { data: prefs }] = await Promise.all([
    isAdmin(user.id),
    isAdminConfigured() ? getWallet(user.id).catch(() => null) : Promise.resolve(null),
    supabase.from("reader_preferences").select("default_mode").maybeSingle(),
  ]);
  const p = t.profile;
  const r = t.compte.rows;
  const b = t.billing;
  const plan = wallet ? (wallet.mode === "topup" ? b.topupMode : b.plans[wallet.plan]) : null;
  const day = (iso: string) => new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", timeZone: "Africa/Abidjan" });
  const explain = prefs?.default_mode ? (t.add.modes[prefs.default_mode as string]?.title ?? null) : null;

  return (
    <Screen>
      <div className="page-title">
        <h1>{p.title}</h1>
      </div>
      <div className="profile-id">
        <span className="avatar avatar-xl" aria-hidden="true">{initials(email)}</span>
        <div>
          <h2>{p.me}</h2>
          <p>{email}{admin ? ` · ${t.compte.admin}` : ""}</p>
        </div>
      </div>

      {wallet && plan && (
        <section className="offer-card" aria-labelledby="offer-h">
          <Illustration name="profil-offre" fallback="lumiere" className="offer-card-cover" />
          <p id="offer-h" className="offer-eyebrow">{plan}</p>
          <p className="offer-number">{wallet.available.toLocaleString(lang === "fr" ? "fr-FR" : "en-GB")}</p>
          <p className="offer-label">{p.creditsAvailable}</p>
          {wallet.reserved > 0 && <p className="offer-sub">{b.availableReserved(wallet.available, wallet.reserved)}</p>}
          {wallet.nextGrant && <p className="offer-sub">{b.wallet.nextGrant(wallet.nextGrant.credits, day(wallet.nextGrant.at))}</p>}
          <Link href="/offres" className="offer-link">{p.seeOffer} <Icon name="arrow" /></Link>
        </section>
      )}

      <section aria-labelledby="prefs-h">
        <h2 id="prefs-h" className="profile-h">{p.preferences}</h2>
        <ul className="rows settings-rows">
          <LinkRow href="/parametres/preferences" icon="file" title={p.explanations} sub={explain ?? p.explanationsSub} />
          <LinkRow href="/parametres#confort" icon="text-size" title={t.compte.comfort} sub={p.comfortSub} />
          <LinkRow href="/parametres#langue" icon="globe" title={p.language} sub={lang === "fr" ? "Français" : "English"} />
          <li><MotionRow initial={display.reduceMotion} /></li>
          <LinkRow href="/compte/donnees" icon="shield" title={p.privacy} sub={r.data![1]} />
        </ul>
      </section>

      <section aria-labelledby="account-h">
        <h2 id="account-h" className="profile-h">{p.account}</h2>
        <ul className="rows settings-rows">
          <LinkRow href="/compte/credits" icon="clock" title={r.usage![0]} sub={r.usage![1]} />
          <LinkRow href="/offres" icon="star" title={r.subscription![0]} sub={r.subscription![1]} />
          <LinkRow href="/compte/appareils" icon="shield" title={t.devices.title} sub={t.devices.signOutOthers} />
          <LinkRow href="/compte/mot-de-passe" icon="key" title={r.password![0]} sub={r.password![1]} />
          <LinkRow href="/compte/installer" icon="download" title={r.install![0]} sub={r.install![1]} />
          <LinkRow href="/parametres" icon="settings" title={r.settings![0]} sub={r.settings![1]} />
          {admin && <LinkRow href="/admin" icon="shield" title={r.admin![0]} sub={r.admin![1]} />}
        </ul>
      </section>
      <form action="/auth/deconnexion" method="post" className="logout-form">
        <button type="submit" className="btn btn-block"><Icon name="logout" /> {t.compte.logout}</button>
      </form>
    </Screen>
  );
}
