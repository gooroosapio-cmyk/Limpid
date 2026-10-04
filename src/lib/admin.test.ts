import { describe, expect, it } from "vitest";
import { pacificMidnight } from "./admin";

describe("remise à zéro du quota Gemini", () => {
  it("calcule minuit à Los Angeles, heure d'été comme d'hiver", () => {
    // 4 octobre 2026, 16 h UTC = 9 h à Los Angeles (UTC−7) → minuit = 07:00 UTC.
    expect(pacificMidnight(new Date("2026-10-04T16:00:00Z")).toISOString()).toBe("2026-10-04T07:00:00.000Z");
    // 5 octobre, 3 h UTC = 4 octobre 20 h à Los Angeles → même minuit.
    expect(pacificMidnight(new Date("2026-10-05T03:00:00Z")).toISOString()).toBe("2026-10-04T07:00:00.000Z");
    // Janvier (UTC−8) → minuit = 08:00 UTC.
    expect(pacificMidnight(new Date("2027-01-15T12:00:00Z")).toISOString()).toBe("2027-01-15T08:00:00.000Z");
  });
});
