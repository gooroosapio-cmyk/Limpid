import { describe, expect, it } from "vitest";
import { percentile } from "./diagnostic";

describe("percentiles", () => {
  it("calcule p50 et p95 par la méthode du rang le plus proche", () => {
    const v = Array.from({ length: 20 }, (_, i) => (i + 1) * 1000);
    expect(percentile(v, 50)).toBe(10_000);
    expect(percentile(v, 95)).toBe(19_000);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });
});
