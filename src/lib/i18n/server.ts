/** Langue et textes côté serveur (pages, routes) : cookie « limpid-lang », sinon le navigateur. */
import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { dictFor, isLang, LANG_COOKIE, langFromAcceptLanguage, type Dict, type Lang } from "./index";

export const getLang = cache(async (): Promise<Lang> => {
  const chosen = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(chosen)) return chosen;
  return langFromAcceptLanguage((await headers()).get("accept-language"));
});

export const getT = cache(async (): Promise<Dict> => dictFor(await getLang()));
