import { describe, expect, it } from "vitest";
import { DEMO_SOURCE_TITLE, demoBlueprint, demoEvidence, demoExplanation, demoSegments } from "@/lib/demo/cycle-eau";
import { extractPdf } from "@/lib/extract/pdf";
import type { Exercise, ExerciseSet } from "@/lib/contracts/schemas";
import { pdfFileName, renderReportPdf } from "./pdf";

function ex(id: string, kind: Exercise["kind"]): Exercise {
  return {
    id,
    kind,
    prompt: `Question ${id} ?`,
    objective: "Comprendre",
    notion: null,
    section_id: demoExplanation.sections[0]!.id,
    evidence_ids: [],
    options: kind === "single" ? [{ text: "Oui", correct: true, why: "" }, { text: "Non", correct: false, why: "" }] : [],
    truth: kind === "truefalse" ? true : null,
    items: [],
    pairs: [],
    blanks: [],
    expected: null,
    rubric: [],
    explanation: `Explication ${id}`,
  };
}

describe("export PDF", () => {
  it("produit un PDF lisible contenant le titre, les sections et les sources numérotées", async () => {
    const buf = await renderReportPdf({
      blueprint: demoBlueprint,
      explanation: demoExplanation,
      evidence: demoEvidence,
      segments: demoSegments,
      sourceTitle: DEMO_SOURCE_TITLE,
      isDemo: true,
      notes: ["Seules les 100 premières pages sur 140 ont été lues."],
      generatedAt: new Date("2026-10-04T12:00:00Z"),
    });
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    // Relecture par notre propre extracteur : le texte est réel et sélectionnable.
    const { blocks, pageCount } = await extractPdf(new Uint8Array(buf), { maxPages: 50 });
    const text = blocks.map((b) => b.text).join(" ");
    expect(pageCount).toBeGreaterThanOrEqual(1);
    expect(text).toContain(demoBlueprint.title);
    expect(text).toContain(demoExplanation.sections[0]!.question);
    expect(text).toContain("[1]");
    expect(text).toContain("4 octobre 2026");
    expect(text).toContain("140 ont été lues");
  }, 30_000);

  it("rend graphique et tableau, sans perdre le texte", async () => {
    const blueprint = structuredClone(demoBlueprint);
    blueprint.visual_specs.push(
      {
        id: "vis_chart",
        kind: "bar_chart",
        purpose: "Comparer",
        claim_ids: ["clm_9"],
        evidence_ids: [],
        data: { unit: "%", bars: [{ label: "Océans", value: 97, source_form: "97 %", claim_id: "clm_9" }, { label: "Autres", value: 3, source_form: "3 %", claim_id: "clm_9" }] },
        alt_text: "Graphique en barres. Océans : 97 %.",
        caption: "Où se trouve l'eau",
        illustrative_only: false,
      },
      {
        id: "vis_compare",
        kind: "comparison_table",
        purpose: "Comparer",
        claim_ids: ["clm_9"],
        evidence_ids: [],
        data: { criteria: ["Volume", "Sel"], options: [{ name: "Océans", cells: [{ text: "Environ 97 %", claim_id: "clm_9" }, { text: null, claim_id: null }] }, { name: "Glaces", cells: [{ text: null, claim_id: null }, { text: null, claim_id: null }] }] },
        alt_text: "Tableau",
        caption: "Réservoirs comparés",
        illustrative_only: false,
      },
    );
    blueprint.sections[0]!.visual_ids.push("vis_chart", "vis_compare");
    {
      const buf = await renderReportPdf({ blueprint, explanation: demoExplanation, evidence: demoEvidence, segments: demoSegments, sourceTitle: DEMO_SOURCE_TITLE });
      const text = (await extractPdf(new Uint8Array(buf), { maxPages: 50 })).blocks.map((b) => b.text).join(" ");
      expect(text).toContain("Où se trouve l'eau");
      expect(text).toContain("Non précisé par la source");
      expect(text).toContain("Environ 97 %");
      expect(text).toContain(demoExplanation.sections.at(-1)!.question);
    }
  }, 60_000);

  it("exporte les exercices sans réponses, et le corrigé à part", async () => {
    const exercises: ExerciseSet = {
      schema_version: "1.1.0",
      checkpoints: [{ section_id: demoExplanation.sections[0]!.id, exercises: [ex("ex_a", "single")] }],
      bilan: [ex("ex_b", "truefalse"), { ...ex("ex_c", "order"), items: ["Évaporation", "Condensation", "Précipitations"] }],
      insufficient: false,
    };
    const base = { blueprint: demoBlueprint, explanation: demoExplanation, evidence: demoEvidence, segments: demoSegments, sourceTitle: DEMO_SOURCE_TITLE, exercises };
    const read = async (buf: Buffer) => (await extractPdf(new Uint8Array(buf), { maxPages: 50 })).blocks.map((b) => b.text).join(" ").replace(/\s+/g, " ");
    const withEx = await read(await renderReportPdf({ ...base, variant: "exercises", watermark: true }));
    expect(withEx).toContain("Exercices");
    expect(withEx).toContain("Question ex_a ?");
    expect(withEx).not.toContain("Explication ex_a");
    expect(withEx).toContain("Créé avec Limpid · version gratuite");
    // Composé pour le papier : ni annexes ni glossaire développé ; limites et sources restent.
    expect(withEx).not.toContain("Annexes");
    expect(withEx).toContain("Limites de ce document");
    expect(withEx).toContain("Sources");
    const plain = await read(await renderReportPdf({ ...base, variant: "content" }));
    expect(plain).not.toContain("Question ex_a");
    expect(plain).not.toContain("Exercices");
    expect(plain).not.toContain("Glossaire");
    const key = await read(await renderReportPdf({ ...base, variant: "key" }));
    expect(key).toContain("Corrigé des exercices");
    expect(key).toContain("Explication ex_a");
    expect(key).toContain("Évaporation → Condensation → Précipitations");
    expect(key).not.toContain(demoExplanation.sections[0]!.blocks[0]!.text.slice(0, 40));
    expect(key).not.toContain("version gratuite");
    const en = await read(await renderReportPdf({ ...base, lang: "en" }));
    expect(en).not.toContain("Appendices");
    expect(en).toContain("The essentials");
  }, 60_000);

  it("fabrique un nom de fichier sûr", () => {
    expect(pdfFileName('Le cycle : "eau" / été').ascii).toBe("limpid-Le-cycle-eau-ete.pdf");
    expect(pdfFileName("   ").ascii).toBe("limpid-rapport.pdf");
  });
});
