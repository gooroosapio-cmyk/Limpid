import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ModeSettings } from "@/components/account/DisplaySettings";
import { ThemePicker } from "@/components/ThemePicker";
import { Screen } from "@/components/shell/Screen";
import { saveTheme } from "@/app/preferences/actions";
import { ThemeId } from "@/lib/contracts/schemas";
import { requireUser } from "@/lib/auth";
import { readDisplayPrefs } from "@/lib/display/prefs";
import { fr } from "@/lib/i18n/fr";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: fr.compte.appearanceHeading };

/** Apparence (kit V3, écran 31) : mode d'affichage et thème par défaut des nouveaux rapports. */
export default async function AppearancePage() {
  await requireUser();
  const supabase = await createUserClient();
  const [{ data: p }, jar] = await Promise.all([supabase.from("reader_preferences").select("theme_id").maybeSingle(), cookies()]);
  const display = readDisplayPrefs((n) => jar.get(n)?.value);
  return (
    <Screen title={fr.compte.appearanceHeading} back="/compte">
      <h1>{fr.compte.appearanceHeading}</h1>
      <p className="lede">{fr.compte.appearanceLede}</p>
      <ModeSettings initial={display.mode} />
      <ThemePicker
        initial={ThemeId.safeParse(p?.theme_id).data ?? null}
        target={{ preference: true }}
        onSave={saveTheme}
        legend={fr.compte.defaultTheme}
      />
    </Screen>
  );
}
