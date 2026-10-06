import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { segmentText } from "@/lib/extract/text";
import type { GenerationInput } from "./pipeline";
import type { AIProvider, StructuredRequest } from "./provider";
import { capChapters, diagramContentOk, fragmentSegments, generateV5, memoryStore, mergeFragments, normalizePlanV5, prefixFragment, type FragmentCheckpoint, type PlanV5 } from "./v5";

const TEXT = `Le cycle

L'eau s'évapore sous l'effet du Soleil.  Elle forme ensuite des nuages.

Les océans contiennent environ 97 % de l’eau de la planète.`;

const comp = {
  evidence: [
    { id: "ev_1", segment_id: "seg_1", quote: "L'eau s'évapore sous l'effet du Soleil." },
    { id: "ev_2", segment_id: "seg_2", quote: "environ 97 % de l'eau de la planète" },
  ],
  concepts: [{ id: "cpt_1", label: "Évaporation", definition_claim_ids: ["clm_1"], importance: "central", prerequisite_ids: [] }],
  claims: [
    { id: "clm_1", statement: "L'eau s'évapore grâce au Soleil.", evidence_ids: ["ev_1"], qualifiers: [], numbers: [], support_status: "supported" },
    {
      id: "clm_2",
      statement: "Les océans contiennent environ 97 % de l'eau.",
      evidence_ids: ["ev_2"],
      qualifiers: ["environ"],
      numbers: [{ value: 97, unit: "%", scope: null, date: null, source_form: "97 %" }],
      support_status: "supported",
    },
  ],
  relations: [],
  contradictions: [],
  missing_information: [],
};

const visualNone = { kind: "none", subject: "", query_en: "", purpose: "", content: "" };
const plan = {
  title: "Le cycle de l'eau",
  key_points: ["L'eau s'évapore grâce au Soleil.", "Les océans contiennent presque toute l'eau."],
  chapters: [
    { title: "Pourquoi l'eau s'évapore-t-elle ?", objective: "Comprendre l'évaporation", claim_ids: ["clm_1"], difficulty: "standard", notions: ["évaporation"], visual: { kind: "vector", subject: "Une flaque au soleil", query_en: "puddle sun", purpose: "Rendre l'évaporation concrète" } },
    { title: "Où se trouve l'eau ?", objective: "Situer les réserves", claim_ids: ["clm_2"], difficulty: "difficile", notions: [], visual: visualNone },
  ],
  excluded: [],
  limitations: [],
};

const chapter1 = {
  question: "Pourquoi l'eau s'évapore-t-elle ?",
  takeaway: "Le Soleil chauffe l'eau, qui devient vapeur.",
  blocks: [
    { type: "fact", id: "blk_1", text: "L'eau s'évapore grâce au **Soleil**.", claim_ids: ["clm_1"], evidence_ids: ["ev_1"] },
    { type: "fictional_example", id: "blk_2", text: "Exemple pédagogique : une flaque disparaît après une journée ensoleillée.", claim_ids: [], evidence_ids: [], variants: [{ text: "Le linge sèche au soleil.", limit: null }] },
  ],
  retain: ["Le Soleil fournit l'énergie de l'évaporation."],
  notions: [{ term: "évaporation", definition: "Passage de l'eau liquide à la vapeur.", example: "Une flaque qui sèche.", claim_ids: ["clm_1"] }],
};
const chapter2 = {
  question: "Où se trouve l'eau ?",
  takeaway: "Presque toute l'eau est dans les océans.",
  blocks: [{ type: "fact", id: "blk_1", text: "Les océans contiennent environ 97 % de l'eau.", claim_ids: ["clm_2"], evidence_ids: ["ev_2"] }],
  retain: [],
  notions: [],
};
const enrich = {
  inserts: [{ after_block_id: "blk_1", block: { type: "analogy", id: "blk_9", text: "Comme une piscine immense face à un verre d'eau douce.", limit: "Les proportions ne sont qu'une image.", claim_ids: [], evidence_ids: [], variants: [] } }],
  retain: ["97 % de l'eau est dans les océans."],
  notions: [],
};

/** Fournisseur simulé qui répond selon l'étape ; enregistre étapes et niveaux de modèle. */
class StageProvider implements AIProvider {
  readonly name = "fake";
  readonly isDemo = false;
  calls: { stage: string; tier: string; data: string[] }[] = [];
  constructor(private readonly answers: Record<string, unknown[]>) {}
  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>) {
    this.calls.push({ stage: req.stage, tier: req.budget.tier, data: req.untrustedData.map((d) => d.label) });
    const queue = this.answers[req.stage];
    const next = queue && queue.length > 1 ? queue.shift() : queue?.[0];
    if (next === undefined) throw new Error(`aucune réponse pour ${req.stage}`);
    return { value: req.schema.parse(next) as z.infer<T>, usage: { provider: "fake", model: "m", inputTokens: 1, outputTokens: 1, durationMs: 1, requestId: null } };
  }
}

function input(over: Partial<GenerationInput> = {}): GenerationInput {
  return {
    sourceId: "src_t",
    segments: segmentText(TEXT, "src_t", { maxChars: 10_000 }).segments,
    level: "grand_public",
    goal: "comprendre",
    targetPages: 5,
    mode: "claire",
    preferences: { aids: [], minutes: null, density: null, example_domain: null, familiarity: null },
    signal: new AbortController().signal,
    budgets: {
      comprehension: { tier: "fast", maxInputTokens: 1, maxOutputTokens: 1, timeoutMs: 1 },
      explanation: { tier: "fast", maxInputTokens: 1, maxOutputTokens: 1, timeoutMs: 1 },
    },
    ...over,
  };
}

const far = () => ({ store: memoryStore(), deadline: Date.now() + 3_600_000 });

describe("moteur V5 : un chapitre par appel", () => {
  it("chapitres selon le plan, Pro seulement pour le chapitre difficile, puis enrichi par Flash", async () => {
    const p = new StageProvider({ comprehension: [comp], plan: [plan], chapitre_1: [chapter1], chapitre_2: [chapter2], chapitre_2_enrichi: [enrich] });
    const res = await generateV5(p, input(), far());
    expect(res.status).toBe("done");
    if (res.status !== "done") return;
    const ex = res.output.explanation;
    expect(ex.sections.map((s) => s.id)).toEqual(["sec_1", "sec_2"]);
    expect(ex.sections[0]!.blocks.map((b) => b.id)).toEqual(["blk_c1_1", "blk_c1_2"]);
    // L'analogie de Flash est insérée après le bloc éclairé du chapitre rédigé par Pro.
    expect(ex.sections[1]!.blocks.map((b) => b.type)).toEqual(["fact", "analogy"]);
    expect(ex.sections[1]!.difficult).toBe(true);
    expect(ex.sections[1]!.retain).toEqual(["97 % de l'eau est dans les océans."]);
    expect(ex.sections[0]!.notions?.[0]?.term).toBe("évaporation");
    expect(ex.glossary.map((g) => g.term)).toEqual(["évaporation"]);
    expect(ex.key_points).toHaveLength(2);
    expect(res.output.status).toBe("validated");
    const tier = (stage: string) => p.calls.find((c) => c.stage === stage)!.tier;
    expect(tier("plan")).toBe("fast");
    expect(tier("chapitre_1")).toBe("fast");
    expect(tier("chapitre_2")).toBe("complex");
    expect(tier("chapitre_2_enrichi")).toBe("fast");
    // Aucun graphique, flux ni dessin tracé par le code ; l'illustration prévue est gardée.
    expect(res.output.blueprint.visual_specs.map((v) => v.kind)).toEqual(["illustration"]);
  });

  it("un chapitre qui oublie une affirmation est réécrit seul", async () => {
    const thin = { ...chapter1, blocks: [chapter1.blocks[1]] };
    const both = { ...plan, chapters: [{ ...plan.chapters[0]!, claim_ids: ["clm_1", "clm_2"] }] };
    const full = { ...chapter1, blocks: [...chapter1.blocks, chapter2.blocks[0]!].map((b, i) => ({ ...b, id: `blk_${i + 1}` })) };
    const p = new StageProvider({ comprehension: [comp], plan: [both], chapitre_1: [thin, full] });
    const res = await generateV5(p, input(), far());
    expect(res.status).toBe("done");
    const calls = p.calls.filter((c) => c.stage === "chapitre_1");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.data).toContain("a corriger");
    if (res.status === "done") expect(res.output.explanation.sections[0]!.blocks.some((b) => b.claim_ids.includes("clm_2"))).toBe(true);
  });

  it("reprise : une invocation interrompue repart des étapes enregistrées", async () => {
    const store = memoryStore();
    const answers = { comprehension: [comp], plan: [plan], chapitre_1: [chapter1], chapitre_2: [chapter2], chapitre_2_enrichi: [enrich] };
    let clock = 0;
    const first = new StageProvider(answers);
    // Échéance déjà proche : lecture et plan faits, aucun chapitre lancé.
    const r1 = await generateV5(first, input(), { store, deadline: 100_000, now: () => clock, callReserveMs: 130_000 });
    expect(r1.status).toBe("paused");
    expect(first.calls.map((c) => c.stage)).toEqual(["comprehension"]);
    clock = 0;
    const second = new StageProvider(answers);
    const r2 = await generateV5(second, input(), { store, deadline: 1_000_000, now: () => clock });
    expect(r2.status).toBe("done");
    expect(second.calls.map((c) => c.stage)).not.toContain("comprehension");
    expect(second.calls.map((c) => c.stage)).toContain("plan");
  });
});

describe("moteur V5 : grandes sources", () => {
  it("découpe aux frontières de segments", () => {
    const segs = Array.from({ length: 5 }, (_, i) => ({ ...input().segments[0]!, id: `seg_${i + 1}`, text: "x".repeat(15_000) }));
    expect(fragmentSegments(segs, 40_000).map((f) => f.length)).toEqual([2, 2, 1]);
  });

  it("identifiants uniques par fragment et notions homonymes fusionnées", () => {
    const base = (n: number): FragmentCheckpoint => ({
      knowledge: {
        schema_version: "1.0.0",
        id: "ko_x",
        source_ids: ["src_t"],
        concepts: [{ id: "cpt_1", label: n === 1 ? "Évaporation" : "évaporation ", definition_claim_ids: ["clm_1"], importance: n === 1 ? "secondary" : "central", prerequisite_ids: [] }],
        claims: [{ id: "clm_1", statement: `Affirmation ${n}`, evidence_ids: ["ev_1"], qualifiers: [], numbers: [], support_status: "supported" }],
        relations: [],
        contradictions: [],
        missing_information: [],
        coverage: { segments_total: 1, segments_processed: 1, unreadable_locators: [], partial: false },
      },
      evidence: [{ id: "ev_1", segment_id: `seg_${n}`, start_offset: 0, end_offset: 5, quote: "abcde" }],
      validation: { object_id: "x", checks: [], blocking_errors: [], warnings: [], repair_count: 0 } as never,
    });
    const merged = mergeFragments([prefixFragment(base(1), 1), prefixFragment(base(2), 2)], input());
    expect(merged.knowledge.claims.map((c) => c.id)).toEqual(["clm_f1_1", "clm_f2_1"]);
    expect(merged.knowledge.claims[1]!.evidence_ids).toEqual(["ev_f2_1"]);
    expect(merged.evidence.map((e) => e.id)).toEqual(["ev_f1_1", "ev_f2_1"]);
    expect(merged.knowledge.concepts).toHaveLength(1);
    expect(merged.knowledge.concepts[0]).toMatchObject({ importance: "central", definition_claim_ids: ["clm_f1_1", "clm_f2_1"] });
  });
});

describe("moteur V5 : plan", () => {
  const ko = {
    schema_version: "1.0.0" as const,
    id: "ko_x",
    source_ids: ["src_t"],
    concepts: [],
    claims: ["clm_1", "clm_2", "clm_3", "clm_4"].map((id) => ({ id, statement: id, evidence_ids: [], qualifiers: [], numbers: [], support_status: "supported" as const })),
    relations: [],
    contradictions: [],
    missing_information: [],
    coverage: { segments_total: 1, segments_processed: 1, unreadable_locators: [], partial: false },
  };
  const ch = (claim_ids: string[], visual = visualNone) => ({ title: "T", objective: "O", claim_ids, difficulty: "standard" as const, notions: [], visual: visual as PlanV5["chapters"][number]["visual"] });

  it("chaque affirmation dans un seul chapitre, oubliées rattachées au plus proche", () => {
    const draft: PlanV5 = { title: "T", cover_query_en: "", key_points: ["a", "b"], chapters: [ch(["clm_1", "clm_9"]), ch(["clm_1", "clm_4"])], excluded: [], limitations: [] };
    const { plan: p, orphans } = normalizePlanV5(draft, ko, input());
    expect(orphans).toEqual(["clm_2", "clm_3"]);
    expect(p.chapters.map((c) => c.claim_ids)).toEqual([["clm_1", "clm_2", "clm_3"], ["clm_4"]]);
  });

  it("schéma : chiffres repris des affirmations du chapitre, sinon illustration simple", () => {
    expect(diagramContentOk("Hausse de 12,5 % puis 3 000 €", ["Les prix montent de 12.5 % ; coût 3 000 €."])).toBe(true);
    expect(diagramContentOk("Hausse de 40 %", ["Les prix montent de 12,5 %."])).toBe(false);
    expect(diagramContentOk("", ["x"])).toBe(false);
  });

  it("3 illustrations au plus, aucune en résumé fidèle ou en texte seul", () => {
    const v = { kind: "vector", subject: "s", query_en: "q", purpose: "p", content: "" };
    const draft: PlanV5 = { title: "T", cover_query_en: "", key_points: ["a", "b"], chapters: [ch(["clm_1"], v), ch(["clm_2"], v), ch(["clm_3"], v), ch(["clm_4"], v)], excluded: [], limitations: [] };
    expect(normalizePlanV5(draft, ko, input()).plan.chapters.filter((c) => c.visual.kind !== "none")).toHaveLength(3);
    expect(normalizePlanV5(draft, ko, input({ mode: "resume" })).plan.chapters.filter((c) => c.visual.kind !== "none")).toHaveLength(0);
    expect(normalizePlanV5(draft, ko, input({ visualMode: "aucun" })).plan.chapters.filter((c) => c.visual.kind !== "none")).toHaveLength(0);
  });
});

describe("moteur V5 : 15 chapitres au plus", () => {
  it("réunit les chapitres voisins les plus légers, sans perdre d'affirmation", () => {
    const none = { kind: "none" as const, subject: "", query_en: "", purpose: "", content: "" };
    const chapters = Array.from({ length: 20 }, (_, i) => ({ title: `C${i}`, objective: `O${i}`, claim_ids: Array.from({ length: i % 3 === 0 ? 1 : 4 }, (_, k) => `clm_${i}_${k}`), difficulty: (i === 5 ? "difficile" : "standard") as "standard" | "difficile", notions: [], visual: none }));
    const out = capChapters(chapters);
    expect(out).toHaveLength(15);
    expect(out.flatMap((c) => c.claim_ids)).toEqual(chapters.flatMap((c) => c.claim_ids));
    expect(out.some((c) => c.difficulty === "difficile")).toBe(true);
    expect(capChapters(chapters.slice(0, 4))).toHaveLength(4);
  });
});
