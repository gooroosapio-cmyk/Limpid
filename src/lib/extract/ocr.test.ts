import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { AIProvider, StructuredRequest } from "@/lib/engine/provider";
import { checkImageSize, imageSize } from "@/lib/security/image";
import { assemble } from "./index";
import { ocrDocument, OCR_WARNING } from "./ocr";
import { ExtractionError } from "./text";

const budget = { tier: "fast" as const, maxInputTokens: 1, maxOutputTokens: 1, timeoutMs: 1 };
const PAGE = (n: number) => `Page ${n} : la cellule est l'unité de base du vivant, elle contient un noyau.`;

/** Fournisseur simulé : lit la plage demandée dans les consignes et répond page par page. */
class FakeOcr implements AIProvider {
  readonly name = "fake";
  readonly isDemo = false;
  calls: { first: number; last: number; media: number }[] = [];
  constructor(private readonly answer: (page: number) => { legible: boolean; text: string }, private readonly extra = false) {}
  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>) {
    const m = /pages (\d+) à (\d+)/.exec(req.trustedInstructions);
    const [first, last] = m ? [Number(m[1]), Number(m[2])] : [1, 1];
    this.calls.push({ first, last, media: req.media?.length ?? 0 });
    const pages = [];
    for (let p = first; p <= last; p++) pages.push({ page: p, ...this.answer(p) });
    if (this.extra) pages.push({ page: 999, legible: true, text: "Page hors du lot demandée par personne." });
    return { value: req.schema.parse({ pages }), usage: { provider: "fake", model: "m", inputTokens: 1, outputTokens: 1, durationMs: 1, requestId: null } };
  }
}

const input = (over: Partial<Parameters<typeof ocrDocument>[1]> = {}) => ({
  kind: "pdf" as const,
  mimeType: "application/pdf" as const,
  data: new Uint8Array([1]),
  pageCount: 20,
  maxPages: 30,
  signal: new AbortController().signal,
  budget,
  ...over,
});

describe("lots de pages", () => {
  it("regroupe les pages consécutives par 8 au plus, sans doublon", async () => {
    const { pageRuns } = await import("./ocr");
    expect(pageRuns([5, 2, 3, 3, 9, 10, 11])).toEqual([[2, 3], [5, 5], [9, 11]]);
    expect(pageRuns(Array.from({ length: 10 }, (_, i) => i + 1))).toEqual([[1, 8], [9, 10]]);
  });
});

describe("lecture OCR", () => {
  it("lit un PDF scanné par lots de 8 pages, joint le fichier et localise par page", async () => {
    const fake = new FakeOcr((p) => ({ legible: p !== 5, text: p === 5 ? "" : PAGE(p) }), true);
    const r = await ocrDocument(fake, input());
    expect(fake.calls.map((c) => [c.first, c.last])).toEqual([[1, 8], [9, 16], [17, 20]]);
    expect(fake.calls.every((c) => c.media === 1)).toBe(true);
    expect(r.unreadablePages).toEqual([5]);
    const out = assemble(r.blocks, "src_o", { maxChars: 1e6, pageCount: 20, pagesRead: r.pagesRead, emptyPages: r.unreadablePages, ocr: true });
    expect(out.extracted.segments).toHaveLength(19);
    expect(out.extracted.segments[0]!.locator).toEqual({ kind: "pdf_page", physical_index: 1, printed_label: null });
    expect(out.extracted.segments[0]!.extraction_warnings).toEqual([OCR_WARNING]);
    expect(out.extracted.segments.some((s) => s.text.includes("hors du lot"))).toBe(false);
    expect(out.coverage.notes[0]).toContain("OCR");
    expect(out.coverage.notes.join(" ")).toContain("Pages sans texte lisible");
    expect(out.coverage.partial).toBe(true);
  });

  it("borne le nombre de pages lues", async () => {
    const fake = new FakeOcr((p) => ({ legible: true, text: PAGE(p) }));
    const r = await ocrDocument(fake, input({ pageCount: 50, maxPages: 10 }));
    expect(r.pagesRead).toBe(10);
    const out = assemble(r.blocks, "src_o", { maxChars: 1e6, pageCount: 50, pagesRead: 10, emptyPages: [], ocr: true });
    expect(out.coverage.notes.join(" ")).toContain("10 premières pages sur 50");
  });

  it("découpe une image en paragraphes localisés", async () => {
    const fake = new FakeOcr(() => ({ legible: true, text: `${PAGE(1)}\n\nDeuxième paragraphe, lui aussi assez long pour compter.` }));
    const r = await ocrDocument(fake, input({ kind: "image", mimeType: "image/png", pageCount: 1, maxPages: 1 }));
    const out = assemble(r.blocks, "src_o", { maxChars: 1e6, pageCount: null, pagesRead: null, emptyPages: [], ocr: true });
    expect(out.extracted.segments.map((s) => s.locator)).toEqual([
      { kind: "image", region: "paragraphe 1" },
      { kind: "image", region: "paragraphe 2" },
    ]);
    // La lecture OCR seule est signalée, sans être une couverture partielle.
    expect(out.coverage.partial).toBe(false);
  });

  it("échoue proprement si rien n'est lisible", async () => {
    const fake = new FakeOcr(() => ({ legible: false, text: "" }));
    await expect(ocrDocument(fake, input({ pageCount: 3 }))).rejects.toBeInstanceOf(ExtractionError);
  });
});

describe("dimensions d'image", () => {
  const png = (w: number, h: number) => {
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    return b;
  };
  const jpeg = (w: number, h: number) => {
    // SOI, APP0 (longueur 16), SOF0 (hauteur puis largeur).
    const b = new Uint8Array(2 + 18 + 19);
    b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    b.set([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff], 20);
    return b;
  };
  const webpX = (w: number, h: number) => {
    const b = new Uint8Array(30);
    b.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X")]);
    b.set([(w - 1) & 0xff, ((w - 1) >> 8) & 0xff, ((w - 1) >> 16) & 0xff, (h - 1) & 0xff, ((h - 1) >> 8) & 0xff, ((h - 1) >> 16) & 0xff], 24);
    return b;
  };

  it("lit la taille dans l'en-tête PNG, JPEG et WEBP", () => {
    expect(imageSize(png(1200, 800), "png")).toEqual({ width: 1200, height: 800 });
    expect(imageSize(jpeg(4000, 3000), "jpeg")).toEqual({ width: 4000, height: 3000 });
    expect(imageSize(webpX(2048, 1536), "webp")).toEqual({ width: 2048, height: 1536 });
  });

  it("refuse les images trop grandes ou illisibles", () => {
    expect(() => checkImageSize(png(6000, 4000), "png", 20)).toThrow(/20 mégapixels/);
    expect(() => checkImageSize(png(100_000, 100_000), "png", 20)).toThrow(/mégapixels/);
    expect(() => checkImageSize(new Uint8Array([0xff, 0xd8, 0x00]), "jpeg", 20)).toThrow(/illisible/);
    expect(checkImageSize(jpeg(4000, 3000), "jpeg", 20)).toEqual({ width: 4000, height: 3000 });
  });
});
