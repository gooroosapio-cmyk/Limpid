"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { DISPLAY_COOKIES, MODES, TEXT_SIZES, setDisplayPref, type DisplayPrefs, type Mode, type TextSize } from "@/lib/display/prefs";
import { fr } from "@/lib/i18n/fr";

/** Confort de lecture de l'appareil : taille du texte, animations, contraste. Sans IA, effet immédiat. */
export function ComfortSettings({ initial }: { initial: DisplayPrefs }) {
  const [text, setText] = useState<TextSize>(initial.text);
  const [motion, setMotion] = useState(initial.reduceMotion);
  const [contrast, setContrast] = useState(initial.highContrast);
  const i = TEXT_SIZES.indexOf(text);

  function size(next: TextSize) {
    setText(next);
    setDisplayPref(DISPLAY_COOKIES.text, next === "standard" ? null : next, "data-text", next === "standard" ? null : next);
  }

  return (
    <>
      <div className="sizes" role="group" aria-label={fr.compte.comfort}>
        <button type="button" aria-label={fr.compte.smaller} disabled={i <= 0} onClick={() => size(TEXT_SIZES[i - 1]!)}>A−</button>
        <span aria-live="polite">{fr.compte.sizes[text]}</span>
        <button type="button" aria-label={fr.compte.larger} disabled={i >= TEXT_SIZES.length - 1} onClick={() => size(TEXT_SIZES[i + 1]!)}>A+</button>
      </div>
      <label className="setting">
        <span><b>{fr.compte.motion[0]}</b><small>{fr.compte.motion[1]}</small></span>
        <span className="switch">
          <input
            type="checkbox"
            checked={motion}
            onChange={(e) => {
              setMotion(e.target.checked);
              setDisplayPref(DISPLAY_COOKIES.motion, e.target.checked ? "reduit" : null, "data-motion", e.target.checked ? "reduit" : null);
            }}
          />
          <i aria-hidden="true" />
        </span>
      </label>
      <label className="setting">
        <span><b>{fr.compte.contrast[0]}</b><small>{fr.compte.contrast[1]}</small></span>
        <span className="switch">
          <input
            type="checkbox"
            checked={contrast}
            onChange={(e) => {
              setContrast(e.target.checked);
              setDisplayPref(DISPLAY_COOKIES.contrast, e.target.checked ? "fort" : null, "data-contrast", e.target.checked ? "fort" : null);
            }}
          />
          <i aria-hidden="true" />
        </span>
      </label>
    </>
  );
}

const MODE_ICONS: Record<Mode, "sun" | "moon" | "settings"> = { light: "sun", dark: "moon", system: "settings" };

/** Mode clair / sombre / système (indépendant du thème du rapport). */
export function ModeSettings({ initial }: { initial: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const order: Mode[] = ["light", "dark", "system"];
  return (
    <fieldset className="modecards-field">
      <legend className="eyebrow">{fr.compte.mode}</legend>
      <div className="modecards">
        {order.filter((m) => (MODES as readonly string[]).includes(m)).map((m) => (
          <label key={m} className={`modecard modecard-${m}`}>
            <input
              type="radio"
              name="mode"
              value={m}
              checked={mode === m}
              onChange={() => {
                setMode(m);
                setDisplayPref(DISPLAY_COOKIES.mode, m === "system" ? null : m, "data-mode", m === "system" ? null : m);
              }}
            />
            <Icon name={MODE_ICONS[m]} />
            {fr.compte.modes[m]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
