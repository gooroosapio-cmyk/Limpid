import { describe, expect, it } from "vitest";
import { retention } from "@/lib/config";
import { reportExpiresAt } from "./retention";

describe("conservation des Limpid (V4)", () => {
  it("aucune échéance par défaut : gardés jusqu'à suppression", () => {
    expect(retention.reportDays).toBe(0);
    expect(retention.originalHours).toBe(0);
    expect(reportExpiresAt(new Date("2026-10-04T20:00:00Z"))).toBeNull();
  });
  it("seuls les envois jamais utilisés restent temporaires (24 h)", () => {
    expect(retention.unusedHours).toBe(24);
  });
  it("une échéance explicite reste calculable (outil interne)", () => {
    expect(reportExpiresAt(new Date("2026-10-04T20:00:00Z"), 30)?.toISOString()).toBe("2026-11-03T20:00:00.000Z");
  });
});
