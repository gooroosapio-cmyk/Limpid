/**
 * Détection du type réel d'un fichier par sa signature (payload 1, § 6).
 * L'extension et le type MIME déclarés doivent concorder avec la signature ;
 * sinon le fichier est refusé. Aucun fichier importé n'est jamais exécuté.
 */

export type DetectedKind = "pdf" | "docx" | "png" | "jpeg" | "webp" | "txt";

export const ACCEPTED: Record<DetectedKind, { extensions: string[]; mimes: string[] }> = {
  pdf: { extensions: ["pdf"], mimes: ["application/pdf"] },
  docx: {
    extensions: ["docx"],
    mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
  png: { extensions: ["png"], mimes: ["image/png"] },
  jpeg: { extensions: ["jpg", "jpeg"], mimes: ["image/jpeg"] },
  webp: { extensions: ["webp"], mimes: ["image/webp"] },
  txt: { extensions: ["txt"], mimes: ["text/plain"] },
};

export class FileRejected extends Error {
  constructor(
    public readonly code: "empty" | "too_large" | "unknown_type" | "type_mismatch" | "binary_text",
    message: string,
  ) {
    super(message);
  }
}

function startsWith(buf: Uint8Array, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  return sig.every((b, i) => buf[offset + i] === b);
}

/** Vérifie qu'un tampon est de l'UTF-8 valide sans caractère de contrôle binaire. */
export function isPlainUtf8(buf: Uint8Array): boolean {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    // NUL et contrôles C0 hors tabulation/retours : signe d'un binaire.
    return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
  } catch {
    return false;
  }
}

export function sniff(buf: Uint8Array): DetectedKind | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  // Conteneur ZIP : seul un DOCX est accepté ; sa structure interne est contrôlée à l'extraction.
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return "docx";
  if (isPlainUtf8(buf)) return "txt";
  return null;
}

export function checkUpload(
  buf: Uint8Array,
  fileName: string,
  declaredMime: string,
  maxBytes: number,
): DetectedKind {
  if (buf.length === 0) throw new FileRejected("empty", "Le fichier est vide.");
  if (buf.length > maxBytes) throw new FileRejected("too_large", "Le fichier dépasse la taille autorisée.");
  const kind = sniff(buf);
  if (!kind) throw new FileRejected("unknown_type", "Ce type de fichier n'est pas pris en charge.");
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const accepted = ACCEPTED[kind];
  const mime = declaredMime.split(";")[0]!.trim().toLowerCase();
  if (!accepted.extensions.includes(ext) || (mime && mime !== "application/octet-stream" && !accepted.mimes.includes(mime))) {
    throw new FileRejected("type_mismatch", "Le contenu du fichier ne correspond pas à son extension.");
  }
  return kind;
}
