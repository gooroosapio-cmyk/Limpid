import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Illustration } from "@/components/Illustration";
import { LinkRow } from "@/components/LinkRow";
import { LogoMark } from "@/components/Logo";
import { ProfileName } from "@/components/account/ProfileName";
import { Screen } from "@/components/shell/Screen";
import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/auth";
import { getLang, getT } from "@/lib/i18n/server";
import { getWallet } from "@/lib/billing/wallet";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.profile.title };
}

/**
 * Votre espace (maquette V2) : identité (initiales, nom affiché modifiable), offre et crédits,
 * préférences en lignes simples ; puis compte, sécurité et déconnexion.
 */
export default async function AccountPage() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const user = await requireUser();
  const email = user.email ?? "";
  const supabase = await createUserClient();
  const [admin, wallet, { data: prefs }, profile] = await Promise.all([
    isAdmin(user.id),
    isAdminConfigured() ? getWallet(user.id).catch(() => null) : Promise.resolve(null),
    supabase.from("reader_preferences").select("default_mode, density, minutes").maybeSingle(),
    isAdminConfigured() ? adminClient().from("profiles").select("display_name").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const p = t.profile;
  const r = t.compte.rows;
  const b = t.billing;
  const plan = wallet ? (wallet.mode === "topup" ? b.topupMode : b.plans[wallet.plan]) : null;
  const explain = [
    prefs?.default_mode ? (p.modeShort[prefs.default_mode as string] ?? null) : p.modeShort.claire,
    prefs?.minutes ? p.length(prefs.minutes as number) : p.lengthStandard,
  ].filter(Boolean).join(" · ");

  return (
    <Screen>
      <div className="page-title">
        <h1>{p.title}</h1>
      </div>
      <ProfileName name={(profile.data?.display_name as string | null) ?? null} email={email} sub={admin ? `${p.personal} · ${t.compte.admin}` : p.personal} />

      {wallet && plan && (
        <section className="offer-card" aria-labelledby="offer-h">
          <Illustration name="profil-offre" fallback="lumiere" className="offer-card-cover" />
          <span className="offer-emblem" aria-hidden="true"><LogoMark size={30} /></span>
          <p id="offer-h" className="offer-eyebrow">{plan}</p>
          <p className="offer-number">{wallet.available.toLocaleString(lang === "fr" ? "fr-FR" : "en-GB")}</p>
          <p className="offer-label">{p.creditsAvailable}</p>
          <div className="offer-links">
            <Link href="/compte/credits" className="offer-link">{t.v4.profile.history} <Icon name="arrow" /></Link>
            <Link href="/offres" className="offer-link">{t.v4.profile.offers} <Icon name="arrow" /></Link>
          </div>
        </section>
      )}

      <section aria-labelledby="prefs-h">
        <h2 id="prefs-h" className="profile-h">{t.v4.help.learning[0]}</h2>
        <ul className="rows settings-rows">
          <LinkRow href="/bienvenue?revoir=1" icon="learning" title={t.v4.profile.answers[0]} sub={t.v4.profile.answers[1]} />
          <LinkRow href="/parametres/preferences" icon="file" title={p.explanations} sub={explain} />
        </ul>
      </section>

      <section aria-labelledby="account-h">
        <h2 id="account-h" className="profile-h">{p.account}</h2>
        <ul className="rows settings-rows">
          <LinkRow href="/compte/appareils" icon="shield" title={t.devices.title} sub={t.devices.signOutOthers} />
          <LinkRow href="/compte/mot-de-passe" icon="key" title={r.password![0]} sub={r.password![1]} />
          <LinkRow href="/compte/donnees" icon="shield" title={p.privacy} />
          {admin && <LinkRow href="/admin" icon="shield" title={r.admin![0]} sub={r.admin![1]} />}
        </ul>
      </section>
      <form action="/auth/deconnexion" method="post" className="logout-form">
        <button type="submit" className="btn btn-block"><Icon name="logout" /> {t.compte.logout}</button>
      </form>
    </Screen>
  );
}
