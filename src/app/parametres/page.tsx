import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { LinkRow } from "@/components/LinkRow";
import { initials } from "@/lib/initials";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { AppearanceSettings, ReadingSettings } from "@/components/account/SettingsV4";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { readDisplayPrefs } from "@/lib/display/prefs";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.nav.settings };
}

/**
 * Paramètres (V4, § 9) : profil, puis Apparence (thème, contraste, animations), Lecture (taille
 * du texte du lecteur, langue) et Application (tutoriel, à propos, installation, données). Les
 * préférences pédagogiques se revoient depuis Profil > Mon apprentissage.
 */
export default async function SettingsPage() {
  const t = await getT();
  const user = await requireUser();
  const jar = await cookies();
  const display = readDisplayPrefs((n) => jar.get(n)?.value);
  const { data: profile } = isAdminConfigured() ? await adminClient().from("profiles").select("display_name").eq("id", user.id).maybeSingle() : { data: null };
  const name = (profile?.display_name as string | null) ?? null;
  const v = t.v4.settings;
  return (
    <Screen footer>
      <h1>{t.nav.settings}</h1>

      <ul className="rows settings-rows">
        <li>
          <Link href="/compte" className="row settings-profile">
            <span className="avatar" aria-hidden="true">{initials(name, user.email ?? "")}</span>
            <span className="row-text"><b>{name || t.profile.me}</b><small>{t.profile.profileRow} · {user.email}</small></span>
            <Icon name="chevron" className="row-chevron" />
          </Link>
        </li>
      </ul>

      <section id="apparence" aria-labelledby="set-look" className="settings-block">
        <h2 id="set-look" className="set-h">{v.appearance}</h2>
        <AppearanceSettings initial={display} />
      </section>

      <section id="confort" aria-labelledby="set-reading" className="settings-block">
        <h2 id="set-reading" className="set-h">{v.reading}</h2>
        <ReadingSettings initial={display} />
      </section>

      <section aria-labelledby="set-app" className="settings-block">
        <h2 id="set-app" className="set-h">{v.app}</h2>
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
