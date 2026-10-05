/**
 * Numérotation et présentation des sources, partagées par le lecteur et l'export PDF :
 * le numéro [n] d'une preuve est le même à l'écran et sur papier.
 */
import type { Evidence, Locator, ReportBlueprint, SourceSegment } from "@/lib/contracts/schemas";

export interface SourceEntry {
  n: number;
  /** Document cité (Limpid commun : plusieurs documents). */
  document: string | null;
  evidenceId: string;
  location: string;
  before: string;
  quote: string;
  after: string;
}

export function describeLocator(l: Locator): string {
  switch (l.kind) {
    case "pdf_page":
      return l.printed_label ? `page ${l.physical_index} (numérotée ${l.printed_label})` : `page ${l.physical_index}`;
    case "section":
      return [...l.heading_path, `paragraphe ${l.paragraph}`].join(" › ");
    case "slide":
      return `diapositive ${l.index}`;
    case "image":
      return l.region ? `image, ${l.region}` : "image";
  }
}

function contextOf(seg: SourceSegment, e: Evidence) {
  const before = seg.text.slice(Math.max(0, e.start_offset - 120), e.start_offset).trim();
  const after = seg.text.slice(e.end_offset, e.end_offset + 120).trim();
  return { before, quote: seg.text.slice(e.start_offset, e.end_offset), after };
}

/**
 * Numéros des preuves dans l'ordre de l'index du rapport, et entrées affichables.
 * `documents` (titre par source `src_…`) : avec plusieurs documents, chaque référence
 * nomme son document avant la page.
 */
export function sourceEntries(blueprint: ReportBlueprint, evidence: Evidence[], segments: SourceSegment[], documents?: Record<string, string>) {
  const multi = !!documents && Object.keys(documents).length > 1;
  const numbers = new Map(blueprint.source_index.map((id, i) => [id, i + 1]));
  const segById = new Map(segments.map((s) => [s.id, s]));
  const entries: SourceEntry[] = evidence
    .flatMap((e) => {
      const seg = segById.get(e.segment_id);
      const n = numbers.get(e.id);
      if (!seg || !n) return [];
      const document = multi ? (documents![seg.source_id] ?? null) : null;
      const where = describeLocator(seg.locator);
      return [{ n, evidenceId: e.id, document, location: document ? `${document}, ${where}` : where, ...contextOf(seg, e) }];
    })
    .sort((a, b) => a.n - b.n);
  return { numbers, entries };
}
