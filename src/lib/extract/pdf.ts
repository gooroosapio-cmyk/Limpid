/**
 * Extraction du texte d'un PDF (couche texte uniquement ; les PDF scannés passent par
 * l'OCR, voir ocr.ts). Aucun script du PDF n'est exécuté : pdf.js est utilisé sans
 * formulaires XFA ni chargement de polices, et seules les pages autorisées sont lues.
 */
import "server-only";
import { getDocumentProxy } from "unpdf";
import { ExtractionError, type TextBlock } from "./text";

/** En dessous de ce nombre de caractères utiles, une page est considérée comme sans texte. */
const MIN_PAGE_CHARS = 25;

export interface PdfText {
  blocks: TextBlock[];
  pageCount: number;
  /** Pages lues (bornées par `maxPages`). */
  pagesRead: number;
  /** Pages sans couche texte (scannées, images, vides). */
  emptyPages: number[];
}

interface TextItemLike {
  str?: string;
  hasEOL?: boolean;
}

/** Recolle les lignes d'une page : césures en fin de ligne supprimées, retours à la ligne en espaces. */
export function joinPdfLines(raw: string): string {
  return raw
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
    .replace(/[ \t]*\n[ \t]*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function extractPdf(data: Uint8Array, opts: { maxPages: number }): Promise<PdfText> {
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(data), {
      disableFontFace: true,
      enableXfa: false,
      useSystemFonts: false,
      stopAtErrors: false,
    });
  } catch (e) {
    const name = (e as { name?: string }).name ?? "";
    if (name === "PasswordException") {
      throw new ExtractionError("encrypted", "Ce PDF est protégé par un mot de passe. Retirez la protection puis réessayez.");
    }
    throw new ExtractionError("corrupt", "Ce PDF est illisible ou endommagé.");
  }

  try {
    const pageCount = pdf.numPages;
    const pagesRead = Math.min(pageCount, opts.maxPages);
    const labels: (string | null)[] | null = await pdf.getPageLabels().catch(() => null);
    const blocks: TextBlock[] = [];
    const emptyPages: number[] = [];

    for (let n = 1; n <= pagesRead; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const raw = (content.items as TextItemLike[]).map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : "")).join("");
      page.cleanup();
      const text = joinPdfLines(raw);
      if (text.replace(/\s/g, "").length < MIN_PAGE_CHARS) {
        emptyPages.push(n);
        continue;
      }
      const label = labels?.[n - 1] ?? null;
      blocks.push({ text, page: n, pageLabel: label && label !== String(n) ? label : null });
    }

    if (blocks.length === 0) {
      throw new ExtractionError(
        "scanned",
        "Ce PDF ne contient pas de texte sélectionnable (document scanné ou composé d'images).",
        pageCount,
      );
    }
    return { blocks, pageCount, pagesRead, emptyPages };
  } finally {
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
}
