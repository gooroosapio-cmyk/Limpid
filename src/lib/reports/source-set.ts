/**
 * Ensemble de sources d'un Limpid (V5) : un Limpid commun lit plusieurs documents. Les
 * identifiants de segments sont locaux à une source (`seg_14`) ; pour le moteur, ceux d'un
 * ensemble de plusieurs documents sont préfixés par la position du document (`seg_d2-14`),
 * puis ramenés à (source, segment) à l'enregistrement des preuves. Un Limpid à source
 * unique garde ses identifiants d'origine (aucune migration de données).
 */
import { SourceSegment, type Evidence } from "@/lib/contracts/schemas";

/** Nombre de documents au plus dans un Limpid commun. */
export const MAX_SOURCES = 5;

export function engineSegmentId(position: number, segmentId: string, multi: boolean): string {
  return multi ? `seg_d${position + 1}-${segmentId.slice(4)}` : segmentId;
}

/** Position du document et identifiant local d'un segment du moteur. */
export function splitEngineSegmentId(id: string): { position: number; segmentId: string } {
  const m = /^seg_d(\d{1,2})-(.+)$/.exec(id);
  return m ? { position: Number(m[1]) - 1, segmentId: `seg_${m[2]}` } : { position: 0, segmentId: id };
}

/** Page d'un segment (ordre de lecture : les pages lues par OCR rejoignent leur place). */
function pageOf(locator: unknown): number {
  const l = locator as { kind?: string; physical_index?: number };
  return l?.kind === "pdf_page" && typeof l.physical_index === "number" ? l.physical_index : 0;
}

export interface SegmentRow {
  id: string;
  source_version: string;
  locator: unknown;
  text: string;
  content_hash: string;
  extraction_warnings: string[];
  ordinal?: number;
}

/** Segments des documents dans l'ordre (document, page, ordre d'extraction), identifiants du moteur. */
export function engineSegments(bySource: { sourceId: string; rows: SegmentRow[] }[]): SourceSegment[] {
  const multi = bySource.length > 1;
  return bySource.flatMap(({ sourceId, rows }, position) =>
    [...rows]
      .sort((a, b) => pageOf(a.locator) - pageOf(b.locator) || (a.ordinal ?? 0) - (b.ordinal ?? 0))
      .map(({ ordinal: _o, ...r }) => SourceSegment.parse({ ...r, id: engineSegmentId(position, r.id, multi), source_id: `src_${sourceId}` })),
  );
}

/** Preuve du moteur → ligne stockée (source réelle et segment local). */
export function storedEvidence(e: Evidence, sourceIds: string[]): Evidence & { source_id: string } {
  const { position, segmentId } = sourceIds.length > 1 ? splitEngineSegmentId(e.segment_id) : { position: 0, segmentId: e.segment_id };
  const sourceId = sourceIds[position];
  if (!sourceId) throw new Error("segment_source_unknown");
  return { ...e, segment_id: segmentId, source_id: sourceId };
}

/** Ligne stockée → preuve du moteur (identifiant de segment préfixé si plusieurs documents). */
export function engineEvidence<T extends { segment_id: string; source_id?: string | null }>(row: T, sourceIds: string[]): T {
  if (sourceIds.length <= 1) return row;
  const position = Math.max(0, sourceIds.indexOf(String(row.source_id)));
  return { ...row, segment_id: engineSegmentId(position, row.segment_id, true) };
}
