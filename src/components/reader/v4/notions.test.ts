import { describe, expect, it } from "vitest";
import type { ExplanationObject } from "@/lib/contracts/schemas";
import { notionIndex } from "./Pieces";

const section = (id: string, notions: { term: string; definition: string }[]) => ({
  id,
  question: id,
  takeaway: "",
  blocks: [],
  notions: notions.map((n) => ({ ...n, example: null, claim_ids: [] })),
});

const exp = (sections: ReturnType<typeof section>[], glossary: { term: string; definition: string }[] = []) =>
  ({ sections, glossary }) as unknown as ExplanationObject;

describe("notions désambiguïsées (lecteur V3)", () => {
  it("un homonyme défini autrement dans un autre chapitre garde son propre sens", () => {
    const { notions, scopes } = notionIndex(
      exp([
        section("c1", [{ term: "Produits", definition: "Biens qui circulent dans la production." }]),
        section("c2", [{ term: "produits", definition: "Gains comptables de l'exercice." }]),
      ]),
      new Map(),
    );
    expect(notions.map((n) => n.key ?? n.term.toLowerCase())).toEqual(["produits", "produits~2"]);
    expect(scopes?.get("c1")?.get("produits")).toBe("produits");
    expect(scopes?.get("c2")?.get("produits")).toBe("produits~2");
  });

  it("une notion n'est interactive que dans son chapitre ; même définition = même sens", () => {
    const { notions, scopes } = notionIndex(
      exp([
        section("c1", [{ term: "Bilan", definition: "Photo du patrimoine." }]),
        section("c2", [{ term: "Bilan", definition: "Photo du patrimoine." }]),
        section("c3", []),
      ]),
      new Map(),
    );
    expect(notions).toHaveLength(1);
    expect(scopes?.get("c2")?.get("bilan")).toBe("bilan");
    expect(scopes?.get("c3")).toBeUndefined();
  });

  it("ancien rapport sans notions de chapitre : glossaire global", () => {
    const { notions, scopes } = notionIndex(exp([section("c1", [])], [{ term: "Actif", definition: "Ce que possède l'entreprise." }]), new Map());
    expect(scopes).toBeNull();
    expect(notions[0]?.term).toBe("Actif");
  });
});
