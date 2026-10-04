import { describe, expect, it } from "vitest";
import type { Evidence, SourceSegment } from "@/lib/contracts/schemas";
import { blocksMissingNumbers, CAVEAT, caveatGaps, droppedNumberClaims, hasFigure, numberGaps, sentences } from "./coverage";

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

describe("couverture des chiffres", () => {
  it("repère les phrases chiffrées sans preuve, pas les simples années", () => {
    const seg = {
      id: "seg_1",
      source_id: "src_1",
      source_version: "v1",
      locator: { kind: "section" as const, heading_path: [], paragraph: 1 },
      text: "Le rapport date de 2025. La consommation atteint 148 litres par habitant. L'objectif est de 135 litres en 2027.",
      content_hash: "h",
      extraction_warnings: [],
    };
    const ev = [{ id: "ev_1", segment_id: "seg_1", start_offset: 25, end_offset: 70, quote: seg.text.slice(25, 70) }];
    expect(hasFigure("Le rapport date de 2025.")).toBe(false);
    expect(hasFigure("Une baisse de 5 %.")).toBe(true);
    expect(numberGaps([seg as never], ev as never).map((g) => g.sentence)).toEqual(["L'objectif est de 135 litres en 2027."]);
  });
  it("signale les affirmations chiffrées soutenues absentes de l'explication", () => {
    const claims = [
      { id: "clm_1", numbers: [1], support_status: "supported" },
      { id: "clm_2", numbers: [], support_status: "supported" },
      { id: "clm_3", numbers: [1], support_status: "unsupported" },
      { id: "clm_4", numbers: [1], support_status: "supported" },
    ];
    expect(droppedNumberClaims(claims, new Set(["clm_4"]))).toEqual(["clm_1"]);
  });
  it("reconnaît une limite de portée", () => {
    expect(CAVEAT.test("Ces règles valent pour un composteur individuel.")).toBe(true);
  });
});

describe("nombres repris dans le texte", () => {
  it("signale un bloc qui cite une affirmation chiffrée sans ses nombres", () => {
    const claims = [
      { id: "clm_1", numbers: [{ source_form: "79,5 %" }, { source_form: "75,6 %" }] },
      { id: "clm_2", numbers: [{ source_form: "3,9 millions" }] },
    ];
    const sections = [
      {
        blocks: [
          { id: "blk_1", type: "fact", text: "Le rendement a progressé en 2025.", claim_ids: ["clm_1"] },
          { id: "blk_2", type: "fact", text: "La production atteint 3,9 millions de m³.", claim_ids: ["clm_2"] },
          { id: "blk_3", type: "analogy", text: "Comme une passoire.", claim_ids: ["clm_1"] },
          { id: "blk_4", type: "fact", text: "Il passe de 75,6 % à 79,5 %.", claim_ids: ["clm_1"] },
        ],
      },
    ];
    expect(blocksMissingNumbers(sections, claims)).toEqual([{ block_id: "blk_1", numbers: ["79,5 %", "75,6 %"] }]);
  });
});
