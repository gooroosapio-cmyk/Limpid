/**
 * Préférences d'affichage de l'appareil (sans IA, sans base) : galerie sombre (défaut) ou papier,
 * taille du texte, animations réduites, contraste renforcé. Stockées en cookies pour un rendu
 * serveur sans clignotement.
 */
export const DISPLAY_COOKIES = { mode: "limpid-mode", text: "limpid-text", motion: "limpid-motion", contrast: "limpid-contrast" } as const;

/** « dark » : galerie sombre (défaut, V2) ; « light » : option Papier. */
export const MODES = ["dark", "light"] as const;
export type Mode = (typeof MODES)[number];
export const TEXT_SIZES = ["petit", "standard", "grand", "tres-grand"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export interface DisplayPrefs {
  mode: Mode;
  text: TextSize;
  reduceMotion: boolean;
  highContrast: boolean;
}

export function readDisplayPrefs(get: (name: string) => string | undefined): DisplayPrefs {
  const mode = get(DISPLAY_COOKIES.mode);
  const text = get(DISPLAY_COOKIES.text);
  return {
    mode: (MODES as readonly string[]).includes(mode ?? "") ? (mode as Mode) : "dark",
    text: (TEXT_SIZES as readonly string[]).includes(text ?? "") ? (text as TextSize) : "standard",
    reduceMotion: get(DISPLAY_COOKIES.motion) === "reduit",
    highContrast: get(DISPLAY_COOKIES.contrast) === "fort",
  };
}

/** Attributs posés sur <html> (lus par les feuilles de style). */
export function htmlAttributes(p: DisplayPrefs): Record<string, string | undefined> {
  return {
    "data-mode": p.mode === "light" ? "light" : undefined,
    "data-text": p.text === "standard" ? undefined : p.text,
    "data-motion": p.reduceMotion ? "reduit" : undefined,
    "data-contrast": p.highContrast ? "fort" : undefined,
  };
}

/** Écrit une préférence côté client (un an) et l'applique immédiatement. */
export function setDisplayPref(cookie: string, value: string | null, attr: string, attrValue: string | null) {
  document.cookie = value === null ? `${cookie}=; Max-Age=0; Path=/; SameSite=Lax` : `${cookie}=${value}; Max-Age=31536000; Path=/; SameSite=Lax; Secure`;
  if (attrValue === null) document.documentElement.removeAttribute(attr);
  else document.documentElement.setAttribute(attr, attrValue);
}
