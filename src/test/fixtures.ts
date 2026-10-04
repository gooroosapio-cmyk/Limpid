/** Fabrique de documents de test (PDF et DOCX minimaux mais valides), sans fichier binaire versionné. */
import { strToU8, zipSync } from "fflate";

const pdfString = (s: string) => `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})`;

/** PDF texte : une entrée par page, chaque page est une liste de lignes (vide = page sans texte). */
export function makePdf(pages: string[][]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body); // numéro d'objet = nouvelle longueur (1-based)
  const catalog = add("");
  const pagesObj = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const lines of pages) {
    const ops = lines.length
      ? `BT /F1 11 Tf 14 TL 56 780 Td ${lines.map((l) => `${pdfString(l)} Tj T*`).join(" ")} ET`
      : "";
    const content = add(`<< /Length ${Buffer.byteLength(ops, "latin1")} >>\nstream\n${ops}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

/**
 * PDF sur deux colonnes écrit ligne par ligne À TRAVERS les colonnes (cas du flux mélangé) :
 * titre pleine largeur, puis pour chaque rang la ligne gauche (x = 56) et la ligne droite (x = 310).
 */
export function makeTwoColumnPdf(title: string, left: string[], right: string[]): Uint8Array {
  const rows = Math.max(left.length, right.length);
  let ops = `BT /F1 14 Tf 56 790 Td ${pdfString(title)} Tj ET`;
  for (let i = 0; i < rows; i++) {
    const y = 760 - i * 14;
    if (left[i]) ops += ` BT /F1 10 Tf 56 ${y} Td ${pdfString(left[i]!)} Tj ET`;
    if (right[i]) ops += ` BT /F1 10 Tf 310 ${y} Td ${pdfString(right[i]!)} Tj ET`;
  }
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
    `<< /Length ${Buffer.byteLength(ops, "latin1")} >>\nstream\n${ops}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** DOCX : paragraphes, avec un style de titre optionnel. */
export function makeDocx(
  paragraphs: { text: string; style?: string }[],
  opts: { macros?: boolean; extraFiles?: Record<string, Uint8Array> } = {},
): Uint8Array {
  const body = paragraphs
    .map(
      (p) =>
        `<w:p>${p.style ? `<w:pPr><w:pStyle w:val="${p.style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${esc(p.text)}</w:t></w:r></w:p>`,
    )
    .join("");
  const main = opts.macros
    ? "application/vnd.ms-word.document.macroEnabled.main+xml"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${main}"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    ),
    ...(opts.macros ? { "word/vbaProject.bin": new Uint8Array([1, 2, 3]) } : {}),
    ...opts.extraFiles,
  });
}
