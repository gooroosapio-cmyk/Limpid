/**
 * Recette V4 (Gemini réel) : contrat 1.1.0 de bout en bout sur le corpus « eau potable » —
 * approche, points clés, blocs variés, variantes d'exemples, puis exercices pré-générés.
 *   LIMPID_LIVE=1 LIMPID_OUT=<dossier> NODE_USE_ENV_PROXY=1 GEMINI_API_KEY=… \
 *   AI_REPORT_MODEL=… AI_CHAT_MODEL=… LIMPID_MODEL_FALLBACKS=… LIMPID_V4_MODES=claire,tres_simple \
 *   npx vitest run scripts/live-v4.test.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { createElement as h } from "react";
import { describe, expect, it } from "vitest";
import type { Mode } from "@/lib/contracts/schemas";
import { bilanSize, generateExercises } from "@/lib/engine/exercises";
import { GeminiProvider, geminiConfigFromEnv } from "@/lib/engine/gemini";
import { generateReport, planPages } from "@/lib/engine/pipeline";
import { extractSource } from "@/lib/extract";
import { EAU_VILLE_PAGES, EAU_VILLE_TITLE } from "./corpus/eau-ville";

const out = process.env.LIMPID_OUT ?? "";

describe.skipIf(!process.env.LIMPID_LIVE || !out)("recette V4 : contrat enrichi, Gemini réel", () => {
  it("génère rapport et exercices conformes pour chaque approche demandée", async () => {
    mkdirSync(out, { recursive: true });
    const pdf = await renderToBuffer(
      h(Document, { title: EAU_VILLE_TITLE }, ...EAU_VILLE_PAGES.map((p, i) => h(Page, { key: i, size: "A4", style: { padding: 48, fontSize: 11 } }, h(Text, null, p.heading), ...p.paragraphs.map((t, j) => h(Text, { key: j }, t)), p.table ? h(View, null, ...p.table.map((r, k) => h(Text, { key: k }, r.join("   ")))) : null))),
    );
    const r = await extractSource("pdf", new Uint8Array(pdf), "src_eau", { maxChars: 300_000, maxPages: 100 });
    const segments = r.extracted.segments;
    const chars = segments.reduce((n, s) => n + s.text.length, 0);
    const provider = new GeminiProvider(geminiConfigFromEnv());
    const modes = (process.env.LIMPID_V4_MODES ?? "claire").split(",") as Mode[];
    const summary: Record<string, unknown>[] = [];
    for (const mode of modes) {
      const usage: { stage: string; model: string; ms: number }[] = [];
      let drafted = { checkpoints: 0, bilan: 0 };
      const report = await generateReport(provider, {
        sourceId: "src_eau",
        segments,
        level: mode === "tres_simple" ? "ultra_simple" : "grand_public",
        goal: mode === "revision" ? "reviser" : "comprendre",
        targetPages: planPages(chars, mode),
        mode,
        preferences: { aids: [], minutes: null, density: null, example_domain: "quotidien", familiarity: "bases" },
        signal: AbortSignal.timeout(600_000),
        budgets: {
          comprehension: { tier: "fast", maxInputTokens: 60_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
          explanation: { tier: "quality", maxInputTokens: 60_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
        },
        verifyClaims: true,
        onUsage: (stage, _a, u) => void usage.push({ stage, model: u.model, ms: u.durationMs }),
      }).catch((e) => {
        writeFileSync(path.join(out, `v4-${mode}-error.json`), JSON.stringify({ message: e.message, issues: e.issues, usage }, null, 1));
        throw e;
      });
      const evidenceIds = new Set(report.evidence.map((e) => e.id));
      const exercises = await generateExercises(provider, {
        explanation: report.explanation,
        knowledge: report.knowledge,
        evidenceIds,
        mode,
        budget: { tier: "quality", maxInputTokens: 60_000, maxOutputTokens: 24_000, timeoutMs: 150_000 },
        signal: AbortSignal.timeout(200_000),
        onUsage: (u) => void usage.push({ stage: "exercises", model: u.model, ms: u.durationMs }),
        onDraft: (d) => void (drafted = { checkpoints: d.checkpoints.reduce((n, c) => n + c.exercises.length, 0), bilan: d.bilan.length }),
      });
      const ex = report.explanation;
      const blockTypes = ex.sections.flatMap((s) => s.blocks.map((b) => b.type));
      const variants = ex.sections.flatMap((s) => s.blocks.flatMap((b) => ("variants" in b && b.variants ? b.variants : []))).length;
      const row = {
        mode,
        status: report.status,
        planned: planPages(chars, mode),
        sections: ex.sections.length,
        key_points: ex.key_points?.length,
        short_result: ex.short_result,
        block_types: [...new Set(blockTypes)],
        variants,
        visuals: report.blueprint.visual_specs.map((v) => `${v.kind}:${v.size}/${v.placement}`),
        checkpoints: exercises.checkpoints.length,
        bilan: exercises.bilan.length,
        kinds: [...new Set([...exercises.bilan, ...exercises.checkpoints.flatMap((c) => c.exercises)].map((q) => q.kind))],
        insufficient: exercises.insufficient,
        drafted,
        requested_bilan: bilanSize(report.explanation, report.knowledge),
        blocking: [...report.validation.knowledge.blocking_errors, ...report.validation.explanation.blocking_errors],
        warnings: report.validation.explanation.warnings.length,
        usage,
      };
      summary.push(row);
      writeFileSync(path.join(out, `v4-${mode}.json`), JSON.stringify({ report, exercises, segments }, null, 1));
      expect(ex.mode).toBe(mode);
      expect(ex.key_points!.length).toBeGreaterThanOrEqual(3);
      if (mode === "resume") expect(blockTypes.some((t) => t === "analogy" || t === "fictional_example" || t === "complement")).toBe(false);
      expect(exercises.bilan.length).toBeGreaterThanOrEqual(1);
    }
    writeFileSync(path.join(out, "v4-summary.json"), JSON.stringify(summary, null, 1));
    console.log(JSON.stringify(summary, null, 1));
  }, 1_500_000);
});
