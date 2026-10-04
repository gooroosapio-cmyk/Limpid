import { describe, expect, it } from "vitest";
import { DEMO_SOURCE_TITLE, demoBlueprint, demoEvidence, demoExplanation, demoSegments } from "@/lib/demo/cycle-eau";
import { extractPdf } from "@/lib/extract/pdf";
import { pdfFileName, renderReportPdf } from "./pdf";

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

  it("rend graphique et tableau dans les trois présentations, sans perdre le texte", async () => {
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
    for (const theme of ["editorial", "essentiel", "visuel"] as const) {
      const buf = await renderReportPdf({ blueprint, explanation: demoExplanation, evidence: demoEvidence, segments: demoSegments, sourceTitle: DEMO_SOURCE_TITLE, theme });
      const text = (await extractPdf(new Uint8Array(buf), { maxPages: 50 })).blocks.map((b) => b.text).join(" ");
      expect(text).toContain("Où se trouve l'eau");
      expect(text).toContain("Non précisé par la source");
      expect(text).toContain("Environ 97 %");
      expect(text).toContain(demoExplanation.sections.at(-1)!.question);
    }
  }, 60_000);

  it("fabrique un nom de fichier sûr", () => {
    expect(pdfFileName('Le cycle : "eau" / été').ascii).toBe("limpid-Le-cycle-eau-ete.pdf");
    expect(pdfFileName("   ").ascii).toBe("limpid-rapport.pdf");
  });
});
