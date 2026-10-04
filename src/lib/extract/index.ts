/**
 * Point d'entrée de l'extraction : du contenu brut (fichier, page web, texte) aux segments
 * figés, avec la couverture réellement obtenue (pages lues, pages sans texte, troncature).
 */
import "server-only";
import { extractDocx } from "./docx";
import { decodeHtml, extractHtml } from "./html";
import { extractPdf } from "./pdf";
import { blocksFromPlainText, buildSegments, ExtractionError, type ExtractedText, type TextBlock } from "./text";

export { ExtractionError } from "./text";

export type ExtractableKind = "pdf" | "docx" | "txt" | "html";

export interface SourceCoverage {
  segments_total: number;
  segments_processed: number;
  partial: boolean;
  /** Pages sans couche texte (PDF). */
  empty_pages: number[];
  /** Remarques publiques affichées avec le rapport. */
  notes: string[];
}

export interface ExtractionResult {
  extracted: ExtractedText;
  pageCount: number | null;
  coverage: SourceCoverage;
  /** Titre trouvé dans le document (page web). */
  title: string | null;
}

function pageList(pages: number[]): string {
  if (pages.length <= 8) return pages.join(", ");
  return `${pages.slice(0, 8).join(", ")}… (${pages.length} pages)`;
}

export async function extractSource(
  kind: ExtractableKind,
  data: Uint8Array,
  sourceId: string,
  opts: { maxChars: number; maxPages: number; charset?: string | null },
): Promise<ExtractionResult> {
  let blocks: TextBlock[];
  let pageCount: number | null = null;
  let pagesRead: number | null = null;
  let emptyPages: number[] = [];
  let title: string | null = null;

  switch (kind) {
    case "pdf": {
      const pdf = await extractPdf(data, { maxPages: opts.maxPages });
      ({ blocks, pageCount, pagesRead, emptyPages } = pdf);
      break;
    }
    case "docx":
      blocks = extractDocx(data);
      break;
    case "html": {
      const article = extractHtml(decodeHtml(data, opts.charset ?? null));
      blocks = article.blocks;
      title = article.title;
      break;
    }
    case "txt": {
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(data);
      } catch {
        throw new ExtractionError("binary", "Le fichier texte doit être encodé en UTF-8.");
      }
      blocks = blocksFromPlainText(text.replace(/^﻿/, ""));
      break;
    }
  }

  return { ...assemble(blocks, sourceId, { maxChars: opts.maxChars, pageCount, pagesRead, emptyPages, ocr: false }), title };
}

/**
 * Segments et couverture à partir des blocs extraits : pages non lues, troncature, pages
 * sans texte, lecture OCR. Les remarques sont publiques et affichées avec le rapport.
 */
export function assemble(
  blocks: TextBlock[],
  sourceId: string,
  info: { maxChars: number; pageCount: number | null; pagesRead: number | null; emptyPages: number[]; ocr: boolean },
): Omit<ExtractionResult, "title"> {
  const extracted = buildSegments(blocks, sourceId, { maxChars: info.maxChars, truncate: true });
  const notes: string[] = [];
  if (info.ocr) notes.push("Texte reconnu automatiquement (OCR) : de petites erreurs de lecture sont possibles.");
  if (info.pageCount !== null && info.pagesRead !== null && info.pagesRead < info.pageCount) {
    notes.push(`Seules les ${info.pagesRead} premières pages sur ${info.pageCount} ont été lues.`);
  }
  if (extracted.truncated) {
    notes.push(
      extracted.lastPage !== null
        ? `Le document est trop long : le rapport s'arrête à la page ${extracted.lastPage}.`
        : "Le document est trop long : seule sa première partie a été analysée.",
    );
  }
  const unreadable = info.emptyPages.filter((p) => extracted.lastPage === null || p <= extracted.lastPage);
  if (unreadable.length) notes.push(`Pages sans texte lisible (scannées ou images) : ${pageList(unreadable)}.`);

  return {
    extracted,
    pageCount: info.pageCount,
    coverage: {
      segments_total: extracted.segments.length,
      segments_processed: extracted.segments.length,
      // La lecture OCR seule n'est pas une couverture partielle : elle est signalée à part.
      partial: notes.length > (info.ocr ? 1 : 0),
      empty_pages: unreadable.slice(0, 500),
      notes,
    },
  };
}
