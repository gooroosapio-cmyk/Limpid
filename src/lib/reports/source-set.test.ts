import { describe, expect, it } from "vitest";
import { engineEvidence, engineSegmentId, engineSegments, splitEngineSegmentId, storedEvidence } from "./source-set";

const H = "a".repeat(64);
const row = (id: string, page: number, ordinal: number) => ({
  id,
  source_version: H,
  locator: { kind: "pdf_page", physical_index: page, printed_label: null },
  text: id,
  content_hash: H,
  extraction_warnings: [],
  ordinal,
});

describe("ensemble de sources d'un Limpid commun", () => {
  it("garde les identifiants d'un Limpid à source unique", () => {
    expect(engineSegmentId(0, "seg_14", false)).toBe("seg_14");
    const segs = engineSegments([{ sourceId: "11111111-1111-4111-8111-111111111111", rows: [row("seg_1", 1, 0)] }]);
    expect(segs[0]!.id).toBe("seg_1");
  });

  it("préfixe par document, trie par page (OCR replacé) et revient à la source réelle", () => {
    const a = "11111111-1111-4111-8111-111111111111";
    const b = "22222222-2222-4222-8222-222222222222";
    const segs = engineSegments([
      { sourceId: a, rows: [row("seg_2", 3, 1), row("seg_p2-1", 2, 50), row("seg_1", 1, 0)] },
      { sourceId: b, rows: [row("seg_1", 1, 0)] },
    ]);
    expect(segs.map((s) => s.id)).toEqual(["seg_d1-1", "seg_d1-p2-1", "seg_d1-2", "seg_d2-1"]);
    expect(segs.map((s) => s.source_id)).toEqual([`src_${a}`, `src_${a}`, `src_${a}`, `src_${b}`]);
    expect(splitEngineSegmentId("seg_d2-1")).toEqual({ position: 1, segmentId: "seg_1" });
    const ev = { id: "ev_1", segment_id: "seg_d2-1", start_offset: 0, end_offset: 2, quote: "se" };
    expect(storedEvidence(ev, [a, b])).toMatchObject({ segment_id: "seg_1", source_id: b });
    expect(engineEvidence({ ...ev, segment_id: "seg_1", source_id: b }, [a, b]).segment_id).toBe("seg_d2-1");
    expect(() => storedEvidence({ ...ev, segment_id: "seg_d5-1" }, [a, b])).toThrow();
  });
});
