/**
 * Couverture des réserves (cahier V2, § 5-6) : une phrase de la source qui porte une
 * réserve, une exception ou une limite ne doit pas disparaître du rapport. Contrôle
 * déterministe, sans appel IA : la phrase doit être recouverte par au moins une preuve.
 */
import type { Evidence, SourceSegment } from "@/lib/contracts/schemas";

/** Marques de réserve, d'exception, d'incertitude ou de limite (français ; la casse est ignorée). */
export const CAVEAT =
  /\b(toutefois|cependant|néanmoins|en revanche|sauf|à l'exception|hormis|sous-estim\w*|surestim\w*|ne traite pas|ne couvre pas|n'aborde pas|hors du champ|pas encore|incertain\w*|provisoire\w*|sous réserve|à confirmer|attention|risque\w*|limite\w*|ne permet pas|ne garantit pas|uniquement si|seulement si)\b/i;

export interface CaveatGap {
  segment_id: string;
  sentence: string;
}

/** Phrases d'un segment avec leurs positions (en unités de String.prototype.slice). */
export function sentences(text: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  const re = /[^.!?…]+(?:[.!?…]+["»”)]?|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!m[0].trim()) {
      if (re.lastIndex >= text.length) break;
      continue;
    }
    const lead = m[0].length - m[0].trimStart().length;
    out.push({ start: m.index + lead, end: m.index + m[0].trimEnd().length, text: m[0].trim() });
    if (re.lastIndex >= text.length) break;
  }
  return out;
}

export function caveatGaps(segments: SourceSegment[], evidence: Evidence[], max = 10): CaveatGap[] {
  const bySegment = new Map<string, Evidence[]>();
  for (const e of evidence) bySegment.set(e.segment_id, [...(bySegment.get(e.segment_id) ?? []), e]);
  const gaps: CaveatGap[] = [];
  for (const seg of segments) {
    for (const s of sentences(seg.text)) {
      if (!CAVEAT.test(s.text)) continue;
      const covered = (bySegment.get(seg.id) ?? []).some((e) => e.start_offset < s.end && e.end_offset > s.start);
      if (!covered) gaps.push({ segment_id: seg.id, sentence: s.text.slice(0, 300) });
      if (gaps.length >= max) return gaps;
    }
  }
  return gaps;
}

/**
 * Affirmations porteuses d'une réserve (énoncé, qualifiers ou statut ambigu) qu'aucun bloc
 * de l'explication ne reprend : la réserve disparaîtrait du rapport.
 */
export function droppedCaveatClaims(
  claims: { id: string; statement: string; qualifiers: string[]; support_status: string }[],
  usedClaimIds: Set<string>,
): string[] {
  return claims
    .filter((c) => c.support_status !== "unsupported")
    .filter((c) => c.support_status === "ambiguous" || CAVEAT.test(c.statement) || c.qualifiers.some((q) => CAVEAT.test(q)))
    .filter((c) => !usedClaimIds.has(c.id))
    .map((c) => c.id);
}
