import { describe, expect, it } from "vitest";
import { htmlAttributes, readDisplayPrefs } from "./prefs";
import { autoTheme, showsIllustrations } from "./themes";

describe("thèmes V3", () => {
  it("choisit le thème selon l'organisation du rapport", () => {
    expect(autoTheme("comprendre_processus")).toBe("guide");
    expect(autoTheme("comparer_options")).toBe("dossier");
    expect(autoTheme("expliquer_document")).toBe("dossier");
    expect(autoTheme("comprendre_sujet")).toBe("sciences");
    expect(autoTheme(undefined)).toBe("sciences");
  });

  it("le thème Dossier n'affiche pas d'illustrations décoratives", () => {
    expect(showsIllustrations("dossier")).toBe(false);
    expect(showsIllustrations("recit")).toBe(true);
  });
});

describe("préférences d'affichage", () => {
  it("ignore les valeurs inconnues et garde les défauts", () => {
    const p = readDisplayPrefs((n) => ({ "limpid-mode": "rose", "limpid-text": "geant" })[n]);
    expect(p).toEqual({ mode: "system", text: "standard", reduceMotion: false, highContrast: false });
    expect(htmlAttributes(p)).toEqual({ "data-mode": undefined, "data-text": undefined, "data-motion": undefined, "data-contrast": undefined });
  });

  it("traduit les cookies en attributs de <html>", () => {
    const p = readDisplayPrefs(
      (n) => ({ "limpid-mode": "light", "limpid-text": "grand", "limpid-motion": "reduit", "limpid-contrast": "fort" })[n],
    );
    expect(htmlAttributes(p)).toEqual({ "data-mode": "light", "data-text": "grand", "data-motion": "reduit", "data-contrast": "fort" });
    // Mode de l'appareil (défaut) : aucun attribut, les feuilles suivent prefers-color-scheme.
    expect(htmlAttributes({ ...p, mode: "system" })["data-mode"]).toBeUndefined();
  });
});
