import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { makeDocx, makePdf, makeTwoColumnPdf } from "@/test/fixtures";
import { columnText, type PositionedItem } from "./columns";
import { blocksFromDocumentXml, decodeXmlEntities } from "./docx";
import { decodeHtml, extractHtml } from "./html";
import { extractSource, ExtractionError } from "./index";
import { joinPdfLines } from "./pdf";

const opts = { maxChars: 100_000, maxPages: 100 };
const LINE = "La photosynthèse transforme la lumière en énergie chimique dans les feuilles.";

async function rejects(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(ExtractionError);
  await expect(p).rejects.toMatchObject({ code });
}

describe("PDF", () => {
  it("extrait le texte page par page avec un localisateur de page", async () => {
    const pdf = makePdf([[LINE, "Elle produit du dioxygène."], ["Deuxième page : la chlorophylle capte la lumière rouge et bleue."]]);
    const r = await extractSource("pdf", pdf, "src_p", opts);
    expect(r.pageCount).toBe(2);
    expect(r.extracted.segments).toHaveLength(2);
    expect(r.extracted.segments[0]!.locator).toEqual({ kind: "pdf_page", physical_index: 1, printed_label: null });
    expect(r.extracted.segments[0]!.text).toBe(`${LINE} Elle produit du dioxygène.`);
    expect(r.extracted.segments[1]!.locator).toMatchObject({ physical_index: 2 });
    expect(r.coverage.partial).toBe(false);
  });

  it("signale les pages sans texte et la limite de pages", async () => {
    const pdf = makePdf([[LINE], [], [LINE], [LINE]]);
    const r = await extractSource("pdf", pdf, "src_p", { ...opts, maxPages: 3 });
    expect(r.extracted.segments.map((s) => (s.locator as { physical_index: number }).physical_index)).toEqual([1, 3]);
    expect(r.coverage.partial).toBe(true);
    expect(r.coverage.empty_pages).toEqual([2]);
    expect(r.coverage.notes.join(" ")).toContain("3 premières pages sur 4");
  });

  it("refuse un PDF sans couche texte (scanné)", async () => {
    await rejects(extractSource("pdf", makePdf([[], []]), "src_p", opts), "scanned");
  });

  it("refuse un PDF endommagé", async () => {
    await rejects(extractSource("pdf", strToU8("%PDF-1.4\nn'importe quoi"), "src_p", opts), "corrupt");
  });

  it("tronque un document trop long à la page près", async () => {
    const pdf = makePdf([[LINE], [LINE], [LINE]]);
    const r = await extractSource("pdf", pdf, "src_p", { ...opts, maxChars: LINE.length * 2 + 2 });
    expect(r.extracted.segments).toHaveLength(2);
    expect(r.coverage.notes.join(" ")).toContain("page 2");
  });

  it("recolle les césures et les lignes", () => {
    expect(joinPdfLines("la photo-\nsynthèse est\nun processus")).toBe("la photosynthèse est un processus");
    expect(joinPdfLines("Jean-\nPierre")).toBe("Jean- Pierre");
  });
});

describe("DOCX", () => {
  it("extrait paragraphes et titres", async () => {
    const docx = makeDocx([
      { text: "Introduction", style: "Heading1" },
      { text: "Le texte & ses <balises> sont décodés." },
      { text: "Deuxième partie", style: "Titre2" },
      { text: "Un autre paragraphe." },
    ]);
    const r = await extractSource("docx", docx, "src_d", opts);
    expect(r.extracted.segments).toHaveLength(2);
    expect(r.extracted.segments[0]!.text).toBe("Le texte & ses <balises> sont décodés.");
    expect(r.extracted.segments[0]!.locator).toEqual({ kind: "section", heading_path: ["Introduction"], paragraph: 1 });
    expect(r.extracted.segments[1]!.locator).toMatchObject({ heading_path: ["Deuxième partie"] });
  });

  it("refuse les documents à macros", async () => {
    await rejects(extractSource("docx", makeDocx([{ text: "x" }], { macros: true }), "src_d", opts), "macros");
  });

  it("refuse une archive ZIP qui n'est pas un DOCX", async () => {
    const zip = zipSync({ "a.txt": strToU8("bonjour") });
    await rejects(extractSource("docx", zip, "src_d", opts), "unsupported");
  });

  it("borne la décompression (bombe ZIP)", async () => {
    const huge = new Uint8Array(41 * 1024 * 1024); // 41 Mo de zéros : quelques Ko compressés
    const zip = zipSync({ "[Content_Types].xml": strToU8("x"), "word/document.xml": huge }, { level: 9 });
    expect(zip.length).toBeLessThan(200_000);
    await rejects(extractSource("docx", zip, "src_d", opts), "too_long");
  });

  it("ignore le texte supprimé et les codes de champ, garde tabulations et paragraphes imbriqués", () => {
    const xml =
      '<w:p><w:r><w:t>Avant</w:t></w:r><w:r><w:tab/><w:t>après</w:t></w:r><w:del><w:r><w:delText>supprimé</w:delText></w:r></w:del>' +
      "<w:r><w:instrText>PAGE</w:instrText></w:r></w:p><w:p/><w:p><w:r><w:t>&#233;t&#xE9;</w:t></w:r></w:p>";
    expect(blocksFromDocumentXml(xml).map((b) => b.text)).toEqual(["Avant après", "été"]);
    expect(decodeXmlEntities("&lt;&amp;&#0;&unknown;")).toBe("<&&unknown;");
  });
});

describe("Page web", () => {
  const article = `<!doctype html><html><head><title>Titre de la page</title><script>alert(1)</script></head>
  <body><nav><a href="/">Accueil</a> <a href="/x">Menu</a></nav>
  <article><h1>Les volcans</h1>
  <p>Un volcan est une ouverture de la croûte terrestre par laquelle le magma remonte à la surface. ${"Les éruptions varient selon la viscosité du magma. ".repeat(6)}</p>
  <h2>Types d'éruptions</h2>
  <ul><li>Effusives : la lave coule lentement.</li><li><p>Explosives : les gaz sont piégés.</p></li></ul>
  <p>Texte <em>en ligne</em> et <a href="#">lien</a> conservés dans le paragraphe. ${"La surveillance sismique aide à prévoir les éruptions. ".repeat(4)}</p>
  </article><footer>Mentions légales</footer></body></html>`;

  it("isole l'article, ses titres et ses paragraphes", async () => {
    const r = await extractSource("html", strToU8(article), "src_w", opts);
    const texts = r.extracted.segments.map((s) => s.text);
    expect(r.title).toBeTruthy();
    expect(texts.join(" ")).toContain("Un volcan est une ouverture");
    expect(texts).toContain("Effusives : la lave coule lentement.");
    expect(texts).toContain("Explosives : les gaz sont piégés.");
    expect(texts.some((t) => t.startsWith("Texte en ligne et lien conservés"))).toBe(true);
    expect(texts.join(" ")).not.toMatch(/Accueil|Mentions légales|alert/);
    const typed = r.extracted.segments.find((s) => s.text.startsWith("Effusives"))!;
    expect(typed.locator).toMatchObject({ heading_path: ["Types d'éruptions"] });
  });

  it("se replie sur le corps de la page si aucun article n'est détecté", () => {
    const r = extractHtml("<html><body><div>Un court texte sans structure particulière mais utile.</div></body></html>");
    expect(r.blocks.map((b) => b.text)).toEqual(["Un court texte sans structure particulière mais utile."]);
  });

  it("décode le jeu de caractères annoncé", () => {
    const latin1 = Buffer.from("<meta charset=iso-8859-1><p>été</p>", "latin1");
    expect(decodeHtml(latin1, null)).toContain("été");
    expect(decodeHtml(Buffer.from("<p>été</p>", "utf8"), "utf-8")).toContain("été");
  });
});

describe("TXT", () => {
  it("accepte l'UTF-8 (avec ou sans BOM) et refuse le reste", async () => {
    const r = await extractSource("txt", strToU8("﻿Titre\n\nUn paragraphe."), "src_t", opts);
    expect(r.extracted.segments[0]!.locator).toMatchObject({ heading_path: ["Titre"] });
    await rejects(extractSource("txt", new Uint8Array([0xff, 0xfe, 0x00]), "src_t", opts), "binary");
  });
});

describe("PDF sur deux colonnes", () => {
  const L = Array.from({ length: 10 }, (_, i) => `Colonne gauche ligne ${i + 1} : texte suivi assez long.`);
  const R = Array.from({ length: 10 }, (_, i) => `Colonne droite ligne ${i + 1} : autre texte assez long.`);

  it("reconstruit l'ordre de lecture d'un flux mélangé", async () => {
    const r = await extractSource("pdf", makeTwoColumnPdf("Titre du rapport", L, R), "src_c", opts);
    const text = r.extracted.segments.map((s) => s.text).join(" ");
    const pos = (t: string) => text.indexOf(t);
    expect(pos("Titre du rapport")).toBeLessThan(pos("Colonne gauche ligne 1 "));
    expect(pos("Colonne gauche ligne 10 ")).toBeLessThan(pos("Colonne droite ligne 1 "));
    expect(pos("Colonne droite ligne 9 ")).toBeLessThan(pos("Colonne droite ligne 10 "));
  });

  it("laisse intacts une page à une colonne et un tableau", () => {
    const item = (str: string, x: number, y: number, width: number): PositionedItem => ({ str, transform: [1, 0, 0, 1, x, y], width });
    const single = Array.from({ length: 20 }, (_, i) => item("Une ligne pleine largeur de texte courant qui traverse la page.", 56, 760 - i * 14, 480));
    expect(columnText(single, 595)).toBeNull();
    const table = Array.from({ length: 12 }, (_, i) => [item(`Indicateur ${i}`, 56, 760 - i * 14, 60), item(`${i},5 %`, 330, 760 - i * 14, 30), item(`${i},9 %`, 450, 760 - i * 14, 30)]).flat();
    expect(columnText(table, 595)).toBeNull();
  });
});
