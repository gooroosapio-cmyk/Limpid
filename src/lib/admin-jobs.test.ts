import { describe, expect, it } from "vitest";
import { CANCELLABLE, pageSplit, RETRYABLE } from "./admin-jobs";

describe("traitements (administration)", () => {
  it("sépare pages natives et pages lues par OCR", () => {
    expect(pageSplit(10, "pdf", { ocr_pages: [2, 5] })).toEqual({ native: 8, ocr: 2 });
    expect(pageSplit(4, "pdf", { ocr_all: true })).toEqual({ native: 0, ocr: 4 });
    expect(pageSplit(4, "pdf", { pending_ocr: true })).toEqual({ native: 0, ocr: 4 });
    expect(pageSplit(null, "png", null)).toEqual({ native: 0, ocr: 1 });
    expect(pageSplit(3, "docx", null)).toEqual({ native: 3, ocr: 0 });
  });

  it("ne reprend qu'une tâche en échec et n'annule jamais une tâche terminée", () => {
    expect(RETRYABLE).not.toContain("succeeded");
    expect(CANCELLABLE).not.toContain("succeeded");
    expect(CANCELLABLE).not.toContain("failed");
  });
});
