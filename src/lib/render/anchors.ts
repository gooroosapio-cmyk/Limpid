/** Ancres stables de la page Annexes (V5, § 14), partagées par le lecteur et la page. */
import { foldText } from "@/lib/library/search";

export const ANNEX_SECTIONS = ["glossaire", "sources", "limites"] as const;

/** `g-cycle-de-l-eau` : un terme du glossaire, ouvert directement. */
export function termAnchor(term: string): string {
  const slug = foldText(term).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `g-${slug || "terme"}`;
}

export const sourceAnchor = (n: number) => `src-${n}`;
