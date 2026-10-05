"use client";

import { createContext, useContext } from "react";
import { dictFor, LANG_COOKIE, type Dict, type Lang } from "./index";

const Ctx = createContext<Lang>("fr");

/** Fournit la langue de l'interface aux composants client (fixée par la mise en page serveur). */
export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export function useLang(): Lang {
  return useContext(Ctx);
}

export function useT(): Dict {
  return dictFor(useContext(Ctx));
}

/** Enregistre le choix de langue (un an) ; la page est ensuite rechargée par l'appelant. */
export function saveLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; Max-Age=31536000; Path=/; SameSite=Lax; Secure`;
}
