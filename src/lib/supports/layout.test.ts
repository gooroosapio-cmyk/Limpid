import { describe, expect, it } from "vitest";
import { ancestorsOf, layoutTree, wrapLabel } from "./layout";
import { buildMindMap } from "./mindmap";

const { map } = buildMindMap(
  [{ chapters: [{ chapter_id: "s1", label: null, nodes: [
    { key: "a", label: "Évaporation", parent_key: null, kind: "notion", concept_term: null, detail: null, evidence_ids: [] },
    { key: "b", label: "Vapeur", parent_key: "a", kind: "notion", concept_term: null, detail: null, evidence_ids: [] },
  ], edges: [] }] }],
  { title: "Cours", chapters: [{ id: "s1", title: "Chapitre un" }, { id: "s2", title: "Chapitre deux" }], evidenceIds: new Set(), terms: new Set() },
  "x",
);

describe("disposition de la carte mentale", () => {
  it("libellés coupés en 3 lignes au plus", () => {
    expect(wrapLabel("Court")).toEqual(["Court"]);
    const lines = wrapLabel("Un libellé assez long pour tenir sur plusieurs lignes dans un nœud");
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines[lines.length - 1]!.endsWith("…")).toBe(true);
  });
  it("vue d'ensemble : chapitres visibles, groupes repliés avec leur nombre d'enfants", () => {
    const l = layoutTree(map, "root", new Set(["root"]));
    expect(l.nodes.map((p) => p.node.id)).toEqual(["root", "ch:s1", "ch:s2"]);
    expect(l.nodes.find((p) => p.node.id === "ch:s1")!.hidden).toBe(1);
    // Aucun chevauchement vertical entre nœuds d'une même colonne.
    const col = l.nodes.filter((p) => p.x > 0).sort((a, b) => a.y - b.y);
    for (let i = 1; i < col.length; i++) expect(col[i]!.y).toBeGreaterThanOrEqual(col[i - 1]!.y + col[i - 1]!.h);
  });
  it("vue d'un chapitre dépliée et ancêtres pour la recherche", () => {
    const l = layoutTree(map, "ch:s1", new Set(["ch:s1", "n:s1:a"]));
    expect(l.nodes.map((p) => p.node.id)).toEqual(["ch:s1", "n:s1:a", "n:s1:b"]);
    expect(l.links).toHaveLength(2);
    expect(ancestorsOf(map, "n:s1:b")).toEqual(["n:s1:a", "ch:s1", "root"]);
  });
});
