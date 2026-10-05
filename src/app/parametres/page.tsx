import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Icon } from "@/components/Icon";
import { LinkRow } from "@/components/LinkRow";
import { ComfortSettings, ModeSettings } from "@/components/account/DisplaySettings";
import { ReadingPrefs } from "@/components/account/ReadingPrefs";
import { ThemePicker } from "@/components/ThemePicker";
import { Screen } from "@/components/shell/Screen";
import { saveTheme } from "@/app/preferences/actions";
import { ThemeId } from "@/lib/contracts/schemas";
import { requireUser } from "@/lib/auth";
import { readDisplayPrefs } from "@/lib/display/prefs";
import { getT } from "@/lib/i18n/server";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.nav.settings };
}

/** Paramètres (kit V3, écrans 30 et 31 réunis) : explications, confort de lecture, apparence. */
export default async function SettingsPage() {
  const t = await getT();
  await requireUser();
  const supabase = await createUserClient();
  const [{ data: p }, jar] = await Promise.all([
    supabase.from("reader_preferences").select("familiarity, goal, example_domain, theme_id").maybeSingle(),
    cookies(),
  ]);
  const display = readDisplayPrefs((n) => jar.get(n)?.value);
  return (
    <Screen>
      <h1>{t.nav.settings}</h1>
      <p className="lede">{t.compte.prefsLede}</p>

      <section aria-labelledby="set-reading" className="settings-block">
        <h2 id="set-reading" className="eyebrow">{t.compte.rows.prefs![0]}</h2>
        <ul className="rows">
          <li className="row row-static">
            <span className="row-icon"><Icon name="chat" /></span>
            <span className="row-text"><b>{t.compte.language}</b><small>{t.compte.languageValue}</small></span>
          </li>
        </ul>
        <ReadingPrefs familiarity={p?.familiarity ?? null} goal={p?.goal ?? null} concrete={p?.example_domain === "quotidien"} />
      </section>

      <section aria-labelledby="set-comfort" className="settings-block">
        <h2 id="set-comfort" className="eyebrow">{t.compte.comfort}</h2>
        <ComfortSettings initial={display} />
      </section>

      <section aria-labelledby="set-look" className="settings-block">
        <h2 id="set-look" className="eyebrow">{t.compte.appearanceHeading}</h2>
        <p className="muted small">{t.compte.appearanceLede}</p>
        <ModeSettings initial={display.mode} />
        <ThemePicker
          initial={ThemeId.safeParse(p?.theme_id).data ?? null}
          target={{ preference: true }}
          onSave={saveTheme}
          legend={t.compte.defaultTheme}
        />
      </section>

      <div className="note">
        <b>{t.compte.referenceTitle}</b>
        <p>{t.compte.reference}</p>
      </div>

      <section aria-labelledby="set-app" className="settings-block">
        <h2 id="set-app" className="eyebrow">Application</h2>
        <ul className="rows">
          <LinkRow href="/compte/installer" icon="download" title={t.compte.rows.install![0]} sub={t.compte.rows.install![1]} />
          <LinkRow href="/compte/donnees" icon="shield" title={t.compte.rows.data![0]} sub={t.compte.rows.data![1]} />
        </ul>
      </section>
    </Screen>
  );
}
