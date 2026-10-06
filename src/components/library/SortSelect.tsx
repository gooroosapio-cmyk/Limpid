"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";

/** Tri de la bibliothèque (Récents par défaut), gardé dans l'adresse. */
export function SortSelect({ value, hrefs }: { value: string; hrefs: Record<string, string> }) {
  const t = useT();
  const l = t.v4.library;
  const router = useRouter();
  return (
    <label className="lib-sort">
      <span className="sr-only">{l.sortLabel}</span>
      <select value={value} onChange={(e) => router.push(hrefs[e.target.value] ?? hrefs.recents!)} aria-label={l.sortLabel}>
        {Object.keys(hrefs).map((k) => <option key={k} value={k}>{l.sorts[k]}</option>)}
      </select>
    </label>
  );
}
