import { describe, expect, it } from "vitest";
import { en } from "./en";
import { fr } from "./fr";
import { dictFor, langFromAcceptLanguage } from "./index";

/** Chemins de toutes les feuilles d'un dictionnaire (chaînes, fonctions, éléments de tableaux). */
function leaves(o: unknown, path = ""): [string, unknown][] {
  if (typeof o === "string" || typeof o === "function") return [[path, o]];
  if (Array.isArray(o)) return o.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (o && typeof o === "object") return Object.entries(o).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [[path, o]];
}

describe("interface en anglais", () => {
  const frLeaves = new Map(leaves(fr));
  const enLeaves = new Map(leaves(en));

  it("couvre toutes les clés du français (et rien de plus, hors messages d'API)", () => {
    const missing = [...frLeaves.keys()].filter((k) => !enLeaves.has(k));
    const extra = [...enLeaves.keys()].filter((k) => !frLeaves.has(k) && !k.startsWith("apiErrors."));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it("ne contient pas de texte français oublié", () => {
    const suspicious = [...enLeaves].filter(([k, v]) => {
      if (k.startsWith("compte.languageNames") || k === "account.confirmLabel") return false;
      const text = typeof v === "function" ? String((v as (...a: unknown[]) => unknown)(1, 2, "x")) : String(v);
      return /[éèêàùç]|\b(le|la|les|des|une|vous|votre|pour|avec)\b/i.test(text);
    });
    expect(suspicious.map(([k]) => k)).toEqual([]);
  });

  it("accorde les pluriels", () => {
    expect(en.library.results(1, "eau")).toBe("1 result for “eau”");
    expect(en.library.results(3, "eau")).toBe("3 results for “eau”");
    expect(en.add.pages(2)).toBe("2 pages detected");
  });

  it("choisit la langue", () => {
    expect(dictFor("en").nav.home).toBe("Home");
    expect(dictFor("fr").nav.home).toBe("Accueil");
    expect(langFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(langFromAcceptLanguage("fr-FR,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(langFromAcceptLanguage(null)).toBe("fr");
  });
});
