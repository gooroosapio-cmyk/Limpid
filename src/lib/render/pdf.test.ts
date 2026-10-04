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

  it("fabrique un nom de fichier sûr", () => {
    expect(pdfFileName('Le cycle : "eau" / été').ascii).toBe("limpid-Le-cycle-eau-ete.pdf");
    expect(pdfFileName("   ").ascii).toBe("limpid-rapport.pdf");
  });
});
