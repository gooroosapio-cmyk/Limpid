/**
 * Langues de l'interface (V4) : français et anglais. Les dictionnaires ont la même forme ;
 * l'anglais est vérifié par le compilateur (aucune clé manquante).
 */
import { en } from "./en";
import { fr } from "./fr";

export const LANGS = ["fr", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_COOKIE = "limpid-lang";

type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : { readonly [K in keyof T]: Widen<T[K]> };

export type Dict = Widen<typeof fr>;

export function dictFor(lang: Lang): Dict {
  return lang === "en" ? en : fr;
}

export function isLang(v: unknown): v is Lang {
  return v === "fr" || v === "en";
}

/** Langue préférée du navigateur (première visite, sans choix enregistré). */
export function langFromAcceptLanguage(header: string | null | undefined): Lang {
  const first = (header ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("en") ? "en" : "fr";
}
