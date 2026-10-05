/**
 * Recette du lot B (cahier V2) : tranche complète réelle, sans aucun résultat simulé.
 * PDF natif → extraction → Gemini (compréhension, explication) → lecteur web → export PDF,
 * avec contrôles de fidélité et de parité web/PDF, et mesures par étape. Hors CI :
 *   LIMPID_LIVE=1 LIMPID_OUT=<dossier> GEMINI_API_KEY=… LIMPID_MODEL_FAST=… LIMPID_MODEL_QUALITY=… \
 *   npx vitest run scripts/live-slice.test.ts
 * Derrière un proxy HTTP, ajouter NODE_USE_ENV_PROXY=1.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Reader } from "@/components/reader/Reader";
import { estimateCents } from "@/lib/budget";
import { GeminiProvider, geminiConfigFromEnv } from "@/lib/engine/gemini";
import { generateReport } from "@/lib/engine/pipeline";
import type { UsageReport } from "@/lib/engine/provider";
import { extractSource } from "@/lib/extract";
import { extractPdf } from "@/lib/extract/pdf";
import { renderReportPdf } from "@/lib/render/pdf";
import { sourceEntries } from "@/lib/render/sources";
import { EAU_VILLE_PAGES, EAU_VILLE_TITLE } from "./corpus/eau-ville";

const out = process.env.LIMPID_OUT ?? "";
const s = StyleSheet.create({
  page: { padding: 48, fontSize: 11, lineHeight: 1.5 },
  title: { fontSize: 18, marginBottom: 16 },
  h: { fontSize: 14, marginBottom: 8 },
  p: { marginBottom: 8 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#999" },
  cell: { flex: 1, padding: 4 },
});

/** PDF natif (couche texte) du corpus : une section par page, tableau en lignes. */
function corpusPdf() {
  return renderToBuffer(
    h(
      Document,
      null,
      ...EAU_VILLE_PAGES.map((p, i) =>
        h(
          Page,
          { key: i, size: "A4", style: s.page },
          i === 0 ? h(Text, { style: s.title }, EAU_VILLE_TITLE) : null,
          h(Text, { style: s.h }, p.heading),
          ...p.paragraphs.map((t, j) => h(Text, { key: j, style: s.p }, t)),
          p.table
            ? h(View, null, ...p.table.map((r, k) => h(View, { key: k, style: s.row }, ...r.map((c, m) => h(Text, { key: m, style: s.cell }, c)))))
            : null,
        ),
      ),
    ),
  );
}

const norm = (t: string) => t.normalize("NFC").replace(/[’']/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

/** Idées essentielles attendues dans le rapport (couverture), avec une marque textuelle. */
const ESSENTIALS: [string, RegExp][] = [
  ["production en baisse (3,9 millions m³)", /3,9/],
  ["consommation de 148 litres", /148/],
  ["objectif de 135 litres", /135/],
  ["rendement passé à 79,5 %", /79,5/],
  ["causes : conduites remplacées / capteurs", /capteur|conduite|canalisation/],
  ["réserve : pertes sous-estimées (étalonnage)", /sous-estim|étalonn/],
  ["objectif 85 % d'ici 2030", /85 ?%/],
  ["limite : qualité sanitaire non traitée", /qualité|sanitaire/],
];

describe.skipIf(!process.env.LIMPID_LIVE || !out)("recette lot B : tranche complète réelle", () => {
  it("produit un rapport fidèle, identique sur le web et dans le PDF", async () => {
    mkdirSync(out, { recursive: true });
    const t = (since: number) => Date.now() - since;
    const timings: Record<string, number> = {};

    let t0 = Date.now();
    const sourcePdf = await corpusPdf();
    writeFileSync(path.join(out, "source.pdf"), sourcePdf);
    const extraction = await extractSource("pdf", new Uint8Array(sourcePdf), "src_recette", { maxChars: 300_000, maxPages: 100 });
    timings.extraction_ms = t(t0);

    const usage: (UsageReport & { stage: string; attempt: number })[] = [];
    const stageStart: Record<string, number> = {};
    t0 = Date.now();
    const report = await generateReport(new GeminiProvider(geminiConfigFromEnv()), {
      sourceId: "src_recette",
      segments: extraction.extracted.segments,
      level: "grand_public",
      goal: "comprendre",
      targetPages: 5,
      preferences: { aids: ["exemples", "schemas"], minutes: 7, density: "equilibre", example_domain: "quotidien", familiarity: "bases" },
      signal: new AbortController().signal,
      budgets: {
        comprehension: { tier: "fast", maxInputTokens: 40_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
        explanation: { tier: "quality", maxInputTokens: 40_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
      },
      onStage: (stage) => void (stageStart[stage] = Date.now()),
      onUsage: (stage, attempt, u) => void usage.push({ stage, attempt, ...u }),
      verifyClaims: true,
    });
    timings.generation_ms = t(t0);

    // Lecteur web : rendu serveur réel du composant utilisé par l'application.
    t0 = Date.now();
    const html = renderToStaticMarkup(
      h(Reader, {
        blueprint: report.blueprint,
        explanation: report.explanation,
        evidence: report.evidence,
        segments: extraction.extracted.segments,
        sourceTitle: EAU_VILLE_TITLE,
        isDemo: false,
      }),
    );
    timings.web_render_ms = t(t0);
    writeFileSync(path.join(out, "rapport.html"), `<!doctype html><meta charset="utf-8">${html}`);

    // Export PDF depuis les mêmes objets, puis relecture de son texte.
    t0 = Date.now();
    const pdf = await renderReportPdf({
      blueprint: report.blueprint,
      explanation: report.explanation,
      evidence: report.evidence,
      segments: extraction.extracted.segments,
      sourceTitle: EAU_VILLE_TITLE,
    });
    timings.pdf_render_ms = t(t0);
    writeFileSync(path.join(out, "rapport.pdf"), pdf);
    const pdfText = await extractPdf(new Uint8Array(pdf), { maxPages: 50 });
    const pdfAll = norm(pdfText.blocks.map((b) => b.text).join(" "));
    const webAll = norm(html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&"));

    // Contrôles : références résolubles, citations exactes, parité web/PDF, nombres, couverture.
    const { entries } = sourceEntries(report.blueprint, report.evidence, extraction.extracted.segments);
    const sourceAll = norm(extraction.extracted.segments.map((x) => x.text).join(" "));
    const refsResolved = report.blueprint.source_index.every((id) => report.evidence.some((e) => e.id === id));
    const quotesInSource = entries.filter((e) => sourceAll.includes(norm(e.quote))).length;
    const quotesInWeb = entries.filter((e) => webAll.includes(norm(e.quote))).length;
    const quotesInPdf = entries.filter((e) => pdfAll.includes(norm(e.quote))).length;
    const numbers = report.knowledge.claims.flatMap((c) => c.numbers.map((n) => n.source_form));
    const numbersInSource = numbers.filter((n) => sourceAll.includes(norm(n))).length;
    const reportText = norm(
      [
        ...report.explanation.sections.flatMap((x) => [x.question, x.takeaway, ...x.blocks.map((b) => b.text)]),
        ...report.explanation.limitations,
      ].join(" "),
    );
    const coverage = ESSENTIALS.map(([label, re]) => ({ label, covered: re.test(reportText) }));

    const perStage = Object.entries(
      usage.reduce<Record<string, { calls: number; ms: number; input: number; output: number }>>((acc, u) => {
        const a = (acc[u.stage] ??= { calls: 0, ms: 0, input: 0, output: 0 });
        a.calls++;
        a.ms += u.durationMs;
        a.input += u.inputTokens ?? 0;
        a.output += u.outputTokens ?? 0;
        return acc;
      }, {}),
    ).map(([stage, a]) => ({ stage, ...a, cents: estimateCents(a.input, a.output) }));

    const measures = {
      date: new Date().toISOString(),
      models: [...new Set(usage.map((u) => u.model))],
      status: report.status,
      blocking: [...report.validation.knowledge.blocking_errors, ...report.validation.explanation.blocking_errors],
      warnings: [...report.validation.knowledge.warnings, ...report.validation.explanation.warnings],
      repairs: { knowledge: report.validation.knowledge.repair_count, explanation: report.validation.explanation.repair_count },
      source: { pages: extraction.pageCount, segments: extraction.extracted.segments.length, chars: extraction.extracted.charCount },
      report: {
        claims: report.knowledge.claims.length,
        evidence: report.evidence.length,
        cited: entries.length,
        sections: report.explanation.sections.length,
        visuals: report.blueprint.visual_specs.length,
        pdf_pages: pdfText.pageCount,
      },
      checks: {
        refs_resolved: refsResolved,
        quotes_in_source: `${quotesInSource}/${entries.length}`,
        quotes_in_web: `${quotesInWeb}/${entries.length}`,
        quotes_in_pdf: `${quotesInPdf}/${entries.length}`,
        numbers_in_source: `${numbersInSource}/${numbers.length}`,
        title_in_pdf: pdfAll.includes(norm(report.blueprint.title)),
        coverage: `${coverage.filter((c) => c.covered).length}/${coverage.length}`,
        missing: coverage.filter((c) => !c.covered).map((c) => c.label),
      },
      timings,
      perStage,
      totalCents: perStage.reduce((n, x) => n + x.cents, 0),
    };
    writeFileSync(path.join(out, "mesures.json"), JSON.stringify(measures, null, 2));
    writeFileSync(path.join(out, "rapport.json"), JSON.stringify(report, null, 2));

    expect(report.status).toBe("validated");
    expect(refsResolved).toBe(true);
    expect(quotesInSource).toBe(entries.length);
    expect(quotesInWeb).toBe(entries.length);
    expect(quotesInPdf).toBe(entries.length);
    expect(numbersInSource).toBe(numbers.length);
    expect(measures.checks.title_in_pdf).toBe(true);
  }, 900_000);
});
