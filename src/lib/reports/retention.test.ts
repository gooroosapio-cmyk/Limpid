import { describe, expect, it } from "vitest";
import { reportExpiresAt } from "./retention";

describe("conservation des rapports", () => {
  it("efface 30 jours après la création", () => {
    expect(reportExpiresAt(new Date("2026-10-04T20:00:00Z"), 30)?.toISOString()).toBe("2026-11-03T20:00:00.000Z");
  });
  it("0 jour = conservation illimitée", () => {
    expect(reportExpiresAt(new Date("2026-10-04T20:00:00Z"), 0)).toBeNull();
  });
});
