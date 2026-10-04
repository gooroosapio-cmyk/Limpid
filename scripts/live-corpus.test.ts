/**
 * Recette du lot E (cahier V2, § 21) : corpus réel, seuils de lancement et niveaux. Hors CI :
 *   LIMPID_LIVE=1 LIMPID_OUT=<dossier> GEMINI_API_KEY=… \
 *   LIMPID_CORPUS_MODEL=… LIMPID_LEVELS_MODEL=… npx vitest run scripts/live-corpus.test.ts
 * Derrière un proxy HTTP, ajouter NODE_USE_ENV_PROXY=1.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import { estimateCents } from "@/lib/budget";
import { LEVELS, type Evidence, type ExplanationObject, type KnowledgeObject, type Level, type SourceSegment } from "@/lib/contracts/schemas";
import { GeminiProvider } from "@/lib/engine/gemini";
import { explainKnowledge, generateReport, type GenerationInput } from "@/lib/engine/pipeline";
import type { UsageReport } from "@/lib/engine/provider";
import { extractSource } from "@/lib/extract";
import { extractPdf } from "@/lib/extract/pdf";
import { percentile } from "@/lib/diagnostic";
import { renderReportPdf } from "@/lib/render/pdf";
import { sourceEntries } from "@/lib/render/sources";
import { makeTwoColumnPdf } from "@/test/fixtures";
import { CORPUS_E, type CorpusDoc } from "./corpus/recette-e";
import { EAU_VILLE_PAGES, EAU_VILLE_TITLE } from "./corpus/eau-ville";

const out = process.env.LIMPID_OUT ?? "";
const norm = (t: string) => t.normalize("NFC").replace(/[’']/g, "'").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

function provider(model: string) {
  return new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY ?? "", modelFast: model, modelQuality: model });
}

const budgets: GenerationInput["budgets"] = {
  comprehension: { tier: "fast", maxInputTokens: 40_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
  explanation: { tier: "quality", maxInputTokens: 40_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
};
const prefs = { aids: ["exemples" as const], minutes: 7 as const, density: "equilibre" as const, example_domain: "quotidien" as const, familiarity: "bases" as const };

const EAU: CorpusDoc = {
  id: "pdf-natif-tableau",
  scenario: "PDF natif, tableau, unités et réserve",
  title: EAU_VILLE_TITLE,
  essentials: [
    ["production 3,9 millions m³", /3,9/],
    ["148 litres", /148/],
    ["objectif 135 litres", /135/],
    ["rendement 79,5 %", /79,5/],
    ["causes : conduites / capteurs", /capteur|conduite|canalisation/],
    ["réserve : pertes sous-estimées", /sous-estim|étalonn/],
    ["objectif 85 % en 2030", /85 ?%/],
    ["limite : qualité sanitaire non traitée", /qualité|sanitaire/],
  ],
};

async function sourceOf(doc: CorpusDoc): Promise<{ segments: SourceSegment[]; columnPages: number[] }> {
  if (doc.columns) {
    const pdf = makeTwoColumnPdf(doc.title, doc.columns.left, doc.columns.right);
    writeFileSync(path.join(out, `${doc.id}-source.pdf`), pdf);
    const r = await extractSource("pdf", pdf, `src_${doc.id}`, { maxChars: 300_000, maxPages: 100 });
    return { segments: r.extracted.segments, columnPages: (await extractPdf(pdf, { maxPages: 10 })).columnPages };
  }
  if (doc.text) {
    const r = await extractSource("txt", new TextEncoder().encode(doc.text), `src_${doc.id}`, { maxChars: 300_000, maxPages: 100 });
    return { segments: r.extracted.segments, columnPages: [] };
  }
  const pdf = await renderToBuffer(
    h(Document, null, ...EAU_VILLE_PAGES.map((p, i) => h(Page, { key: i, size: "A4", style: { padding: 48, fontSize: 11 } }, h(Text, null, p.heading), ...p.paragraphs.map((t, j) => h(Text, { key: j }, t)), p.table ? h(View, null, ...p.table.map((r, k) => h(Text, { key: k }, r.join("   ")))) : null))),
  );
  const r = await extractSource("pdf", new Uint8Array(pdf), `src_${doc.id}`, { maxChars: 300_000, maxPages: 100 });
  return { segments: r.extracted.segments, columnPages: [] };
}

function reportText(ex: ExplanationObject): string {
  return norm([...ex.sections.flatMap((s) => [s.question, s.takeaway, ...s.blocks.map((b) => b.text)]), ...ex.limitations].join(" "));
}

/** Longueur moyenne des phrases (mots) : indicateur grossier de difficulté. */
function avgSentenceWords(ex: ExplanationObject): number {
  const text = ex.sections.flatMap((s) => s.blocks.map((b) => b.text)).join(" ");
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 3);
  const words = sentences.reduce((n, s) => n + s.split(/\s+/).length, 0);
  return Math.round((words / Math.max(1, sentences.length)) * 10) / 10;
}

describe.skipIf(!process.env.LIMPID_LIVE || !out)("recette lot E : corpus réel", () => {
  it("respecte les seuils de lancement sur le corpus, puis les cinq niveaux", async () => {
    mkdirSync(out, { recursive: true });
    const corpusModel = process.env.LIMPID_CORPUS_MODEL ?? "gemini-3.5-flash-lite";
    const levelsModel = process.env.LIMPID_LEVELS_MODEL ?? corpusModel;
    const docs = [EAU, ...CORPUS_E];
    const results: Record<string, unknown>[] = [];
    const knowledgeOf: Record<string, { ko: KnowledgeObject; evidence: Evidence[]; segments: SourceSegment[] }> = {};
    const stageMs: Record<string, number[]> = {};
    const reportMs: number[] = [];

    for (const doc of docs) {
      const { segments, columnPages } = await sourceOf(doc);
      const usage: (UsageReport & { stage: string })[] = [];
      const t0 = Date.now();
      let report;
      try {
        report = await generateReport(provider(corpusModel), {
          sourceId: `src_${doc.id}`,
          segments,
          level: "grand_public",
          goal: "comprendre",
          targetPages: 5,
          preferences: prefs,
          signal: new AbortController().signal,
          budgets,
          verifyClaims: true,
          visualMode: "schemas",
          onUsage: (stage, _a, u) => void usage.push({ stage, ...u }),
        });
      } catch (e) {
        results.push({ id: doc.id, scenario: doc.scenario, error: (e as Error).message });
        continue;
      }
      const ms = Date.now() - t0;
      reportMs.push(ms);
      for (const u of usage) (stageMs[u.stage] ??= []).push(u.durationMs);
      knowledgeOf[doc.id] = { ko: report.knowledge, evidence: report.evidence, segments };

      const { entries } = sourceEntries(report.blueprint, report.evidence, segments);
      const sourceAll = norm(segments.map((s) => s.text).join(" "));
      const text = reportText(report.explanation);
      const numbers = report.knowledge.claims.flatMap((c) => c.numbers.map((n) => n.source_form));
      const covered = doc.essentials.filter(([, re]) => re.test(text));
      const pdf = await renderReportPdf({ blueprint: report.blueprint, explanation: report.explanation, evidence: report.evidence, segments, sourceTitle: doc.title });
      writeFileSync(path.join(out, `${doc.id}.pdf`), pdf);
      const pdfText = norm((await extractPdf(new Uint8Array(pdf), { maxPages: 50 })).blocks.map((b) => b.text).join(" "));

      results.push({
        id: doc.id,
        scenario: doc.scenario,
        status: report.status,
        blocking: [...report.validation.knowledge.blocking_errors, ...report.validation.explanation.blocking_errors],
        sections: report.explanation.sections.length,
        claims: report.knowledge.claims.length,
        contradictions: report.knowledge.contradictions.length,
        statuses: report.knowledge.claims.reduce<Record<string, number>>((a, c) => ((a[c.support_status] = (a[c.support_status] ?? 0) + 1), a), {}),
        refs_resolved: report.blueprint.source_index.every((id) => report.evidence.some((e) => e.id === id)),
        quotes_exact: `${entries.filter((e) => sourceAll.includes(norm(e.quote))).length}/${entries.length}`,
        quotes_in_pdf: `${entries.filter((e) => pdfText.includes(norm(e.quote))).length}/${entries.length}`,
        numbers_in_source: `${numbers.filter((n) => sourceAll.includes(norm(n))).length}/${numbers.length}`,
        essentials: `${covered.length}/${doc.essentials.length}`,
        missing: doc.essentials.filter((e) => !covered.includes(e)).map(([l]) => l),
        forbidden_found: (doc.forbidden ?? []).filter((re) => re.test(text) || re.test(pdfText)).map(String),
        column_pages: columnPages,
        calls: usage.length,
        ms,
        cents: usage.reduce((n, u) => n + estimateCents(u.inputTokens ?? 0, u.outputTokens ?? 0), 0),
      });
    }

    // Cinq niveaux, deux sujets : même connaissance, une rédaction par niveau.
    const levels: Record<string, unknown>[] = [];
    for (const subject of ["pdf-natif-tableau", "deux-colonnes"]) {
      const k = knowledgeOf[subject];
      if (!k) continue;
      const doc = docs.find((d) => d.id === subject)!;
      const takeaways = new Set<string>();
      for (const level of LEVELS as readonly Level[]) {
        const t0 = Date.now();
        try {
          const r = await explainKnowledge(provider(levelsModel), { level, goal: "comprendre", targetPages: 5, preferences: prefs, signal: new AbortController().signal, budgets }, k.ko, k.evidence);
          const text = reportText(r.explanation);
          const analogies = r.explanation.sections.flatMap((s) => s.blocks).filter((b) => b.type === "analogy");
          takeaways.add(r.explanation.sections.map((s) => s.takeaway).join("|"));
          levels.push({
            subject,
            level,
            blocking: r.validation.blocking_errors.length,
            essentials: `${doc.essentials.filter(([, re]) => re.test(text)).length}/${doc.essentials.length}`,
            sections: r.explanation.sections.length,
            avg_sentence_words: avgSentenceWords(r.explanation),
            analogies: analogies.length,
            analogies_with_limit: analogies.filter((a) => a.type === "analogy" && a.limit.trim().length > 0).length,
            glossary: r.explanation.glossary.length,
            ms: Date.now() - t0,
          });
        } catch (e) {
          levels.push({ subject, level, error: (e as Error).message });
        }
      }
      levels.push({ subject, distinct_versions: takeaways.size });
    }

    const ok = results.filter((r) => !r.error);
    const sumFrac = (key: string) => ok.reduce((a, r) => { const [x, y] = String(r[key]).split("/").map(Number); return [a[0]! + x!, a[1]! + y!]; }, [0, 0]);
    const [eHit, eAll] = sumFrac("essentials");
    const [nHit, nAll] = sumFrac("numbers_in_source");
    const [qHit, qAll] = sumFrac("quotes_exact");
    const summary = {
      date: new Date().toISOString(),
      models: { corpus: corpusModel, levels: levelsModel },
      thresholds: {
        refs_resolved_100: ok.every((r) => r.refs_resolved === true),
        quotes_exact: `${qHit}/${qAll}`,
        numbers_ok: `${nHit}/${nAll}`,
        zero_blocking: ok.every((r) => (r.blocking as string[]).length === 0),
        essentials: `${eHit}/${eAll} (${Math.round((eHit! / Math.max(1, eAll!)) * 100)} %)`,
        essentials_95: eHit! / Math.max(1, eAll!) >= 0.95,
        forbidden_none: ok.every((r) => (r.forbidden_found as string[]).length === 0),
      },
      performance: {
        report_ms_p50: percentile(reportMs, 50),
        report_ms_p95: percentile(reportMs, 95),
        stage_ms: Object.fromEntries(Object.entries(stageMs).map(([s, v]) => [s, { calls: v.length, p50: percentile(v, 50), p95: percentile(v, 95) }])),
        cents_total: ok.reduce((n, r) => n + (r.cents as number), 0),
      },
      results,
      levels,
    };
    writeFileSync(path.join(out, "corpus.json"), JSON.stringify(summary, null, 2));
    expect(results.length).toBe(docs.length);
  }, 1_800_000);
});
