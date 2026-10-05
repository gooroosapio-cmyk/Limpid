"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetPreferences } from "@/app/preferences/actions";
import { toast } from "@/components/shell/Toasts";
import { DISPLAY_COOKIES, setDisplayPref } from "@/lib/display/prefs";
import { LANGS, type Lang } from "@/lib/i18n";
import { saveLang, useLang, useT } from "@/lib/i18n/client";

/** Langue de l'interface (français ou anglais), appliquée immédiatement à tout l'écran. */
export function InterfaceLanguage() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const [value, setValue] = useState<Lang>(lang);
  return (
    <fieldset className="choices">
      <legend>{t.compte.interfaceLanguage}</legend>
      {LANGS.map((l) => (
        <label key={l} className="choice" lang={l}>
          <input
            type="radio"
            name="ui-lang"
            value={l}
            checked={value === l}
            onChange={() => {
              setValue(l);
              saveLang(l);
              document.documentElement.lang = l;
              router.refresh();
            }}
          />
          {t.compte.languageNames[l]}
        </label>
      ))}
    </fieldset>
  );
}

/** Réinitialise les préférences d'explication et le confort de lecture de cet appareil. */
export function ResetPreferences() {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-block"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(t.compte.resetConfirm)) return;
        start(async () => {
          const res = await resetPreferences().catch(() => ({ ok: false }));
          if (!res.ok) return toast(t.compte.failed, "error");
          setDisplayPref(DISPLAY_COOKIES.text, null, "data-text", null);
          setDisplayPref(DISPLAY_COOKIES.motion, null, "data-motion", null);
          setDisplayPref(DISPLAY_COOKIES.contrast, null, "data-contrast", null);
          setDisplayPref(DISPLAY_COOKIES.mode, null, "data-mode", null);
          toast(t.compte.resetDone);
          router.refresh();
        });
      }}
    >
      {t.compte.reset}
    </button>
  );
}
