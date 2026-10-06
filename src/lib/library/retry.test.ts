import { describe, expect, it } from "vitest";
import { canRetryNow } from "./retry";

describe("relance d'une préparation", () => {
  it("quota ou plafond atteint : pas de réessai immédiat", () => {
    for (const c of ["budget_daily", "budget_monthly", "provider_quota_exhausted", "generation_disabled"]) expect(canRetryNow(c)).toBe(false);
  });
  it("erreur passagère ou inconnue : réessai possible", () => {
    for (const c of ["provider_timeout", "provider_unavailable", "unknown", null]) expect(canRetryNow(c)).toBe(true);
  });
});
