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
