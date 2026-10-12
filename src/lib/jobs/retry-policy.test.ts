import { describe, expect, it } from "vitest";
import { afterFailure, backoffMs, MAX_AUTO_RETRIES } from "./retry-policy";

describe("relances automatiques", () => {
  it("relance un incident transitoire au plus trois fois, avec un délai croissant", () => {
    expect(afterFailure("provider_unavailable", 0)).toMatchObject({ retry: true });
    expect(afterFailure("provider_truncated", 2)).toMatchObject({ retry: true });
    expect(afterFailure("provider_unavailable", MAX_AUTO_RETRIES)).toEqual({ retry: false, recoverable: true });
    expect(backoffMs(1, () => 0.5)).toBe(30_000);
    expect(backoffMs(2, () => 0.5)).toBe(120_000);
    expect(backoffMs(3, () => 0.5)).toBe(480_000);
    expect(backoffMs(9, () => 1)).toBe(720_000);
  });

  it("ne relance jamais à l'aveugle une source illisible ou un refus", () => {
    expect(afterFailure("ocr_unreadable", 0)).toEqual({ retry: false, recoverable: false });
    expect(afterFailure("provider_refused", 0)).toEqual({ retry: false, recoverable: false });
    // Clé refusée, quota : pas de relance automatique, mais reprise possible après correction.
    expect(afterFailure("provider_auth", 0)).toEqual({ retry: false, recoverable: true });
    expect(afterFailure("provider_quota_exhausted", 0)).toEqual({ retry: false, recoverable: true });
  });
});
