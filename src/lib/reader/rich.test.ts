import { describe, expect, it } from "vitest";
import { parseRich, splitParagraph, stripRich } from "./rich";

describe("mise en forme légère", () => {
  it("reconnaît gras et italique", () => {
    expect(parseRich("La **chaleur** est un *transfert* d'énergie.")).toEqual([
      { text: "La " },
      { text: "chaleur", bold: true },
      { text: " est un " },
      { text: "transfert", italic: true },
      { text: " d'énergie." },
    ]);
  });

  it("laisse intacts les astérisques isolés et les marques non fermées", () => {
    expect(stripRich("5 * 3 = 15 et **non fermé")).toBe("5 * 3 = 15 et **non fermé");
  });

  it("ne produit jamais de HTML : le texte reste du texte", () => {
    expect(parseRich("**<img src=x onerror=alert(1)>**")).toEqual([{ text: "<img src=x onerror=alert(1)>", bold: true }]);
  });
});

describe("splitParagraph", () => {
  const s = (n: number) => `Phrase numéro ${n} qui raconte quelque chose d'assez long pour compter vraiment.`;
  it("laisse un paragraphe court intact", () => {
    expect(splitParagraph("Court.")).toEqual(["Court."]);
  });
  it("coupe aux fins de phrase sans rien perdre", () => {
    const text = [1, 2, 3, 4, 5, 6, 7, 8].map(s).join(" ");
    const parts = splitParagraph(text, 200);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join(" ")).toBe(text);
    for (const p of parts) expect(p.endsWith(".")).toBe(true);
  });
  it("ne coupe pas une mise en forme à cheval", () => {
    const text = `${s(1)} **${s(2)} ${s(3)} ${s(4)}** ${s(5)} ${s(6)}`;
    expect(splitParagraph(text, 120)).toEqual([text]);
  });
});
