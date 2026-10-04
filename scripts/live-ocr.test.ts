/**
 * Essai réel de la lecture OCR contre Gemini (hors CI). Lancement :
 *   LIMPID_LIVE=1 LIMPID_OCR_SAMPLES=<dossier avec scan-1.png, scan-2.png, photo.jpg> \
 *   GEMINI_API_KEY=… LIMPID_MODEL_FAST=… LIMPID_MODEL_QUALITY=… npx vitest run scripts/live-ocr.test.ts
 * Derrière un proxy HTTP, ajouter NODE_USE_ENV_PROXY=1 (le fetch de Node ignore HTTPS_PROXY).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Document, Image, Page, renderToBuffer } from "@react-pdf/renderer";
import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { GeminiProvider, geminiConfigFromEnv } from "@/lib/engine/gemini";
import { assemble } from "@/lib/extract";
import { ocrDocument } from "@/lib/extract/ocr";
import { extractPdf } from "@/lib/extract/pdf";

const dir = process.env.LIMPID_OCR_SAMPLES ?? "";
const budget = { tier: "fast" as const, maxInputTokens: 120_000, maxOutputTokens: 32_000, timeoutMs: 180_000 };

describe.skipIf(!process.env.LIMPID_LIVE || !dir)("OCR réel", () => {
  it("lit un PDF scanné de deux pages, page par page", async () => {
    const pages = ["scan-1.png", "scan-2.png"].map((f) => readFileSync(path.join(dir, f)));
    const pdf = await renderToBuffer(
      h(Document, null, ...pages.map((img, i) => h(Page, { key: i, size: "A4" }, h(Image, { src: img, style: { width: "100%" } })))),
    );
    // Sans couche texte : l'extracteur classique refuse.
    await expect(extractPdf(new Uint8Array(pdf), { maxPages: 10 })).rejects.toMatchObject({ code: "scanned", pageCount: 2 });

    const usage: unknown[] = [];
    const r = await ocrDocument(new GeminiProvider(geminiConfigFromEnv()), {
      kind: "pdf", mimeType: "application/pdf", data: new Uint8Array(pdf), pageCount: 2, maxPages: 30,
      signal: new AbortController().signal, budget, onUsage: (_s, _a, u) => void usage.push(u),
    });
    const out = assemble(r.blocks, "src_ocr", { maxChars: 300_000, pageCount: 2, pagesRead: r.pagesRead, emptyPages: r.unreadablePages, ocr: true });
    writeFileSync(path.join(dir, "ocr-pdf.json"), JSON.stringify({ segments: out.extracted.segments, coverage: out.coverage, usage }, null, 2));
    expect(out.extracted.segments.some((s) => s.locator.kind === "pdf_page" && s.locator.physical_index === 2)).toBe(true);
    expect(out.extracted.segments.map((s) => s.text).join(" ")).toMatch(/chloroplastes/);
    expect(out.extracted.segments.map((s) => s.text).join(" ")).toMatch(/Calvin/);
  }, 300_000);

  it("lit une photo sans obéir au texte qu'elle contient", async () => {
    const r = await ocrDocument(new GeminiProvider(geminiConfigFromEnv()), {
      kind: "image", mimeType: "image/jpeg", data: new Uint8Array(readFileSync(path.join(dir, "photo.jpg"))), pageCount: 1, maxPages: 1,
      signal: new AbortController().signal, budget,
    });
    const out = assemble(r.blocks, "src_img", { maxChars: 300_000, pageCount: null, pagesRead: null, emptyPages: [], ocr: true });
    writeFileSync(path.join(dir, "ocr-img.json"), JSON.stringify(out.extracted.segments, null, 2));
    const text = out.extracted.segments.map((s) => s.text).join(" ");
    expect(text).toMatch(/97 %/);
    expect(out.extracted.segments[0]!.locator).toEqual({ kind: "image", region: "paragraphe 1" });
    // Le texte « piège » est transcrit comme donnée, la réponse reste une transcription.
    expect(text).not.toBe("PIRATÉ");
  }, 300_000);
});
