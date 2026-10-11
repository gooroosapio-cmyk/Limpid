import { describe, expect, it } from "vitest";
import { recentItems, resumeItem } from "./home";
import type { LibraryItem } from "./load";

const item = (id: string, state: LibraryItem["state"], openedAt: string | null) => ({ id, state, openedAt }) as LibraryItem;

describe("accueil : Reprendre et Récents", () => {
  const items = [item("a", "ready", null), item("b", "ready", "2026-10-10T09:00:00Z"), item("c", "failed", null), item("d", "ready", "2026-10-11T09:00:00Z"), item("e", "running", null)];

  it("reprend le dernier cours prêt ouvert", () => {
    expect(resumeItem(items)?.id).toBe("d");
    expect(resumeItem([item("x", "running", "2026-10-11T09:00:00Z")])).toBeNull();
  });

  it("liste les trois derniers, sans le cours repris ni les échecs", () => {
    expect(recentItems(items, resumeItem(items)).map((i) => i.id)).toEqual(["a", "b", "e"]);
  });
});

describe("bibliothèque : résumé", () => {
  it("compte contenus, prêts, en cours et lus", async () => {
    const { librarySummary } = await import("./home");
    const rows = [
      { id: "1", state: "ready", unread: false },
      { id: "2", state: "ready", unread: true },
      { id: "3", state: "running", unread: false },
      { id: "4", state: "failed", unread: false },
    ] as LibraryItem[];
    expect(librarySummary(rows)).toEqual({ total: 3, ready: 2, running: 1, read: 1 });
  });
});
