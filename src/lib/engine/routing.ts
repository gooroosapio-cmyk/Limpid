/**
 * Routage déterministe de la structure (prompt V2, « règle de routage par risque ») : une
 * source complexe — longue, dense en chiffres ou formules, ou faite de plusieurs documents —
 * passe à DeepSeek V4.1 Flash, qui préserve mieux les chaînes de raisonnement ; sinon GLM-5.3
 * Flash. Calcul local, explicable, sans appel.
 */
import type { ModelRole } from "./provider";

export interface SourceProfile {
  chars: number;
  sources: number;
  /** Part des caractères qui sont des chiffres ou des signes de calcul (0–1). */
  numericShare: number;
}

const LONG_CHARS = 150_000; // ≈ 60 pages
const NUMERIC_SHARE = 0.06;

export function profileOf(texts: string[], sources: number): SourceProfile {
  const all = texts.join("\n");
  const numeric = (all.match(/[0-9%=+×÷√∑∫^±≤≥<>/]/g) ?? []).length;
  return { chars: all.length, sources, numericShare: all.length ? numeric / all.length : 0 };
}

/** Rôle de la lecture et du plan, avec sa raison (journalisée). */
export function structureRoute(p: SourceProfile): { role: ModelRole; reason: string } {
  if (p.sources > 1) return { role: "structure_complex", reason: "plusieurs sources" };
  if (p.chars > LONG_CHARS) return { role: "structure_complex", reason: "source longue" };
  if (p.numericShare > NUMERIC_SHARE) return { role: "structure_complex", reason: "chiffres et formules denses" };
  return { role: "structure", reason: "source standard" };
}
