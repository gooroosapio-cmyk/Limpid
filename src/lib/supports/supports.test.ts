import { describe, expect, it } from "vitest";
import { ACTION_PRICES } from "@/lib/billing/catalog";
import { assignColors, COLOR_KEYS } from "./colors";
import { buildBank, cardId, revealsAnswer, type FlashcardDraft } from "./flashcards";
import { buildMindMap, shortLabel, type MindMapDraft } from "./mindmap";
import { applyRating, endOfLocalDay, intervalFor, isDue, NEW_CARD, replay, requeue } from "./schedule";
import { modeForSupports, quoteSupports, readSupports, SUPPORTS, SupportSelection, supportsForMode } from "./supports";

describe("sélection des supports", () => {
  it("les 15 combinaisons non vides sont acceptées, la vide est refusée", () => {
    let ok = 0;
    for (let mask = 1; mask < 16; mask++) {
      const pick = SUPPORTS.filter((_, i) => mask & (1 << i));
      if (SupportSelection.safeParse(pick).success) ok++;
    }
    expect(ok).toBe(15);
    expect(SupportSelection.safeParse([]).success).toBe(false);
    expect(SupportSelection.safeParse(["atelier"]).success).toBe(false);
  });
  it("ordre canonique, doublons retirés", () => {
    expect(SupportSelection.parse(["flashcards", "livre", "flashcards"])).toEqual(["livre", "flashcards"]);
  });
  it("devis : une préparation commune, coût marginal par support dérivé", () => {
    const q = quoteSupports("report_standard", ["livre", "parcours", "carte", "flashcards"]);
    expect(q.base.credits).toBe(ACTION_PRICES.report_standard);
    expect(q.extras.map((e) => e.support)).toEqual(["carte", "flashcards"]);
    expect(q.total).toBe(ACTION_PRICES.report_standard + 2 * ACTION_PRICES.support_standard);
    // Livre et parcours : même texte, aucun supplément.
    expect(quoteSupports("report_short", ["livre", "parcours"]).total).toBe(ACTION_PRICES.report_short);
  });
  it("approche interne et compatibilité des anciens Limpid", () => {
    expect(modeForSupports(["parcours"])).toBe("parcours");
    expect(modeForSupports(["livre", "parcours"])).toBe("auto");
    expect(modeForSupports(["carte"])).toBe("auto");
    expect(supportsForMode("parcours")).toEqual(["parcours"]);
    expect(supportsForMode("atelier")).toEqual(["livre"]);
    expect(readSupports(null)).toEqual(["livre"]);
    expect(readSupports(["flashcards", "x"])).toEqual(["flashcards"]);
  });
});

describe("couleurs post-it", () => {
  it("équilibrées, stables, conservées d'une version à l'autre", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `c${i}`);
    const a = assignColors(ids, "seed");
    expect(assignColors(ids, "seed")).toEqual(a);
    const counts = COLOR_KEYS.map((c) => [...a.values()].filter((v) => v === c).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    const kept = assignColors(["c0", "new"], "autre", new Map([["c0", a.get("c0")!]]));
    expect(kept.get("c0")).toBe(a.get("c0"));
  });
});

const ctx = {
  chapters: [
    { id: "s1", visualIds: ["v1"] },
    { id: "s2", visualIds: [] },
  ],
  evidenceIds: new Set(["ev_1"]),
  visualText: new Map([["v1", "Schéma : l'évaporation au soleil"]]),
  terms: new Set(["évaporation"]),
};
const card = (o: Partial<FlashcardDraft["cards"][number]>): FlashcardDraft["cards"][number] => ({
  chapter_id: "s1",
  kind: "definition",
  question: "Comment appelle-t-on le passage de l'eau liquide à la vapeur ?",
  answer: "L'évaporation",
  explanation: null,
  concept_terms: ["Évaporation"],
  front_visual_id: null,
  back_visual_id: null,
  evidence_ids: ["ev_1", "ev_inconnue"],
  ...o,
});

describe("flashcards", () => {
  it("identifiant stable, références filtrées, doublons et chapitres inconnus écartés", () => {
    const { bank, issues } = buildBank(
      [{ cards: [card({}), card({ question: "Comment appelle-t-on le passage de l'eau liquide à la vapeur ?!" }), card({ chapter_id: "zz" })] }],
      ctx,
      "r1",
    );
    expect(bank.cards).toHaveLength(1);
    expect(bank.cards[0]!.id).toBe(cardId("s1", "Comment appelle-t-on le passage de l'eau liquide à la vapeur ?"));
    expect(bank.cards[0]!.id).toMatch(/^fc_[a-z0-9]{6,40}$/);
    expect(bank.cards[0]!.evidence_ids).toEqual(["ev_1"]);
    expect(bank.cards[0]!.concept_terms).toEqual(["Évaporation"]);
    expect(issues.dropped.map((d) => d.reason).sort()).toEqual(["chapitre inconnu", "doublon"]);
  });
  it("le recto ne révèle jamais la réponse (question, légende ou texte alternatif)", () => {
    expect(revealsAnswer("Qu'est-ce que l'évaporation ?", "évaporation")).toBe(true);
    const { bank, issues } = buildBank([{ cards: [card({ front_visual_id: "v1" }), card({ question: "Définissez l'évaporation", answer: "évaporation" })] }], ctx, "r1");
    expect(bank.cards[0]!.front_visual_id).toBeNull();
    expect(bank.cards[0]!.back_visual_id).toBe("v1");
    expect(issues.adjusted).toHaveLength(1);
    expect(issues.dropped.some((d) => d.reason === "réponse dans la question")).toBe(true);
  });
  it("une carte corrigée garde son identité et sa couleur, sa version augmente", () => {
    const first = buildBank([{ cards: [card({})] }], ctx, "r1").bank;
    const second = buildBank([{ cards: [card({ answer: "L'évaporation (vaporisation lente)" })] }], ctx, "autre-graine", first).bank;
    expect(second.cards[0]!.color).toBe(first.cards[0]!.color);
    expect(second.cards[0]!.version).toBe(2);
  });
});

describe("carte mentale", () => {
  const mctx = { title: "Le cycle de l'eau", chapters: [{ id: "s1", title: "Où va l'eau ?" }, { id: "s2", title: "Les nuages" }], evidenceIds: new Set(["ev_1"]), terms: new Set(["évaporation"]) };
  const draft: MindMapDraft = {
    chapters: [
      {
        chapter_id: "s1",
        label: null,
        nodes: [
          { key: "a", label: "Évaporation", parent_key: null, kind: "notion", concept_term: "Évaporation", detail: null, evidence_ids: ["ev_1"] },
          { key: "b", label: "Chaleur du Soleil", parent_key: "c", kind: "notion", concept_term: null, detail: null, evidence_ids: [] },
          { key: "c", label: "Énergie", parent_key: "b", kind: "groupe", concept_term: null, detail: null, evidence_ids: [] },
          { key: "d", label: "Un libellé beaucoup trop long pour tenir dans un nœud de carte mentale lisible", parent_key: "zz", kind: "notion", concept_term: null, detail: null, evidence_ids: [] },
        ],
        edges: [
          { from_key: "b", to_key: "a", relation: "cause", label: null, evidence_ids: ["ev_1"] },
          { from_key: "a", to_key: "absent", relation: "explique", label: null, evidence_ids: [] },
          { from_key: "b", to_key: "a", relation: "cause", label: null, evidence_ids: [] },
        ],
      },
    ],
  };
  it("racine et chapitres posés par le code, cycles parentaux rompus, liens contrôlés", () => {
    const { map, issues } = buildMindMap([draft], mctx, "r1");
    expect(map.nodes.filter((n) => n.kind === "chapitre").map((n) => n.id)).toEqual(["ch:s1", "ch:s2"]);
    const byId = new Map(map.nodes.map((n) => [n.id, n]));
    // Aucun cycle : chaque nœud remonte à la racine.
    for (const n of map.nodes) {
      let cur: string | null = n.id;
      const seen = new Set<string>();
      while (cur) {
        expect(seen.has(cur)).toBe(false);
        seen.add(cur);
        cur = byId.get(cur)!.parent_id;
      }
    }
    expect(map.edges).toHaveLength(1);
    expect(issues.dropped.some((d) => d.reason === "cycle parental rompu")).toBe(true);
    expect(byId.get("n:s1:d")!.parent_id).toBe("ch:s1");
    expect(byId.get("n:s1:d")!.label.length).toBeLessThanOrEqual(48);
    expect(byId.get("n:s1:d")!.detail).toContain("beaucoup trop long");
    // Couleur héritée de la branche.
    expect(byId.get("n:s1:a")!.color).toBe(byId.get("ch:s1")!.color);
  });
  it("libellé court à la frontière d'un mot", () => {
    expect(shortLabel("abc")).toBe("abc");
    expect(shortLabel("un deux trois quatre cinq six sept huit neuf dix onze", 20)).toBe("un deux trois…");
  });
});

describe("rappels", () => {
  const t0 = new Date("2026-10-13T10:00:00Z");
  it("Acquis : 1, 3, 7, 14, 30 jours puis doublement borné", () => {
    let s = NEW_CARD;
    const seen: number[] = [];
    for (let i = 0; i < 7; i++) {
      s = applyRating(s, "good", t0);
      seen.push(s.interval_days);
    }
    expect(seen).toEqual([1, 3, 7, 14, 30, 60, 120]);
    expect(intervalFor(30)).toBe(365);
  });
  it("Difficile ralentit, À revoir repart au lendemain", () => {
    const s = applyRating(applyRating(applyRating(NEW_CARD, "good", t0), "good", t0), "hard", t0);
    expect(s.interval_days).toBe(3);
    const r = applyRating(s, "again", t0);
    expect(r).toMatchObject({ step: 0, interval_days: 1, lapses: 1 });
    expect(r.next_review_at).toBe("2026-10-14T10:00:00.000Z");
  });
  it("une note corrigée équivaut au bon choix d'emblée", () => {
    const corrected = replay([{ rating: "good", occurred_at: t0.toISOString() }]);
    expect(corrected).toEqual(applyRating(NEW_CARD, "good", t0));
  });
  it("jour local de l'apprenant", () => {
    // Abidjan (UTC+0) et Paris (UTC+2, offset -120).
    expect(endOfLocalDay(t0, 0).toISOString()).toBe("2026-10-14T00:00:00.000Z");
    expect(endOfLocalDay(t0, -120).toISOString()).toBe("2026-10-13T22:00:00.000Z");
    expect(isDue({ next_review_at: "2026-10-13T21:00:00Z" }, t0, -120)).toBe(true);
    expect(isDue({ next_review_at: "2026-10-13T23:00:00Z" }, t0, -120)).toBe(false);
  });
  it("À revoir : quelques cartes plus loin, passages bornés, pas de boucle sans autre carte", () => {
    expect(requeue(["a", "b", "c", "d", "e"], 0, "a").queue).toEqual(["a", "b", "c", "d", "a", "e"]);
    expect(requeue(["a"], 0, "a").requeued).toBe(false);
    expect(requeue(["a", "b", "a", "c", "a", "d"], 4, "a").requeued).toBe(false);
  });
});
