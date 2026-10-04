/**
 * Découpage des textes extraits en segments sources (payload 2, § 5).
 * Chaque bloc est normalisé une fois puis figé : les offsets des preuves s'y rapportent.
 * Texte collé, TXT, DOCX, pages web et PDF passent tous par `buildSegments`.
 */
import { createHash } from "node:crypto";
import type { Locator, SourceSegment } from "@/lib/contracts/schemas";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Taille cible d'un segment : assez court pour citer, assez long pour garder le contexte. */
const MAX_SEGMENT_CHARS = 1_500;

export type ExtractionCode =
  | "empty"
  | "too_long"
  | "binary"
  | "scanned"
  | "encrypted"
  | "macros"
  | "corrupt"
  | "unsupported";

export class ExtractionError extends Error {
  constructor(
    public readonly code: ExtractionCode,
    message: string,
    /** Nombre de pages du document, quand il est connu (PDF scanné : pour l'OCR). */
    public readonly pageCount?: number,
  ) {
    super(message);
  }
}

/** Normalisation figée : fins de ligne, espaces insécables, caractères de contrôle. */
export function normalizeSourceText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[  ]/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Découpe un paragraphe trop long en phrases regroupées sous la taille cible. */
function splitLong(paragraph: string): string[] {
  if (paragraph.length <= MAX_SEGMENT_CHARS) return [paragraph];
  const sentences = paragraph.match(/[^.!?…]+(?:[.!?…]+["»”)]?\s*|$)/g) ?? [paragraph];
  const out: string[] = [];
  let current = "";
  for (const s of sentences) {
    if (current && current.length + s.length > MAX_SEGMENT_CHARS) {
      out.push(current.trim());
      current = "";
    }
    // Phrase isolée plus longue que la cible : coupe dure, sans perte de texte.
    if (s.length > MAX_SEGMENT_CHARS) {
      for (let i = 0; i < s.length; i += MAX_SEGMENT_CHARS) out.push(s.slice(i, i + MAX_SEGMENT_CHARS).trim());
      continue;
    }
    current += s;
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}

/** Les lignes courtes sans ponctuation finale, suivies d'un paragraphe, sont traitées comme des titres. */
function looksLikeHeading(block: string): boolean {
  return !block.includes("\n") && block.length <= 120 && !/[.!?:;,…]$/.test(block);
}

/** Un bloc extrait : paragraphe, titre (DOCX, HTML, heuristique) ou page entière (PDF). */
export interface TextBlock {
  text: string;
  heading?: boolean;
  /** Page physique (PDF) : le segment est alors localisé par page. */
  page?: number;
  pageLabel?: string | null;
  /** Texte lu dans une image : localisé « image, paragraphe n ». */
  image?: boolean;
  /** Avertissements d'extraction recopiés sur les segments (ex. lecture OCR). */
  warnings?: string[];
}

export interface ExtractedText {
  sourceVersion: string;
  segments: SourceSegment[];
  charCount: number;
  /** Vrai si des blocs ont été écartés pour respecter la longueur maximale. */
  truncated: boolean;
  /** Dernière page prise en compte (PDF). */
  lastPage: number | null;
}

/**
 * Construit les segments à partir de blocs. Au-delà de `maxChars`, soit l'extraction est
 * refusée (`truncate: false`, texte collé), soit les blocs suivants sont écartés et le
 * résultat est marqué tronqué (fichiers, pages web : couverture partielle affichée).
 */
export function buildSegments(
  blocks: TextBlock[],
  sourceId: string,
  opts: { maxChars: number; truncate: boolean },
): ExtractedText {
  const kept: (Omit<TextBlock, "heading"> & { heading: boolean })[] = [];
  let charCount = 0;
  let truncated = false;
  for (const b of blocks) {
    const text = normalizeSourceText(b.text);
    if (!text) continue;
    if (charCount + text.length > opts.maxChars) {
      if (!opts.truncate) throw new ExtractionError("too_long", "Le texte dépasse la longueur autorisée.");
      truncated = true;
      break;
    }
    charCount += text.length + 2;
    kept.push({ ...b, text, heading: !!b.heading });
  }
  if (kept.length === 0) {
    throw new ExtractionError(truncated ? "too_long" : "empty", truncated ? "Le texte dépasse la longueur autorisée." : "Le texte est vide.");
  }

  const sourceVersion = sha(kept.map((k) => k.text).join("\n\n"));
  const segments: SourceSegment[] = [];
  const headingPath: string[] = [];
  let paragraph = 0;
  let lastPage: number | null = null;

  kept.forEach((block, i) => {
    // Un titre en dernière position n'introduit rien : il est gardé comme texte.
    if (block.heading && block.page === undefined && i < kept.length - 1) {
      headingPath.splice(0, headingPath.length, block.text.replace(/\n/g, " ").slice(0, 300));
      return;
    }
    if (block.page !== undefined) lastPage = block.page;
    for (const part of splitLong(block.text.replace(/\n/g, " "))) {
      paragraph += 1;
      const locator: Locator =
        block.page !== undefined
          ? { kind: "pdf_page", physical_index: block.page, printed_label: block.pageLabel?.slice(0, 20) ?? null }
          : block.image
            ? { kind: "image", region: `paragraphe ${paragraph}` }
            : { kind: "section", heading_path: [...headingPath], paragraph };
      segments.push({
        id: `seg_${paragraph}`,
        source_id: sourceId,
        source_version: sourceVersion,
        locator,
        text: part,
        content_hash: sha(part),
        extraction_warnings: (block.warnings ?? []).slice(0, 20),
      });
    }
  });
  if (segments.length === 0) throw new ExtractionError("empty", "Aucun paragraphe exploitable.");
  return { sourceVersion, segments, charCount: Math.max(0, charCount - 2), truncated, lastPage };
}

/** Texte brut (collé ou TXT) : paragraphes séparés par des lignes vides, titres devinés. */
export function blocksFromPlainText(raw: string): TextBlock[] {
  if (raw.includes("\u0000")) throw new ExtractionError("binary", "Le fichier ne contient pas du texte lisible.");
  const text = normalizeSourceText(raw);
  return text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => ({ text: b, heading: looksLikeHeading(b) }));
}

/** Texte collé : refusé au-delà de la limite (le formulaire l'empêche déjà). */
export function segmentText(raw: string, sourceId: string, opts: { maxChars: number }): ExtractedText {
  const blocks = blocksFromPlainText(raw);
  if (blocks.length === 0) throw new ExtractionError("empty", "Le texte est vide.");
  return buildSegments(blocks, sourceId, { maxChars: opts.maxChars, truncate: false });
}
