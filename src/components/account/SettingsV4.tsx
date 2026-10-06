"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { DISPLAY_COOKIES, TEXT_SIZES, setDisplayPref, type DisplayPrefs, type Mode, type TextSize } from "@/lib/display/prefs";
import { LANGS, type Lang } from "@/lib/i18n";
import { saveLang, useLang, useT } from "@/lib/i18n/client";

function Row({ icon, label, sub, children, htmlFor }: { icon: IconName; label: string; sub?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="set-row">
      <span className="set-icon" aria-hidden="true"><Icon name={icon} size={20} /></span>
      <span className="set-text">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        {sub && <small>{sub}</small>}
      </span>
      <span className="set-control">{children}</span>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </span>
  );
}

/** Apparence : thème (Appareil / Clair / Sombre), contraste, animations. Effet immédiat, sur cet appareil. */
export function AppearanceSettings({ initial }: { initial: DisplayPrefs }) {
  const t = useT();
  const c = t.compte;
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [motion, setMotion] = useState(initial.reduceMotion);
  const [contrast, setContrast] = useState(initial.highContrast);
  return (
    <div className="set-list">
      <Row icon="sun" label={t.v4.settings.theme}>
        <span className="segmented" role="radiogroup" aria-label={t.v4.settings.theme}>
          {(["system", "light", "dark"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => {
                setMode(m);
                setDisplayPref(DISPLAY_COOKIES.mode, m === "system" ? null : m, "data-mode", m === "system" ? null : m);
              }}
            >
              {c.modes[m]}
            </button>
          ))}
        </span>
      </Row>
      <Row icon="eye" label={c.contrast[0]} sub={c.contrast[1]}>
        <Switch
          label={c.contrast[0]}
          checked={contrast}
          onChange={(v) => {
            setContrast(v);
            setDisplayPref(DISPLAY_COOKIES.contrast, v ? "fort" : null, "data-contrast", v ? "fort" : null);
          }}
        />
      </Row>
      <Row icon="eye-off" label={c.motion[0]} sub={c.motion[1]}>
        <Switch
          label={c.motion[0]}
          checked={motion}
          onChange={(v) => {
            setMotion(v);
            setDisplayPref(DISPLAY_COOKIES.motion, v ? "reduit" : null, "data-motion", v ? "reduit" : null);
          }}
        />
      </Row>
    </div>
  );
}

/** Lecture : taille du texte du lecteur seulement (16 à 24 px) et langue de l'interface. */
export function ReadingSettings({ initial }: { initial: DisplayPrefs }) {
  const t = useT();
  const c = t.compte;
  const lang = useLang();
  const router = useRouter();
  const [text, setText] = useState<TextSize>(initial.text);
  const [value, setValue] = useState<Lang>(lang);
  const i = TEXT_SIZES.indexOf(text);
  function size(next: TextSize) {
    setText(next);
    setDisplayPref(DISPLAY_COOKIES.text, next === "standard" ? null : next, "data-text", next === "standard" ? null : next);
  }
  return (
    <div className="set-list">
      <Row icon="text-size" label={t.v4.settings.readerSize} sub={t.v4.settings.readerSizeNote}>
        <span className="stepper" role="group" aria-label={t.v4.settings.readerSize}>
          <button type="button" aria-label={c.smaller} disabled={i <= 0} onClick={() => size(TEXT_SIZES[i - 1]!)}>A−</button>
          <span aria-live="polite" className="sr-only">{c.sizes[text]}</span>
          <span aria-hidden="true" className="stepper-value">{t.v4.settings.sizeShort[text]}</span>
          <button type="button" aria-label={c.larger} disabled={i >= TEXT_SIZES.length - 1} onClick={() => size(TEXT_SIZES[i + 1]!)}>A+</button>
        </span>
      </Row>
      <Row icon="globe" label={c.interfaceLanguage} htmlFor="set-lang">
        <select
          id="set-lang"
          className="set-select"
          value={value}
          onChange={(e) => {
            const l = e.target.value as Lang;
            setValue(l);
            saveLang(l);
            document.documentElement.lang = l;
            router.refresh();
          }}
        >
          {LANGS.map((l) => <option key={l} value={l} lang={l}>{c.languageNames[l]}</option>)}
        </select>
      </Row>
    </div>
  );
}
