import { parseHTML } from "linkedom";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { composeLimpid } from "@/components/reader/v4/Pieces";
import { DEMO_SOURCE_TITLE, demoBlueprint, demoEvidence, demoExplanation, demoSegments } from "@/lib/demo/cycle-eau";
import { extractPdf } from "@/lib/extract/pdf";
import { dictFor } from "@/lib/i18n";
import { renderReportPdf } from "@/lib/render/pdf";
import { cleanShapes, normalizeDrawings, withDrawings, type DrawingDraft } from "./drawings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shape = (o: Record<string, unknown>): any => ({ w: null, h: null, r: null, x2: null, y2: null, d: null, text: null, tone: "ink", fill: false, ...o });
const sec = demoExplanation.sections[0]!;
const block = sec.blocks.find((b) => b.type === "fact")!;

function draft(): DrawingDraft {
  return {
    drawings: [
      {
        block_id: block.id,
        caption: "L'eau qui monte et redescend",
        alt_text: "Un soleil chauffe la mer ; une flèche monte vers un nuage puis redescend en pluie.",
        ratio: "4:3",
        shapes: [
          shape({ t: "rect", x: 0, y: 0, w: 100, h: 75, fill: true, tone: "soft" }), // fond : retiré
          shape({ t: "circle", x: 20, y: 18, r: 9, tone: "accent", fill: true }),
          shape({ t: "path", x: 0, y: 0, d: "M5 65 Q25 58 45 65 T95 65", tone: "green" }),
          shape({ t: "arrow", x: 40, y: 58, x2: 60, y2: 25 }),
          shape({ t: "path", x: 0, y: 0, d: "M0 0 L <script>", tone: "ink" }), // chemin invalide : retiré
          shape({ t: "text", x: 70, y: 15, text: "nuage" }),
          shape({ t: "text", x: 70, y: 70, text: "4 512 km" }), // chiffre absent : retiré
          shape({ t: "circle", x: 500, y: 10, r: 4 }), // hors repère : retiré
        ],
      },
      { block_id: "blk_inconnu", caption: "x", alt_text: "x", ratio: "1:1", shapes: [shape({ t: "circle", x: 50, y: 50, r: 10 }), shape({ t: "line", x: 0, y: 0, x2: 10, y2: 10 })] },
    ],
  };
}

describe("planche de dessins", () => {
  it("garde les formes valides, retire fond, chemins douteux, chiffres inventés et formes hors repère", () => {
    const kept = cleanShapes(draft().drawings[0]!.shapes, "4:3", JSON.stringify(demoExplanation.sections).toLowerCase());
    expect(kept.map((s) => s.t)).toEqual(["circle", "path", "arrow", "text"]);
  });

  it("ancre chaque dessin sur un bloc existant, un par partie, incrusté et non probant", () => {
    const { specs, placed } = normalizeDrawings(draft() as never, demoExplanation);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ kind: "drawing", placement: "wrap", size: "compact", illustrative_only: true, evidence_ids: [] });
    expect(specs[0]!.claim_ids.length).toBeGreaterThan(0);
    expect(placed.get(sec.id)).toEqual([specs[0]!.id]);
  });

  it("incruste le dessin dans le bloc, en SVG sûr, et l'exporte dans le PDF", async () => {
    const { specs, placed } = normalizeDrawings(draft() as never, demoExplanation);
    const blueprint = withDrawings(demoBlueprint, specs, placed);
    const html = renderToStaticMarkup(
      h("div", null, composeLimpid({ t: dictFor("fr"), blueprint, explanation: demoExplanation, evidence: demoEvidence, segments: demoSegments, exercises: null, modeLabel: null, canReformulate: false }).pieces),
    );
    const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
    const host = document.getElementById(block.id)!;
    expect(host.className).toContain("wrap-host");
    const fig = host.querySelector("figure.wrap-fig")!;
    expect(fig.className).toContain("wrap-right");
    expect(fig.querySelector("svg.drawing")!.getAttribute("role")).toBe("img");
    expect(fig.querySelectorAll("circle, path, line, polygon").length).toBeGreaterThanOrEqual(4);
    expect(document.querySelectorAll("script, foreignObject, image").length).toBe(0);
    expect(host.querySelector("p")!.textContent).toContain(block.text.slice(0, 20));

    const pdf = await renderReportPdf({ blueprint, explanation: demoExplanation, evidence: demoEvidence, segments: demoSegments, sourceTitle: DEMO_SOURCE_TITLE });
    const text = (await extractPdf(new Uint8Array(pdf), { maxPages: 50 })).blocks.map((b) => b.text).join(" ");
    expect(text).toContain("L'eau qui monte et redescend");
  }, 30_000);
});
