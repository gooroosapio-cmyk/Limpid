import type { LibraryItem } from "./load";

/** Cours à reprendre : le dernier ouvert parmi les Limpid prêts (position de lecture enregistrée). */
export function resumeItem(items: LibraryItem[]): LibraryItem | null {
  return (
    items
      .filter((i) => i.state === "ready" && i.openedAt)
      .sort((a, b) => (b.openedAt ?? "").localeCompare(a.openedAt ?? ""))[0] ?? null
  );
}

/** Récents : les trois derniers créés, hors cours à reprendre et hors échecs. */
export function recentItems(items: LibraryItem[], resume: LibraryItem | null, n = 3): LibraryItem[] {
  return items.filter((i) => i.id !== resume?.id && i.state !== "failed").slice(0, n);
}
