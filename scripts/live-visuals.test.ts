/**
 * Recette du lot D (cahier V2, § 8-10) : génération réelle, schémas validés, illustrations
 * Wikimedia Commons réelles, rendu web et PDF dans les trois présentations. Hors CI :
 *   LIMPID_LIVE=1 LIMPID_OUT=<dossier> GEMINI_API_KEY=… LIMPID_MODEL_FAST=… LIMPID_MODEL_QUALITY=… \
 *   npx vitest run scripts/live-visuals.test.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Reader } from "@/components/reader/Reader";
import { THEMES } from "@/lib/contracts/schemas";
import { GeminiProvider, geminiConfigFromEnv } from "@/lib/engine/gemini";
import { generateReport } from "@/lib/engine/pipeline";
import { extractSource } from "@/lib/extract";
import { extractPdf } from "@/lib/extract/pdf";
import { renderReportPdf, type PdfImage } from "@/lib/render/pdf";
import { ChartData, ComparisonData, IllustrationData, type AssetView } from "@/lib/render/visuals";
import { visualConfig } from "@/lib/visuals/config";
import { creditText } from "@/lib/visuals/credit";
import { illustrate, type AssetRow } from "@/lib/visuals/illustrate";
import { downloadCommons, searchCommons, type StoredImage } from "@/lib/visuals/sources";
import { EAU_VILLE_PAGES, EAU_VILLE_TITLE } from "./corpus/eau-ville";

const out = process.env.LIMPID_OUT ?? "";

describe.skipIf(!process.env.LIMPID_LIVE || !out)("recette lot D : visuels réels", () => {
  it("produit schémas validés, illustrations créditées et trois présentations", async () => {
    mkdirSync(out, { recursive: true });
    const source = await renderToBuffer(
      h(Document, null, ...EAU_VILLE_PAGES.map((p, i) => h(Page, { key: i, size: "A4" }, h(Text, null, p.heading), ...p.paragraphs.map((t, j) => h(Text, { key: j }, t)), ...(p.table ?? []).map((r, k) => h(Text, { key: `t${k}` }, r.join(" | ")))))),
    );
    const extraction = await extractSource("pdf", new Uint8Array(source), "src_d", { maxChars: 300_000, maxPages: 100 });
    const segments = extraction.extracted.segments;
    const report = await generateReport(new GeminiProvider(geminiConfigFromEnv()), {
      sourceId: "src_d",
      segments,
      level: "grand_public",
      goal: "comprendre",
      targetPages: 5,
      preferences: { aids: ["exemples", "schemas"], minutes: 7, density: "equilibre", example_domain: "quotidien", familiarity: "bases" },
      signal: new AbortController().signal,
      budgets: {
        comprehension: { tier: "fast", maxInputTokens: 40_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
        explanation: { tier: "quality", maxInputTokens: 40_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
      },
      verifyClaims: true,
      visualMode: "auto",
    });

    // Illustrations : vraie recherche Commons, stockage en mémoire.
    const stored = new Map<string, { img: StoredImage; row: AssetRow }>();
    const t0 = Date.now();
    const ill = await illustrate(report.blueprint, "auto", visualConfig({} as NodeJS.ProcessEnv), {
      searchCommons: (q, t) => searchCommons(q, undefined, t),
      downloadCommons: (c, t) => downloadCommons(c, undefined, t),
      generatedThisMonth: async () => 0,
      store: async (img, ext) => {
        const p = `mem/${stored.size}.${ext}`;
        stored.set(p, { img, row: undefined as never });
        return p;
      },
      insertAsset: async (row) => {
        const id = `00000000-0000-4000-8000-${String(stored.size).padStart(12, "0")}`;
        stored.set(row.storage_path!, { img: stored.get(row.storage_path!)!.img, row: { ...row, id } as AssetRow });
        return id;
      },
    });
    const illustrationMs = Date.now() - t0;
    const blueprint = ill.blueprint;

    const assets: Record<string, AssetView> = {};
    const images: Record<string, PdfImage> = {};
    for (const { img, row } of stored.values()) {
      if (!row) continue;
      const id = (row as AssetRow & { id: string }).id;
      const view: AssetView = { id, src: `data:${img.mime};base64,${img.bytes.toString("base64")}`, width: img.width, height: img.height, provider: "commons", author: row.author, license: row.license, licenseUrl: row.license_url, sourceUrl: row.source_url, modifications: row.modifications, model: null };
      assets[id] = view;
      images[id] = { data: img.bytes, format: img.mime === "image/png" ? "png" : "jpg", width: img.width, height: img.height, credit: creditText(view) };
      writeFileSync(path.join(out, `illustration-${id.slice(-2)}.${img.mime === "image/png" ? "png" : "jpg"}`), img.bytes);
    }

    // Les valeurs des schémas viennent des affirmations validées.
    const claims = new Map(report.knowledge.claims.map((c) => [c.id, c]));
    for (const v of blueprint.visual_specs) {
      if (v.kind === "bar_chart") {
        for (const b of ChartData.parse(v.data).bars) {
          expect(claims.get(b.claim_id)?.numbers.some((n) => n.value === b.value && n.source_form === b.source_form)).toBe(true);
        }
      }
      if (v.kind === "comparison_table") {
        for (const o of ComparisonData.parse(v.data).options) {
          for (const c of o.cells) if (c.text) expect(claims.get(c.claim_id!)?.support_status).toBe("supported");
        }
      }
      if (v.kind === "illustration") expect(IllustrationData.parse(v.data).asset_id).not.toBeNull();
    }

    const pdfTexts: Record<string, string> = {};
    for (const theme of THEMES) {
      const html = renderToStaticMarkup(h(Reader, { blueprint, explanation: report.explanation, evidence: report.evidence, segments, sourceTitle: EAU_VILLE_TITLE, pdfHref: "#", isDemo: false, theme, assets }));
      writeFileSync(path.join(out, `rapport-${theme}.html`), `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="globals.css">${html}`);
      const pdf = await renderReportPdf({ blueprint, explanation: report.explanation, evidence: report.evidence, segments, sourceTitle: EAU_VILLE_TITLE, theme, images });
      writeFileSync(path.join(out, `rapport-${theme}.pdf`), pdf);
      pdfTexts[theme] = (await extractPdf(new Uint8Array(pdf), { maxPages: 50 })).blocks.map((b) => b.text).join(" ");
    }
    const questions = report.explanation.sections.map((s) => s.question);
    for (const theme of THEMES) for (const q of questions) expect(pdfTexts[theme]!.replace(/\s+/g, " ")).toContain(q.replace(/\s+/g, " ").slice(0, 30));
    const credits = Object.values(images).map((i) => i.credit.split(" · ")[1] ?? "");

    const measures = {
      date: new Date().toISOString(),
      status: report.status,
      visuals: blueprint.visual_specs.map((v) => ({ id: v.id, kind: v.kind, caption: v.caption, ...(v.kind === "illustration" ? { query: (v.data as { query: string }).query } : {}) })),
      dropped: report.blueprint.visual_specs.length - blueprint.visual_specs.length,
      layout_warnings: blueprint.layout_warnings,
      illustration_notes: ill.notes,
      illustration_ms: illustrationMs,
      assets: [...stored.values()].filter((x) => x.row).map((x) => ({ license: x.row.license, author: x.row.author, source: x.row.source_url, size: `${x.img.width}x${x.img.height}`, bytes: x.img.bytes.length })),
      credits_in_pdf: { editorial: credits.every((c) => pdfTexts.editorial!.includes(c)), visuel: credits.every((c) => pdfTexts.visuel!.includes(c)), essentiel_sans_image: !credits.some((c) => c && pdfTexts.essentiel!.includes(c)) },
    };
    writeFileSync(path.join(out, "mesures.json"), JSON.stringify(measures, null, 2));
    writeFileSync(path.join(out, "rapport.json"), JSON.stringify({ ...report, blueprint }, null, 2));
    expect(report.status).toBe("validated");
    expect(measures.credits_in_pdf.essentiel_sans_image).toBe(true);
  }, 900_000);
});
