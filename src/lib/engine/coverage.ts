/**
 * Couverture des réserves (cahier V2, § 5-6) : une phrase de la source qui porte une
 * réserve, une exception ou une limite ne doit pas disparaître du rapport. Contrôle
 * déterministe, sans appel IA : la phrase doit être recouverte par au moins une preuve.
 */
import type { Evidence, SourceSegment } from "@/lib/contracts/schemas";

/** Marques de réserve, d'exception, d'incertitude ou de limite (français ; la casse est ignorée). */
export const CAVEAT =
  /\b(toutefois|cependant|néanmoins|en revanche|sauf|à l'exception|hormis|sous-estim\w*|surestim\w*|ne traite pas|ne couvre pas|n'aborde pas|hors du champ|pas encore|incertain\w*|provisoire\w*|sous réserve|à confirmer|attention|risque\w*|limite\w*|ne permet pas|ne garantit pas|uniquement si|seulement si|valent pour|vaut pour|ne valent pas|ne vaut pas|ne s'applique\w*|s'applique\w* uniquement)\b/i;

/**
 * Chiffre porteur de sens : nombre avec unité, pourcentage ou quantité (pas une simple année,
 * ni un numéro de section). Les phrases qui en contiennent sont des faits essentiels candidats.
 */
const FIGURE = /(?<![\p{L}\d])\d{1,3}(?:[  .]\d{3})*(?:,\d+)?\s*(?:%|‰|€|\$|m³|m3|km\b|kilomètres?|litres?|\bl\b|kg|tonnes?|millions?|milliards?|habitants?|bars?|heures?|jours?|ans\b|mois\b|semaines?|°|kwh|mw|visiteurs?|personnes?|euros?)/iu;

export function hasFigure(text: string): boolean {
  return FIGURE.test(text);
}

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

/** Phrases chiffrées de la source qu'aucune preuve ne recouvre (nombres essentiels oubliés). */
export function numberGaps(segments: SourceSegment[], evidence: Evidence[], max = 10): CaveatGap[] {
  return uncovered(segments, evidence, (t) => hasFigure(t) && !CAVEAT.test(t), max);
}

function uncovered(segments: SourceSegment[], evidence: Evidence[], keep: (sentence: string) => boolean, max: number): CaveatGap[] {
  const bySegment = new Map<string, Evidence[]>();
  for (const e of evidence) bySegment.set(e.segment_id, [...(bySegment.get(e.segment_id) ?? []), e]);
  const gaps: CaveatGap[] = [];
  for (const seg of segments) {
    for (const s of sentences(seg.text)) {
      if (!keep(s.text)) continue;
      const covered = (bySegment.get(seg.id) ?? []).some((e) => e.start_offset < s.end && e.end_offset > s.start);
      if (!covered) gaps.push({ segment_id: seg.id, sentence: s.text.slice(0, 300) });
      if (gaps.length >= max) return gaps;
    }
  }
  return gaps;
}

export function caveatGaps(segments: SourceSegment[], evidence: Evidence[], max = 10): CaveatGap[] {
  return uncovered(segments, evidence, (t) => CAVEAT.test(t), max);
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

/** Affirmations chiffrées soutenues qu'aucun bloc ne reprend (au plus `max`). */
export function droppedNumberClaims(
  claims: { id: string; numbers: unknown[]; support_status: string }[],
  usedClaimIds: Set<string>,
  max = 8,
): string[] {
  return claims
    .filter((c) => c.support_status === "supported" && c.numbers.length > 0 && !usedClaimIds.has(c.id))
    .slice(0, max)
    .map((c) => c.id);
}

const digits = (t: string) => t.replace(/[\s  ]/g, "").replace(/\./g, ",");

/**
 * Blocs qui citent une affirmation chiffrée sans reprendre ses nombres : la preuve est là,
 * mais le chiffre a disparu du texte lu (au plus `max`).
 */
export function blocksMissingNumbers(
  sections: { blocks: { id: string; type: string; text: string; claim_ids: string[] }[] }[],
  claims: { id: string; numbers: { source_form: string }[] }[],
  max = 8,
): { block_id: string; numbers: string[] }[] {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const out: { block_id: string; numbers: string[] }[] = [];
  for (const b of sections.flatMap((s) => s.blocks)) {
    if (b.type !== "fact" && b.type !== "caution" && b.type !== "definition") continue;
    const text = digits(b.text);
    const missing = b.claim_ids
      .flatMap((id) => byId.get(id)?.numbers ?? [])
      .map((n) => n.source_form)
      .filter((f) => {
        const num = f.match(/\d[\d\s  .,]*\d|\d/)?.[0];
        return !!num && !text.includes(digits(num));
      });
    if (missing.length) out.push({ block_id: b.id, numbers: [...new Set(missing)].slice(0, 6) });
    if (out.length >= max) break;
  }
  return out;
}
