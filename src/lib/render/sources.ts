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
  /** Page (PDF) ou diapositive : rang physique pour l'ordre, libellé imprimé pour l'affichage. */
  page: { kind: "page" | "slide"; index: number; label: string } | null;
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

function pageOf(l: Locator): SourceEntry["page"] {
  if (l.kind === "pdf_page") return { kind: "page", index: l.physical_index, label: l.printed_label || String(l.physical_index) };
  if (l.kind === "slide") return { kind: "slide", index: l.index, label: String(l.index) };
  return null;
}

/**
 * Renvoi compact d'un passage (retour lecteur) : « p. 79 », « p. 79–81 », « p. 79, 84 » ou
 * « p. 79 +3 » au lieu d'une suite de numéros ; null sans page connue (pastille « Source »).
 */
export function refLabel(entries: SourceEntry[], words: { page: string; slide: string } = { page: "p.", slide: "diapo" }): string | null {
  const withPage = entries.flatMap((e) => (e.page ? [e.page] : []));
  if (!withPage.length) return null;
  const kind = withPage.some((p) => p.kind === "page") ? "page" : "slide";
  const byIndex = new Map(withPage.filter((p) => p.kind === kind).map((p) => [p.index, p.label]));
  const idx = [...byIndex.keys()].sort((a, b) => a - b);
  const labels = idx.map((i) => byIndex.get(i)!);
  const prefix = kind === "page" ? words.page : words.slide;
  if (labels.length === 1) return `${prefix} ${labels[0]}`;
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1]! + 1);
  if (contiguous) return `${prefix} ${labels[0]}–${labels[labels.length - 1]}`;
  if (labels.length === 2) return `${prefix} ${labels[0]}, ${labels[1]}`;
  return `${prefix} ${labels[0]} +${labels.length - 1}`;
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
      return [{ n, evidenceId: e.id, document, location: document ? `${document}, ${where}` : where, page: pageOf(seg.locator), ...contextOf(seg, e) }];
    })
    .sort((a, b) => a.n - b.n);
  return { numbers, entries };
}
