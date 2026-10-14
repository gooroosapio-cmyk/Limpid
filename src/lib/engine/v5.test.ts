import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { segmentText } from "@/lib/extract/text";
import { riskyClaim, type GenerationInput } from "./pipeline";
import { ProviderError, type AIProvider, type StructuredRequest } from "./provider";
import { capChapters, isHeading, sanitizeComplement, diagramContentOk, unsourcedComponents, fragmentSegments, generateV5, memoryStore, mergeFragments, normalizePlanV5, prefixFragment, type FragmentCheckpoint, type PlanV5 } from "./v5";

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
  calls: { stage: string; tier: string; reasoning?: string; data: string[] }[] = [];
  constructor(private readonly answers: Record<string, unknown[]>) {}
  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>) {
    this.calls.push({ stage: req.stage, tier: req.budget.tier, reasoning: req.budget.reasoning, data: req.untrustedData.map((d) => d.label) });
    const queue = this.answers[req.stage];
    const next = queue && queue.length > 1 ? queue.shift() : queue?.[0];
    if (next === undefined) throw new Error(`aucune réponse pour ${req.stage}`);
    if (next instanceof Error) throw next;
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
  it("chapitres selon le plan, tous par Flash (réflexion moyenne si difficile), sans second passage", async () => {
    const p = new StageProvider({ comprehension: [comp], plan: [plan], chapitre_1: [chapter1], chapitre_2: [chapter2] });
    const res = await generateV5(p, input(), far());
    expect(res.status).toBe("done");
    if (res.status !== "done") return;
    const ex = res.output.explanation;
    expect(ex.sections.map((s) => s.id)).toEqual(["sec_1", "sec_2"]);
    expect(ex.sections[0]!.blocks.map((b) => b.id)).toEqual(["blk_c1_1", "blk_c1_2"]);
    expect(ex.sections[1]!.difficult).toBe(true);
    expect(ex.sections[0]!.notions?.[0]?.term).toBe("évaporation");
    expect(ex.glossary.map((g) => g.term)).toEqual(["évaporation"]);
    expect(ex.key_points).toHaveLength(2);
    expect(res.output.status).toBe("validated");
    const tier = (stage: string) => p.calls.find((c) => c.stage === stage)!.tier;
    expect(tier("plan")).toBe("fast");
    expect(tier("chapitre_1")).toBe("fast");
    expect(tier("chapitre_2")).toBe("fast");
    expect(p.calls.find((c) => c.stage === "chapitre_2")!.reasoning).toBe("medium");
    expect(p.calls.find((c) => c.stage === "chapitre_1")!.reasoning).toBe("low");
    expect(p.calls.some((c) => c.stage.endsWith("_enrichi"))).toBe(false);
    // Aucun graphique, flux ni dessin tracé par le code ; l'illustration prévue est gardée.
    expect(res.output.blueprint.visual_specs.map((v) => v.kind)).toEqual(["illustration"]);
  });

  it("publication progressive : le chapitre 1 est publié avant la fin du cours", async () => {
    const p = new StageProvider({ comprehension: [comp], plan: [plan], chapitre_1: [chapter1], chapitre_2: [chapter2] });
    const partial: { ready: number; total: number; sections: number }[] = [];
    const res = await generateV5(p, input(), {
      ...far(),
      concurrency: 1,
      onPartial: async (out, ready, total) => void partial.push({ ready, total, sections: out.explanation.sections.length }),
    });
    expect(res.status).toBe("done");
    expect(partial).toEqual([{ ready: 1, total: 2, sections: 1 }]);
  });

  it("revue ciblée : seules les affirmations à risque sont relues", () => {
    expect(riskyClaim({ statement: "97 % de l'eau est salée.", support_status: "supported" })).toBe(true);
    expect(riskyClaim({ statement: "Le droit s'applique sauf exception.", support_status: "supported" })).toBe(true);
    expect(riskyClaim({ statement: "L'eau s'évapore au soleil.", support_status: "partial" })).toBe(true);
    expect(riskyClaim({ statement: "L'eau s'évapore au soleil.", support_status: "supported" })).toBe(false);
  });

  it("un chapitre qui oublie une affirmation reçoit un complément ciblé, sans réécriture", async () => {
    const thin = { ...chapter1, blocks: [chapter1.blocks[1]] };
    const both = { ...plan, chapters: [{ ...plan.chapters[0]!, claim_ids: ["clm_1", "clm_2"] }] };
    const extra = { blocks: [{ ...chapter2.blocks[0]!, id: "blk_x1" }] };
    const p = new StageProvider({ comprehension: [comp], plan: [both], chapitre_1: [thin], chapitre_1_complement: [extra] });
    const res = await generateV5(p, input(), far());
    expect(res.status).toBe("done");
    expect(p.calls.filter((c) => c.stage === "chapitre_1")).toHaveLength(1);
    const complement = p.calls.filter((c) => c.stage === "chapitre_1_complement");
    expect(complement).toHaveLength(1);
    expect(complement[0]!.data).toContain("a corriger");
    expect(complement[0]!.data).toContain("blocs existants");
    if (res.status === "done") expect(res.output.explanation.sections[0]!.blocks.some((b) => b.claim_ids.includes("clm_2"))).toBe(true);
  });

  it("sous-chapitres : titres et objectifs gardés, identifiants renommés avec les blocs", async () => {
    const withParts = {
      ...chapter1,
      parts: [
        { title: "Ce qui fait évaporer l'eau", objective: "Relier le Soleil à l'évaporation.", block_ids: ["blk_1"] },
        { title: "Un exemple du quotidien", objective: null, block_ids: ["blk_2"] },
      ],
    };
    const p = new StageProvider({ comprehension: [comp], plan: [plan], chapitre_1: [withParts], chapitre_2: [chapter2] });
    const res = await generateV5(p, input(), far());
    expect(res.status).toBe("done");
    if (res.status !== "done") return;
    const s1 = res.output.explanation.sections[0]!;
    expect(s1.objective).toBe("Comprendre l'évaporation");
    expect(s1.parts).toEqual([
      { id: "part_c1_1", title: "Ce qui fait évaporer l'eau", objective: "Relier le Soleil à l'évaporation.", block_ids: [s1.blocks[0]!.id] },
      { id: "part_c1_2", title: "Un exemple du quotidien", objective: null, block_ids: [s1.blocks[1]!.id] },
    ]);
    // Chapitre sans sous-chapitres (cours plus ancien) : aucune partie inventée.
    expect(res.output.explanation.sections[1]!.parts).toBeUndefined();
  });

  it("sous-chapitres incohérents : réparation demandée, puis partie unique si l'écart reste", async () => {
    const bad = { ...chapter1, parts: [{ title: "Tout", objective: null, block_ids: ["blk_2", "blk_1"] }] };
    const p = new StageProvider({ comprehension: [comp], plan: [plan], chapitre_1: [bad, bad], chapitre_2: [chapter2] });
    const res = await generateV5(p, input(), far());
    expect(res.status).toBe("done");
    const calls = p.calls.filter((c) => c.stage === "chapitre_1");
    expect(calls).toHaveLength(2);
    if (res.status === "done") expect(res.output.explanation.sections[0]!.parts).toBeUndefined();
  });

  it("réparation en échec (réponse vide) : le premier brouillon est gardé", async () => {
    const thin = { ...chapter1, blocks: [chapter1.blocks[1]] };
    const both = { ...plan, chapters: [{ ...plan.chapters[0]!, claim_ids: ["clm_1", "clm_2"] }] };
    const empty = new ProviderError("empty", "Réponse vide.");
    const p = new StageProvider({ comprehension: [comp], plan: [both], chapitre_1: [thin], chapitre_1_complement: [empty] });
    const res = await generateV5(p, input(), far());
    expect(res.status).toBe("done");
    expect(p.calls.filter((c) => c.stage === "chapitre_1_complement").length).toBeGreaterThanOrEqual(1);
    // Une erreur de compte n'est jamais masquée.
    const denied = new StageProvider({ comprehension: [comp], plan: [both], chapitre_1: [thin], chapitre_1_complement: [new ProviderError("auth", "Clé refusée.")] });
    await expect(generateV5(denied, input(), far())).rejects.toMatchObject({ code: "auth" });
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

  it("unités sémantiques : coupe avant un titre, un titre reste avec sa suite", () => {
    const seg = (id: number, text: string) => ({ ...input().segments[0]!, id: `seg_${id}`, text });
    expect(isHeading("2.1 La photosynthèse")).toBe(true);
    expect(isHeading("Chapitre 3 : les cellules")).toBe(true);
    expect(isHeading("La cellule contient un noyau.")).toBe(false);
    const body = "La cellule contient un noyau et des organites. ".repeat(260); // ≈ 12 000 caractères
    const segs = [seg(1, "1. Introduction"), seg(2, body), seg(3, "2. La cellule"), seg(4, body), seg(5, body), seg(6, "3. Le noyau"), seg(7, body)];
    const units = fragmentSegments(segs, 20_000, 32_000).map((u) => u.map((x) => x.id));
    expect(units).toEqual([["seg_1", "seg_2"], ["seg_3", "seg_4"], ["seg_5"], ["seg_6", "seg_7"]]);
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
  const ch = (claim_ids: string[], visual = visualNone) => ({ title: "T", objective: "O", claim_ids, difficulty: "standard" as const, approach: "livre" as const, notions: [], visual: visual as PlanV5["chapters"][number]["visual"] });

  it("chaque affirmation dans un seul chapitre, oubliées rattachées au plus proche", () => {
    const draft: PlanV5 = { title: "T", cover_query_en: "", key_points: ["a", "b"], course_goal: "", chapters: [ch(["clm_1", "clm_9"]), ch(["clm_1", "clm_4"])], excluded: [], limitations: [] };
    const { plan: p, orphans } = normalizePlanV5(draft, ko, input());
    expect(orphans).toEqual(["clm_2", "clm_3"]);
    expect(p.chapters.map((c) => c.claim_ids)).toEqual([["clm_1", "clm_2", "clm_3"], ["clm_4"]]);
  });

  it("schéma annoté : valeurs reprises des affirmations du chapitre, jamais inventées", () => {
    expect(diagramContentOk("Évaporation → Condensation → Pluie")).toBe(true);
    expect(diagramContentOk("Hausse de 12,5 % puis 3 000 €", ["Les prix montent de 12.5 % ; coût 3 000 €."])).toBe(true);
    expect(diagramContentOk("Hausse de 40 %", ["Les prix montent de 12,5 %."])).toBe(false);
    expect(diagramContentOk("")).toBe(false);
  });

  it("composants chiffrés : valeurs reprises des affirmations citées, sauf exemple annoncé", () => {
    const statements = new Map([["clm_1", "Sur 200 €, 30 % vont au loyer."]]);
    const base = { text: "Part du loyer", claim_ids: ["clm_1"], evidence_ids: [] };
    const ok = { ...base, id: "blk_1", type: "proportion" as const, base: 200, percent: 30, unit: "€", part_label: "Loyer", rest_label: "Reste", interactive: true, example: false };
    const bad = { ...ok, id: "blk_2", percent: 45 };
    const fictive = { ...bad, id: "blk_3", example: true };
    const chart = { ...base, id: "blk_4", type: "chart" as const, chart_type: "bar" as const, unit: "%", points: [{ label: "Loyer", value: 30 }, { label: "Autre", value: null }] };
    expect(unsourcedComponents([ok, bad, fictive, chart], statements)).toEqual(["blk_2"]);
  });

  it("images selon le forfait et l'approche (une place gardée à la couverture), aucune en résumé fidèle ou en texte seul", () => {
    const v = { kind: "vector", subject: "s", query_en: "q", purpose: "p", content: "" };
    const chapters = Array.from({ length: 6 }, (_, i) => ch([`clm_${(i % 4) + 1}`], v));
    const draft: PlanV5 = { title: "T", cover_query_en: "", key_points: ["a", "b"], course_goal: "", chapters, excluded: [], limitations: [] };
    const count = (o: Parameters<typeof input>[0]) => normalizePlanV5(draft, ko, input(o)).plan.chapters.filter((c) => c.visual.kind !== "none").length;
    // Gratuit et Essentiel : 2 au total, dont 1 gardée pour la couverture.
    expect(count({ tier: "free" })).toBe(1);
    // Plus, livre interactif : 4 dont 1 pour la couverture.
    expect(count({ tier: "plus", mode: "livre" })).toBe(3);
    // Pro : 10 au plus ; ici limité par les 4 chapitres du plan (une image par chapitre).
    expect(count({ tier: "pro", mode: "parcours" })).toBe(4);
    expect(count({ tier: "pro", mode: "resume" })).toBe(0);
    expect(count({ tier: "pro", visualMode: "aucun" })).toBe(0);
  });
});

describe("moteur V5 : 15 chapitres au plus", () => {
  it("réunit les chapitres voisins les plus légers, sans perdre d'affirmation", () => {
    const none = { kind: "none" as const, subject: "", query_en: "", purpose: "", content: "" };
    const chapters = Array.from({ length: 20 }, (_, i) => ({ title: `C${i}`, objective: `O${i}`, claim_ids: Array.from({ length: i % 3 === 0 ? 1 : 4 }, (_, k) => `clm_${i}_${k}`), difficulty: (i === 5 ? "difficile" : "standard") as "standard" | "difficile", approach: "livre" as const, notions: [], visual: none }));
    const out = capChapters(chapters);
    expect(out).toHaveLength(15);
    expect(out.flatMap((c) => c.claim_ids)).toEqual(chapters.flatMap((c) => c.claim_ids));
    expect(out.some((c) => c.difficulty === "difficile")).toBe(true);
    expect(capChapters(chapters.slice(0, 4))).toHaveLength(4);
  });
});

describe("complément ciblé : preuves réparées par code", () => {
  it("une preuve inconnue est remplacée par celles des affirmations citées ; un bloc sans appui est écarté", () => {
    const claimEvidence = new Map([["clm_f2_1", ["ev_f2_1"]]]);
    const ev = new Set(["ev_f2_1"]);
    const blocks = [
      { id: "blk_x1", type: "fact", text: "Un fait.", claim_ids: ["clm_f2_1"], evidence_ids: ["ev_f2_37"] },
      { id: "blk_x2", type: "fact", text: "Inventé.", claim_ids: ["clm_zz"], evidence_ids: ["ev_zz"] },
    ] as never;
    const out = sanitizeComplement(blocks, ev, claimEvidence);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "blk_x1", claim_ids: ["clm_f2_1"], evidence_ids: ["ev_f2_1"] });
  });
});
