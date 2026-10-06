import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { LinkRow } from "@/components/LinkRow";
import { initials } from "@/lib/initials";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { ComfortSettings, ModeSettings } from "@/components/account/DisplaySettings";
import { InterfaceLanguage } from "@/components/account/InterfaceSettings";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { readDisplayPrefs } from "@/lib/display/prefs";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.nav.settings };
}

/** Paramètres (V5, § 9) : interface, une entrée « Préférences », confort de lecture, apparence, à propos. */
export default async function SettingsPage() {
  const t = await getT();
  const user = await requireUser();
  const jar = await cookies();
  const display = readDisplayPrefs((n) => jar.get(n)?.value);
  const { data: profile } = isAdminConfigured() ? await adminClient().from("profiles").select("display_name").eq("id", user.id).maybeSingle() : { data: null };
  const name = (profile?.display_name as string | null) ?? null;
  return (
    <Screen footer>
      <div className="page-title">
        <h1>{t.nav.settings}</h1>
        <p>{t.compte.prefsLede}</p>
      </div>

      <ul className="rows settings-rows">
        <li>
          <Link href="/compte" className="row settings-profile">
            <span className="avatar" aria-hidden="true">{initials(name, user.email ?? "")}</span>
            <span className="row-text"><b>{name || t.profile.me}</b><small>{t.profile.profileRow} · {user.email}</small></span>
            <Icon name="chevron" className="row-chevron" />
          </Link>
        </li>
      </ul>

      <section id="langue" aria-labelledby="set-ui" className="settings-block">
        <h2 id="set-ui" className="eyebrow">{t.compte.interfaceHeading}</h2>
        <InterfaceLanguage />
      </section>

      <ul className="rows settings-block">
        <LinkRow href="/parametres/preferences" icon="spark" title={t.compte.prefsEntry[0]} sub={t.compte.prefsEntry[1]} />
      </ul>

      <section id="confort" aria-labelledby="set-comfort" className="settings-block">
        <h2 id="set-comfort" className="eyebrow">{t.compte.comfort}</h2>
        <ComfortSettings initial={display} />
      </section>

      <section aria-labelledby="set-look" className="settings-block">
        <h2 id="set-look" className="eyebrow">{t.compte.appearanceHeading}</h2>
        <p className="muted small">{t.compte.appearanceLede}</p>
        <ModeSettings initial={display.mode} />
      </section>

      <section aria-labelledby="set-app" className="settings-block">
        <h2 id="set-app" className="eyebrow">{t.compte.aboutHeading}</h2>
        <ul className="rows">
          <LinkRow href="/bienvenue/tutoriel" icon="bulb" title={t.v4.help.tutorial[0]} sub={t.v4.help.tutorial[1]} />
          <LinkRow href="/a-propos" icon="info" title={t.compte.about[0]} sub={t.compte.about[1]} />
          <LinkRow href="/compte/installer" icon="download" title={t.compte.rows.install![0]} sub={t.compte.rows.install![1]} />
          <LinkRow href="/compte/donnees" icon="shield" title={t.compte.rows.data![0]} sub={t.compte.rows.data![1]} />
        </ul>
      </section>
    </Screen>
  );
}
