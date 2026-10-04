import { describe, expect, it } from "vitest";
import type { Evidence, SourceSegment } from "@/lib/contracts/schemas";
import { caveatGaps, sentences } from "./coverage";

const seg = (id: string, text: string): SourceSegment => ({
  id,
  source_id: "src_t",
  source_version: "a".repeat(64),
  locator: { kind: "section", heading_path: [], paragraph: 1 },
  text,
  content_hash: "b".repeat(64),
  extraction_warnings: [],
});
const ev = (id: string, segment_id: string, text: string, quote: string): Evidence => {
  const start = text.indexOf(quote);
  return { id, segment_id, start_offset: start, end_offset: start + quote.length, quote };
};

const TEXT =
  "Le rendement est passé à 79,5 %. Le service estime toutefois que les mesures sous-estiment les pertes. Le bilan ne traite pas de la qualité sanitaire.";

describe("couverture des réserves", () => {
  it("découpe en phrases avec positions exactes", () => {
    const s = sentences(TEXT);
    expect(s).toHaveLength(3);
    for (const x of s) expect(TEXT.slice(x.start, x.end)).toBe(x.text);
  });

  it("signale les phrases de réserve qu'aucune preuve ne recouvre", () => {
    const segs = [seg("seg_1", TEXT)];
    const gaps = caveatGaps(segs, [ev("ev_1", "seg_1", TEXT, "Le rendement est passé à 79,5 %")]);
    expect(gaps.map((g) => g.sentence)).toEqual([
      "Le service estime toutefois que les mesures sous-estiment les pertes.",
      "Le bilan ne traite pas de la qualité sanitaire.",
    ]);
  });

  it("considère une réserve couverte dès qu'une preuve la recoupe", () => {
    const segs = [seg("seg_1", TEXT)];
    const gaps = caveatGaps(segs, [
      ev("ev_1", "seg_1", TEXT, "les mesures sous-estiment les pertes"),
      ev("ev_2", "seg_1", TEXT, "ne traite pas de la qualité sanitaire"),
    ]);
    expect(gaps).toEqual([]);
  });

  it("ignore les phrases sans réserve", () => {
    expect(caveatGaps([seg("seg_1", "L'eau s'évapore. Elle forme des nuages.")], [])).toEqual([]);
  });
});

describe("réserves gardées dans l'explication", () => {
  it("repère une affirmation de réserve qu'aucun bloc ne reprend", async () => {
    const { droppedCaveatClaims } = await import("./coverage");
    const claims = [
      { id: "clm_1", statement: "Le rendement atteint 79,5 %.", qualifiers: [], support_status: "supported" },
      { id: "clm_2", statement: "Les mesures sous-estiment toutefois les pertes.", qualifiers: [], support_status: "supported" },
      { id: "clm_3", statement: "Les travaux coûteront cher.", qualifiers: [], support_status: "ambiguous" },
      { id: "clm_4", statement: "Une limite inventée.", qualifiers: [], support_status: "unsupported" },
    ];
    expect(droppedCaveatClaims(claims, new Set(["clm_1"]))).toEqual(["clm_2", "clm_3"]);
    expect(droppedCaveatClaims(claims, new Set(["clm_1", "clm_2", "clm_3"]))).toEqual([]);
  });
});
