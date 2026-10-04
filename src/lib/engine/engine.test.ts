import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { segmentText, ExtractionError } from "@/lib/extract/text";
import { GeminiProvider, retryDelaySeconds, toProviderSchema } from "./gemini";
import {
  ComprehensionDraft,
  ExplanationDraft,
  generateReport,
  mostCautious,
  regenerateExplanation,
  regenerateSection,
  simplerLevel,
  type GenerationInput,
} from "./pipeline";
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

type Draft = z.infer<typeof ComprehensionDraft> | z.infer<typeof ExplanationDraft> | Record<string, unknown>;

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
    const out = await generateReport(new FakeProvider([bad, bad, bad, goodExpl, goodExpl]), input());
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

describe("nouvelle version d'une explication", () => {
  it("rejoue seulement l'explication, avec la version précédente et la consigne de variation", async () => {
    const first = await generateReport(new FakeProvider([goodComp, goodExpl]), input());
    const fake = new FakeProvider([{ ...goodExpl, title: "Le cycle de l'eau, plus simplement" }]);
    let instructions = "";
    const spy: AIProvider = {
      name: "fake",
      isDemo: false,
      generateStructured: (req) => {
        instructions = req.trustedInstructions;
        return fake.generateStructured(req);
      },
    };
    const { segments: _s, sourceId: _id, ...rest } = input();
    const out = await regenerateExplanation(spy, { ...rest, level: simplerLevel("etudiant") }, first.knowledge, first.evidence, first.explanation, "simpler");
    expect(out.status).toBe("validated");
    expect(out.explanation.level).toBe("grand_public");
    expect(out.blueprint.title).toBe("Le cycle de l'eau, plus simplement");
    expect(fake.calls).toEqual([{ stage: "explication", data: ["connaissance validee", "version precedente"] }]);
    expect(instructions).toContain("PLUS SIMPLE");
  });

  it("ne descend pas sous « ultra simple »", () => {
    expect(simplerLevel("ultra_simple")).toBe("ultra_simple");
    expect(simplerLevel("expert_presse")).toBe("professionnel");
  });
});

describe("quota du fournisseur", () => {
  it("lit le délai de reprise annoncé par l'API", () => {
    expect(retryDelaySeconds(new Error('{"@type":"…RetryInfo","retryDelay":"27672s"}'))).toBe(27672);
    expect(retryDelaySeconds(new Error("autre erreur"))).toBe(0);
  });
});

describe("réponse hors schéma", () => {
  it("redemande une réponse conforme en citant les écarts, puis réussit", async () => {
    const usage = { provider: "fake", model: "m", inputTokens: 1, outputTokens: 1, durationMs: 1, requestId: null };
    const fake = new FakeProvider([
      new ProviderError("schema_mismatch", "hors schéma", usage, ["claims.0.id : identifiant invalide"]),
      goodComp,
      goodExpl,
    ]);
    const seen: string[] = [];
    const spy: AIProvider = {
      name: "fake",
      isDemo: false,
      generateStructured: (req) => {
        seen.push(req.trustedInstructions);
        return fake.generateStructured(req);
      },
    };
    const out = await generateReport(spy, input());
    expect(out.status).toBe("validated");
    expect(seen).toHaveLength(3);
    expect(seen[1]).toContain("claims.0.id : identifiant invalide");
    expect(seen[0]).not.toContain("ne respectait pas le schéma");
  });

  it("abandonne après deux corrections infructueuses", async () => {
    const usage = { provider: "fake", model: "m", inputTokens: 1, outputTokens: 1, durationMs: 1, requestId: null };
    const bad = () => new ProviderError("schema_mismatch", "hors schéma", usage, ["x : invalide"]);
    await expect(generateReport(new FakeProvider([bad(), bad(), bad(), goodComp]), input())).rejects.toMatchObject({ code: "schema_mismatch" });
  });
});

describe("vérification indépendante des affirmations", () => {
  it("abaisse un statut quand les extraits ne soutiennent qu'une partie, jamais l'inverse", async () => {
    const verdicts = {
      verdicts: [
        { claim_id: "clm_1", status: "supported", reason: "conforme" },
        { claim_id: "clm_2", status: "partial", reason: "la réserve « environ » est perdue" },
      ],
    };
    const fake = new FakeProvider([goodComp, verdicts as never, goodExpl]);
    const out = await generateReport(fake, { ...input(), verifyClaims: true });
    expect(fake.calls.map((c) => c.stage)).toEqual(["comprehension", "verification", "explication"]);
    expect(out.knowledge.claims.find((c) => c.id === "clm_2")!.support_status).toBe("partial");
    expect(out.knowledge.claims.find((c) => c.id === "clm_1")!.support_status).toBe("supported");
    expect(out.validation.knowledge.warnings.join(" ")).toContain("supported → partial");
    // Le bloc factuel qui cite clm_2 est signalé (formulation prudente), sans bloquer.
    expect(out.validation.explanation.warnings.join(" ")).toContain("formulation prudente");
  });

  it("refuse un fait appuyé sur une affirmation contredite", async () => {
    const verdicts = { verdicts: [{ claim_id: "clm_2", status: "contradicted", reason: "97 % contre 87 %" }] };
    const out = await generateReport(new FakeProvider([goodComp, verdicts as never, goodExpl, goodExpl, goodExpl]), { ...input(), verifyClaims: true });
    expect(out.knowledge.claims.find((c) => c.id === "clm_2")!.support_status).toBe("contradicted");
    expect(out.status).toBe("incomplete");
    expect(out.validation.explanation.blocking_errors.join(" ")).toContain("contredite");
  });

  it("garde le statut le plus prudent", () => {
    expect(mostCautious("supported", "partial")).toBe("partial");
    expect(mostCautious("unsupported", "supported")).toBe("unsupported");
    expect(mostCautious("partial", "contradicted")).toBe("contradicted");
  });
});

describe("régénération ciblée d'une section", () => {
  it("ne réécrit que la section visée et garde la numérotation des sources", async () => {
    const twoSections = {
      ...goodExpl,
      sections: [
        goodExpl.sections[0]!,
        {
          id: "sec_2",
          question: "Où est l'eau ?",
          takeaway: "Surtout dans les océans.",
          blocks: [{ type: "fact" as const, id: "blk_9", text: "Les océans contiennent environ 97 % de l'eau.", claim_ids: ["clm_2"], evidence_ids: ["ev_2"] }],
        },
      ],
    };
    const first = await generateReport(new FakeProvider([goodComp, twoSections]), input());
    const rewritten = {
      section: {
        id: "sec_autre",
        question: "Que fait l'eau, simplement ?",
        takeaway: "Le Soleil la fait monter.",
        blocks: [
          { type: "fact" as const, id: "blk_1", text: "Le Soleil fait s'évaporer l'eau.", claim_ids: ["clm_1"], evidence_ids: ["ev_1"] },
          { type: "analogy" as const, id: "blk_2", text: "Comme une casserole qui chauffe.", limit: "Le Soleil chauffe de loin.", claim_ids: [], evidence_ids: [] },
        ],
      },
    };
    const fake = new FakeProvider([rewritten]);
    const { segments: _s, sourceId: _id, ...rest } = input();
    const out = await regenerateSection(fake, rest, first.knowledge, first.evidence, first.explanation, first.blueprint, "sec_1", "simpler");
    expect(fake.calls).toHaveLength(1);
    expect(out.status).toBe("validated");
    expect(out.explanation.sections.map((x) => x.id)).toEqual(["sec_1", "sec_2"]);
    expect(out.explanation.sections[0]!.question).toBe("Que fait l'eau, simplement ?");
    expect(out.explanation.sections[1]).toEqual(first.explanation.sections[1]);
    expect(out.explanation.sections[0]!.blocks.every((b) => /^blk_[a-z0-9]+_\d+$/.test(b.id))).toBe(true);
    expect(out.blueprint.source_index.slice(0, first.blueprint.source_index.length)).toEqual(first.blueprint.source_index);
  });
});

describe("schémas et illustrations déterministes", () => {
  const withNumbers = () => {
    const c = structuredClone(goodComp);
    c.claims.push({
      id: "clm_3",
      statement: "La planète a environ 97 % de son eau dans les océans.",
      evidence_ids: ["ev_2"],
      qualifiers: ["environ"],
      numbers: [{ value: 97, unit: "%", scope: null, date: null, source_form: "97 %" }],
      support_status: "supported",
    });
    c.claims.push({ id: "clm_4", statement: "Non soutenue.", evidence_ids: ["ev_1"], qualifiers: [], numbers: [], support_status: "unsupported" });
    return c;
  };

  it("reprend les valeurs du graphique depuis les affirmations validées", async () => {
    const expl = {
      ...goodExpl,
      chart: { title: "Répartition", bars: [{ label: "Océans", claim_id: "clm_2", source_form: "97 %" }, { label: "Planète", claim_id: "clm_3", source_form: "97 %" }, { label: "Inventé", claim_id: "clm_2", source_form: "50 %" }] },
    };
    const out = await generateReport(new FakeProvider([withNumbers(), expl, expl]), input());
    const chart = out.blueprint.visual_specs.find((v) => v.kind === "bar_chart")!;
    expect(chart.data).toEqual({
      unit: "%",
      bars: [
        { label: "Océans", value: 97, source_form: "97 %", claim_id: "clm_2" },
        { label: "Planète", value: 97, source_form: "97 %", claim_id: "clm_3" },
      ],
    });
    expect(chart.alt_text).toContain("Océans : 97 %");
  });

  it("vide les cellules de comparaison non soutenues", async () => {
    const expl = {
      ...goodExpl,
      comparison: {
        criteria: ["Rôle", "Part"],
        options: [
          { name: "Soleil", cells: [{ text: "Évapore l'eau", claim_id: "clm_1" }, { text: "Invention", claim_id: "clm_4" }] },
          { name: "Océans", cells: [{ text: "Stockent l'eau", claim_id: null }, { text: "97 %", claim_id: "clm_2" }] },
        ],
      },
    };
    const out = await generateReport(new FakeProvider([withNumbers(), expl, expl]), input());
    const table = out.blueprint.visual_specs.find((v) => v.kind === "comparison_table")!;
    expect(table.data).toEqual({
      criteria: ["Rôle", "Part"],
      options: [
        { name: "Soleil", cells: [{ text: "Évapore l'eau", claim_id: "clm_1" }, { text: null, claim_id: null }] },
        { name: "Océans", cells: [{ text: null, claim_id: null }, { text: "97 %", claim_id: "clm_2" }] },
      ],
    });
  });

  it("expurge la requête d'illustration et respecte le mode de visuels", async () => {
    const expl = {
      ...goodExpl,
      illustrations: [
        { section_id: "sec_1", query: "Ocean waves 2024, Jean Dupont!", subject: "Les océans", alt_text: "Des vagues sur l'océan." },
        { section_id: "sec_inconnue", query: "cloud", subject: "Nuage", alt_text: "Un nuage." },
      ],
    };
    const out = await generateReport(new FakeProvider([goodComp, expl]), input());
    const ill = out.blueprint.visual_specs.filter((v) => v.kind === "illustration");
    expect(ill).toHaveLength(1);
    expect(ill[0]!.data).toEqual({ query: "ocean waves jean dupont", subject: "Les océans", asset_id: null });
    expect(ill[0]!.illustrative_only).toBe(true);
    expect(out.blueprint.sections[0]!.visual_ids).toEqual(["vis_flow", "vis_ill_1"]);

    const none = await generateReport(new FakeProvider([goodComp, expl]), { ...input(), visualMode: "aucun" });
    expect(none.blueprint.visual_specs).toHaveLength(0);
    const schemas = await generateReport(new FakeProvider([goodComp, expl]), { ...input(), visualMode: "schemas" });
    expect(schemas.blueprint.visual_specs.map((v) => v.kind)).toEqual(["flow"]);
  });
});

describe("panne du fournisseur pendant une nouvelle version", () => {
  it("échoue proprement sans toucher à la version précédente", async () => {
    const first = await generateReport(new FakeProvider([goodComp, goodExpl]), input());
    const snapshot = structuredClone({ e: first.explanation, b: first.blueprint, k: first.knowledge });
    const { segments: _s, sourceId: _id, ...rest } = input();
    const down = new ProviderError("quota_exhausted", "Quota du fournisseur épuisé.", { provider: "fake", model: "m", inputTokens: null, outputTokens: null, durationMs: 1, requestId: null });
    await expect(regenerateSection(new FakeProvider([down]), rest, first.knowledge, first.evidence, first.explanation, first.blueprint, "sec_1", "simpler")).rejects.toBeInstanceOf(ProviderError);
    await expect(regenerateExplanation(new FakeProvider([down]), rest, first.knowledge, first.evidence, first.explanation, "simpler")).rejects.toBeInstanceOf(ProviderError);
    expect({ e: first.explanation, b: first.blueprint, k: first.knowledge }).toEqual(snapshot);
  });
});

describe("modèles de repli déclarés", () => {
  class Scripted extends GeminiProvider {
    tried: string[] = [];
    constructor(private readonly exhausted: Set<string>, fallbackModels: string[]) {
      super({ apiKey: "k", modelFast: "rapide", modelQuality: "qualite", fallbackModels });
    }
    protected override async generateWith<T extends z.ZodType>(model: string, _req: StructuredRequest<T>) {
      this.tried.push(model);
      const usage = { provider: "gemini", model, inputTokens: 1, outputTokens: 1, durationMs: 1, requestId: null };
      if (this.exhausted.has(model)) throw new ProviderError("quota_exhausted", "Quota épuisé.", usage);
      return { value: { ok: true } as z.infer<T>, usage };
    }
  }
  const req = { stage: "explication", schema: {} as z.ZodType, trustedInstructions: "", untrustedData: [], budget: { tier: "quality" as const, maxInputTokens: 1, maxOutputTokens: 1, timeoutMs: 1 }, signal: new AbortController().signal } as unknown as StructuredRequest<z.ZodType>;

  it("passe au modèle suivant quand le quota est épuisé, et le dit dans l'usage", async () => {
    const p = new Scripted(new Set(["qualite"]), ["secours-1", "secours-2"]);
    const r = await p.generateStructured(req);
    expect(p.tried).toEqual(["qualite", "secours-1"]);
    expect(r.usage.model).toBe("secours-1");
  });
  it("ne change pas de modèle pour une erreur de contenu", async () => {
    class Refusing extends Scripted {
      protected override async generateWith<T extends z.ZodType>(model: string, req: StructuredRequest<T>) {
        this.tried.push(model);
        throw new ProviderError("refused", "Refus.", { provider: "gemini", model, inputTokens: null, outputTokens: null, durationMs: 1, requestId: null });
        return super.generateWith(model, req);
      }
    }
    const p = new Refusing(new Set(), ["secours-1"]);
    await expect(p.generateStructured(req)).rejects.toMatchObject({ code: "refused" });
    expect(p.tried).toEqual(["qualite"]);
  });
  it("sans repli déclaré, l'épuisement remonte tel quel", async () => {
    const p = new Scripted(new Set(["qualite"]), []);
    await expect(p.generateStructured(req)).rejects.toMatchObject({ code: "quota_exhausted" });
  });
});
