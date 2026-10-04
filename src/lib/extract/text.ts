/**
 * Extraction du texte collé et des fichiers TXT en segments sources (payload 2, § 5).
 * Le texte est normalisé une fois puis figé : les offsets des preuves s'y rapportent.
 */
import { createHash } from "node:crypto";
import type { SourceSegment } from "@/lib/contracts/schemas";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Taille cible d'un segment : assez court pour citer, assez long pour garder le contexte. */
const MAX_SEGMENT_CHARS = 1_500;

export class ExtractionError extends Error {
  constructor(public readonly code: "empty" | "too_long" | "binary", message: string) {
    super(message);
  }
}

/** Normalisation figée : fins de ligne, espaces insécables, caractères de contrôle. */
export function normalizeSourceText(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[  ]/g, " ")
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
function isHeading(block: string): boolean {
  return !block.includes("\n") && block.length <= 120 && !/[.!?:;,…]$/.test(block);
}

export interface ExtractedText {
  sourceVersion: string;
  segments: SourceSegment[];
  charCount: number;
}

export function segmentText(raw: string, sourceId: string, opts: { maxChars: number }): ExtractedText {
  if (raw.includes("\u0000")) throw new ExtractionError("binary", "Le fichier ne contient pas du texte lisible.");
  const text = normalizeSourceText(raw);
  if (!text) throw new ExtractionError("empty", "Le texte est vide.");
  if (text.length > opts.maxChars) throw new ExtractionError("too_long", "Le texte dépasse la longueur autorisée.");

  const sourceVersion = sha(text);
  const segments: SourceSegment[] = [];
  const headingPath: string[] = [];
  let paragraph = 0;

  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  blocks.forEach((block, i) => {
    if (isHeading(block) && i < blocks.length - 1) {
      headingPath.splice(0, headingPath.length, block.slice(0, 300));
      return;
    }
    for (const part of splitLong(block.replace(/\n/g, " "))) {
      paragraph += 1;
      segments.push({
        id: `seg_${paragraph}`,
        source_id: sourceId,
        source_version: sourceVersion,
        locator: { kind: "section", heading_path: [...headingPath], paragraph },
        text: part,
        content_hash: sha(part),
        extraction_warnings: [],
      });
    }
  });
  if (segments.length === 0) throw new ExtractionError("empty", "Aucun paragraphe exploitable.");
  return { sourceVersion, segments, charCount: text.length };
}
