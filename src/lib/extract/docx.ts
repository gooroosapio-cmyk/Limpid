/**
 * Extraction du texte d'un DOCX (payload 1, § 6) : l'archive est lue en flux avec des
 * bornes strictes (nombre d'entrées, taille décompressée : pas de bombe ZIP), les
 * documents à macros sont refusés et seul le corps du document est analysé.
 */
import "server-only";
import { Unzip, UnzipInflate } from "fflate";
import { ExtractionError, type TextBlock } from "./text";

const MAX_ENTRIES = 2_000;
/** Taille décompressée maximale d'une entrée lue (le XML du corps du document). */
const MAX_ENTRY_BYTES = 40 * 1024 * 1024;

const DOCX_MAIN = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

/** Lit certaines entrées d'une archive ZIP, en bornant le nombre d'entrées et la décompression. */
export function readZipEntries(data: Uint8Array, wanted: Set<string>): { names: string[]; files: Map<string, Uint8Array> } {
  const names: string[] = [];
  const files = new Map<string, Uint8Array>();
  let failure: ExtractionError | null = null;

  const unzip = new Unzip((file) => {
    if (failure) return;
    names.push(file.name);
    if (names.length > MAX_ENTRIES) {
      failure = new ExtractionError("corrupt", "Ce document contient trop d'éléments internes.");
      return;
    }
    if (!wanted.has(file.name)) return;
    const chunks: Uint8Array[] = [];
    let total = 0;
    file.ondata = (err, chunk, final) => {
      if (failure) return;
      if (err) {
        failure = new ExtractionError("corrupt", "Ce document est endommagé.");
        return;
      }
      total += chunk.length;
      if (total > MAX_ENTRY_BYTES) {
        failure = new ExtractionError("too_long", "Le contenu décompressé de ce document est trop volumineux.");
        file.terminate();
        return;
      }
      chunks.push(chunk);
      if (final) {
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          out.set(c, off);
          off += c.length;
        }
        files.set(file.name, out);
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    unzip.push(data, true);
  } catch {
    throw new ExtractionError("corrupt", "Ce document est endommagé.");
  }
  if (failure) throw failure;
  return { names, files };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    }
    return ENTITIES[e] ?? m;
  });
}

/** Styles de titre Word, quelle que soit la langue de l'interface (Heading1, Titre1, Title…). */
const HEADING_STYLE = /^(heading|titre|title|berschrift|kop|titolo|encabezado|ttulo)\s*\d*$/i;

/**
 * Parcourt le XML du corps du document : paragraphes (<w:p>), texte (<w:t>), tabulations
 * et sauts de ligne. Le texte supprimé en révision (<w:delText>) et les codes de champ
 * (<w:instrText>) sont ignorés car ce ne sont pas des balises <w:t>.
 */
export function blocksFromDocumentXml(xml: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  const stack: { text: string; heading: boolean }[] = [];
  const tag = /<(\/?)w:(p|t|tab|br|cr|pStyle)\b([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml))) {
    const [, closing, name, attrs, selfClosing] = m;
    const current = stack[stack.length - 1];
    if (name === "p") {
      if (closing) {
        const p = stack.pop();
        const text = p?.text.replace(/[ \t]+/g, " ").trim();
        if (p && text) blocks.push({ text, heading: p.heading && text.length <= 300 });
      } else if (selfClosing) {
        continue;
      } else {
        stack.push({ text: "", heading: false });
      }
    } else if (name === "t" && !closing && !selfClosing) {
      const end = xml.indexOf("</w:t>", tag.lastIndex);
      if (end < 0) break;
      if (current) current.text += decodeXmlEntities(xml.slice(tag.lastIndex, end));
      tag.lastIndex = end + 6;
    } else if ((name === "tab" || name === "br" || name === "cr") && current) {
      current.text += " ";
    } else if (name === "pStyle" && current) {
      const val = /w:val="([^"]*)"/.exec(attrs ?? "")?.[1] ?? "";
      if (HEADING_STYLE.test(val.replace(/[^A-Za-z0-9]/g, ""))) current.heading = true;
    }
  }
  return blocks;
}

export function extractDocx(data: Uint8Array): TextBlock[] {
  const { names, files } = readZipEntries(data, new Set(["[Content_Types].xml", "word/document.xml"]));
  const types = files.get("[Content_Types].xml");
  const body = files.get("word/document.xml");
  if (!types || !body) throw new ExtractionError("unsupported", "Ce fichier n'est pas un document Word (DOCX) valide.");

  const typesXml = new TextDecoder().decode(types);
  if (names.some((n) => /vbaProject\.bin$/i.test(n)) || /macroEnabled/i.test(typesXml)) {
    throw new ExtractionError("macros", "Les documents contenant des macros sont refusés. Enregistrez-le en DOCX sans macros.");
  }
  if (!typesXml.includes(DOCX_MAIN)) {
    throw new ExtractionError("unsupported", "Ce fichier n'est pas un document Word (DOCX) valide.");
  }

  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new ExtractionError("corrupt", "Ce document est endommagé.");
  }
  const blocks = blocksFromDocumentXml(xml);
  if (blocks.length === 0) throw new ExtractionError("empty", "Ce document ne contient pas de texte.");
  return blocks;
}
