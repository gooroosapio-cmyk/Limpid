import { describe, expect, it } from "vitest";
import { parseInstallState, shouldAskInstall } from "./install-prompt";

const at = (visits: number, dismissedAt = 0, installed = false) => shouldAskInstall({ visits, dismissedAt, installed });

describe("invitation à installer", () => {
  it("dès la première ouverture", () => {
    expect(at(1)).toBe(true);
  });
  it("après un refus : 3e visite, puis toutes les 2 visites", () => {
    expect([2, 3, 4, 5, 6, 7].map((v) => at(v, 1))).toEqual([false, true, false, true, false, true]);
    // Refus à la 3e : prochaine invitation à la 5e.
    expect([3, 4, 5].map((v) => at(v, 3))).toEqual([false, false, true]);
  });
  it("jamais une fois installée ; état illisible = vierge", () => {
    expect(at(1, 0, true)).toBe(false);
    expect(parseInstallState("{bad")).toEqual({ visits: 0, dismissedAt: 0, installed: false });
    expect(parseInstallState('{"visits":4,"dismissedAt":-2}')).toEqual({ visits: 4, dismissedAt: 0, installed: false });
  });
});
