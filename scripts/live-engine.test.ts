/**
 * Essai réel du moteur contre Gemini (hors CI). Lancement :
 *   LIMPID_LIVE=1 GEMINI_API_KEY=… LIMPID_MODEL_FAST=… LIMPID_MODEL_QUALITY=… npx vitest run scripts/live-engine.test.ts
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GeminiProvider, geminiConfigFromEnv } from "@/lib/engine/gemini";
import { generateReport } from "@/lib/engine/pipeline";
import { segmentText } from "@/lib/extract/text";
import { SAMPLE_TEXT } from "./sample-text";

describe.skipIf(!process.env.LIMPID_LIVE)("moteur réel", () => {
  it("génère un rapport validé à partir d'un texte collé", async () => {
    const provider = new GeminiProvider(geminiConfigFromEnv());
    const { segments } = segmentText(SAMPLE_TEXT, "src_live", { maxChars: 50_000 });
    const usage: unknown[] = [];
    const out = await generateReport(provider, {
      sourceId: "src_live",
      segments,
      level: "grand_public",
      goal: "comprendre",
      targetPages: 5,
      preferences: { aids: ["exemples", "schemas"], minutes: 7, density: "equilibre", example_domain: "quotidien", familiarity: "bases" },
      signal: new AbortController().signal,
      budgets: {
        comprehension: { tier: "fast", maxInputTokens: 60_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
        explanation: { tier: "quality", maxInputTokens: 60_000, maxOutputTokens: 32_000, timeoutMs: 180_000 },
      },
      onUsage: (stage, attempt, u) => void usage.push({ stage, attempt, ...u }),
    });
    writeFileSync(process.env.LIMPID_LIVE_OUT ?? "/dev/null", JSON.stringify({ usage, out }, null, 2));
    console.log(JSON.stringify({ status: out.status, usage, k: out.validation.knowledge.blocking_errors, e: out.validation.explanation.blocking_errors, warnings: [...out.validation.knowledge.warnings, ...out.validation.explanation.warnings], claims: out.knowledge.claims.length, evidence: out.evidence.length, sections: out.explanation.sections.length, visuals: out.blueprint.visual_specs.length }, null, 1));
    expect(out.status).toBe("validated");
  }, 900_000);
});
