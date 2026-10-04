import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { segmentText, ExtractionError } from "@/lib/extract/text";
import { toProviderSchema } from "./gemini";
import { ComprehensionDraft, ExplanationDraft, generateReport, type GenerationInput } from "./pipeline";
import { ProviderError, type AIProvider, type StructuredRequest } from "./provider";
import { locateQuote } from "./quotes";

const TEXT = `Le cycle

L'eau s'évapore sous l'effet du Soleil.  Elle forme ensuite des nuages.

Les océans contiennent environ 97 % de l’eau de la planète.`;

describe("extraction de texte", () => {
  it("segmente par paragraphe et rattache les titres", () => {
    const { segments, sourceVersion } = segmentText(TEXT, "src_t", { maxChars: 10_000 });
    expect(segments).toHaveLength(2);
    expect(segments[0]!.locator).toEqual({ kind: "section", heading_path: ["Le cycle"], paragraph: 1 });
    expect(segments[0]!.source_version).toBe(sourceVersion);
    expect(segments[1]!.text).toContain("97 %");
  });
  it("découpe les paragraphes trop longs sans perdre de texte", () => {
    const long = Array.from({ length: 60 }, (_, i) => `Phrase numéro ${i} assez longue pour remplir.`).join(" ");
    const { segments } = segmentText(long, "src_t", { maxChars: 10_000 });
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((s) => s.text.length <= 1_500)).toBe(true);
    expect(segments.map((s) => s.text).join(" ").replace(/\s+/g, " ")).toBe(long);
  });
  it("refuse le vide, le binaire et l'excès", () => {
    expect(() => segmentText("   \n ", "src_t", { maxChars: 10 })).toThrow(ExtractionError);
    expect(() => segmentText("a\u0000b", "src_t", { maxChars: 10 })).toThrow(ExtractionError);
    expect(() => segmentText("x".repeat(11), "src_t", { maxChars: 10 })).toThrow(ExtractionError);
  });
});

describe("localisation des citations", () => {
  const seg = "Les océans contiennent environ 97 % de l’eau de la planète.";
  it("trouve une citation exacte", () => {
    expect(locateQuote(seg, "environ 97 %")).toEqual({ start: 23, end: 35, quote: "environ 97 %" });
  });
  it("tolère apostrophes, casse et espaces, et renvoie la tranche réelle", () => {
    const loc = locateQuote(seg, "97 %  de L'eau de la planète");
    expect(loc).not.toBeNull();
    expect(seg.slice(loc!.start, loc!.end)).toBe(loc!.quote);
    expect(loc!.quote).toBe("97 % de l’eau de la planète");
  });
  it("refuse une citation reformulée ou trop courte", () => {
    expect(locateQuote(seg, "les mers contiennent 97 %")).toBeNull();
    expect(locateQuote(seg, "Le")).toBeNull();
  });
});

describe("schéma transmis au fournisseur", () => {
  it("retire les bornes de taille mais garde types, énumérations et motifs", () => {
    const out = toProviderSchema({
      $schema: "x",
      type: "object",
      properties: { maxLength: { type: "string", maxLength: 3, pattern: "^a$" }, n: { type: "integer", minimum: 0, enum: [1] } },
      required: ["maxLength"],
    });
    expect(out).toEqual({
      type: "object",
      properties: { maxLength: { type: "string", pattern: "^a$" }, n: { type: "integer", enum: [1] } },
      required: ["maxLength"],
    });
  });
});

/* ---------- Pipeline avec un fournisseur simulé ---------- */

type Draft = z.infer<typeof ComprehensionDraft> | z.infer<typeof ExplanationDraft>;

class FakeProvider implements AIProvider {
  readonly name = "fake";
  readonly isDemo = false;
  calls: { stage: string; data: string[] }[] = [];
  constructor(private readonly script: (Draft | ProviderError)[]) {}
  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>) {
    this.calls.push({ stage: req.stage, data: req.untrustedData.map((d) => d.label) });
    const next = this.script.shift();
    const usage = { provider: "fake", model: "m", inputTokens: 1, outputTokens: 1, durationMs: 1, requestId: null };
    if (!next) throw new Error("script épuisé");
    if (next instanceof ProviderError) throw next;
    return { value: req.schema.parse(next) as z.infer<T>, usage };
  }
}

const goodComp: z.infer<typeof ComprehensionDraft> = {
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

const goodExpl: z.infer<typeof ExplanationDraft> = {
  title: "Le cycle de l'eau",
  template_id: "comprendre_processus",
  sections: [
    {
      id: "sec_1",
      question: "Que fait l'eau ?",
      takeaway: "Elle s'évapore.",
      blocks: [
        { type: "fact", id: "blk_1", text: "L'eau s'évapore grâce au Soleil.", claim_ids: ["clm_1"], evidence_ids: ["ev_1"] },
        { type: "fact", id: "blk_2", text: "Les océans contiennent environ 97 % de l'eau.", claim_ids: ["clm_2"], evidence_ids: ["ev_2"] },
      ],
    },
  ],
  glossary: [],
  checks: [],
  limitations: [],
  flow: { steps: [{ label: "Évaporation", claim_id: "clm_1" }, { label: "Stockage", claim_id: "clm_2" }], cyclic: false },
};

function input(): GenerationInput {
  return {
    sourceId: "src_t",
    segments: segmentText(TEXT, "src_t", { maxChars: 10_000 }).segments,
    level: "grand_public",
    goal: "comprendre",
    targetPages: 5,
    preferences: { aids: [], minutes: null, density: null, example_domain: null, familiarity: null },
    signal: new AbortController().signal,
    budgets: {
      comprehension: { tier: "fast", maxInputTokens: 1, maxOutputTokens: 1, timeoutMs: 1 },
      explanation: { tier: "quality", maxInputTokens: 1, maxOutputTokens: 1, timeoutMs: 1 },
    },
  };
}

describe("pipeline de génération", () => {
  it("produit des objets validés avec des offsets calculés par le serveur", async () => {
    const out = await generateReport(new FakeProvider([goodComp, goodExpl]), input());
    expect(out.status).toBe("validated");
    const ev2 = out.evidence.find((e) => e.id === "ev_2")!;
    expect(ev2.quote).toBe("environ 97 % de l’eau de la planète"); // tranche réelle, apostrophe typographique
    expect(out.blueprint.visual_specs).toHaveLength(1);
    expect(out.blueprint.sections[0]!.visual_ids).toEqual(["vis_flow"]);
    expect(out.knowledge.coverage).toMatchObject({ segments_total: 2, segments_processed: 2 });
  });

  it("demande une réparation quand une citation est inventée, puis valide", async () => {
    const bad = structuredClone(goodComp);
    bad.evidence[0]!.quote = "Le Soleil chauffe les océans.";
    const p = new FakeProvider([bad, goodComp, goodExpl]);
    const out = await generateReport(p, input());
    expect(out.status).toBe("validated");
    expect(out.validation.knowledge.repair_count).toBe(1);
    expect(p.calls[1]!.data).toContain("erreurs a corriger");
  });

  it("marque le rapport incomplet après deux réparations infructueuses", async () => {
    const bad = structuredClone(goodComp);
    bad.claims[1]!.numbers[0]!.source_form = "98 %";
    bad.claims[1]!.numbers[0]!.value = 98;
    const out = await generateReport(new FakeProvider([bad, bad, bad, goodExpl]), input());
    expect(out.status).toBe("incomplete");
    expect(out.validation.knowledge.repair_count).toBe(2);
    expect(out.validation.knowledge.blocking_errors.join()).toMatch(/98 %/);
  });

  it("écarte un schéma dont les étapes ne sont pas sourcées", async () => {
    const ex = structuredClone(goodExpl);
    ex.flow = { steps: [{ label: "A", claim_id: "clm_x" }, { label: "B", claim_id: "clm_y" }], cyclic: false };
    const out = await generateReport(new FakeProvider([goodComp, ex]), input());
    expect(out.blueprint.visual_specs).toHaveLength(0);
    expect(out.blueprint.layout_warnings).toHaveLength(1);
  });

  it("ne retente pas une erreur non passagère", async () => {
    const p = new FakeProvider([new ProviderError("refused", "non")]);
    await expect(generateReport(p, input())).rejects.toMatchObject({ code: "refused" });
    expect(p.calls).toHaveLength(1);
  });
});
