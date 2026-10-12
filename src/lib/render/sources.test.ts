import { describe, expect, it } from "vitest";
import { refLabel, type SourceEntry } from "./sources";

const e = (page: SourceEntry["page"]): SourceEntry => ({ n: 1, document: null, evidenceId: "e", location: "", page, before: "", quote: "", after: "" });
const p = (index: number, label = String(index)) => e({ kind: "page", index, label });

describe("renvoi compact aux pages", () => {
  it("une page, des pages qui se suivent, deux pages, plus", () => {
    expect(refLabel([p(79)])).toBe("p. 79");
    expect(refLabel([p(81), p(79), p(80), p(80)])).toBe("p. 79–81");
    expect(refLabel([p(84), p(79)])).toBe("p. 79, 84");
    expect(refLabel([p(79), p(84), p(90), p(102)])).toBe("p. 79 +3");
  });
  it("libellé imprimé, diapositives, aucune page", () => {
    expect(refLabel([p(12, "x")])).toBe("p. x");
    expect(refLabel([e({ kind: "slide", index: 3, label: "3" })])).toBe("diapo 3");
    expect(refLabel([e(null)])).toBeNull();
    expect(refLabel([])).toBeNull();
  });
});
