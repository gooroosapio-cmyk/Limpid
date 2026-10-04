/**
 * Essai réel des nouvelles versions (« Plus simple », « Un autre exemple ») contre Gemini
 * (hors CI). Lancement :
 *   LIMPID_LIVE=1 GEMINI_API_KEY=… LIMPID_MODEL_FAST=… LIMPID_MODEL_QUALITY=… npx vitest run scripts/live-reexplain.test.ts
 * Derrière un proxy HTTP, ajouter NODE_USE_ENV_PROXY=1.
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoEvidence, demoExplanation, demoKnowledge } from "@/lib/demo/cycle-eau";
import { GeminiProvider, geminiConfigFromEnv } from "@/lib/engine/gemini";
import { regenerateExplanation, simplerLevel } from "@/lib/engine/pipeline";

const budget = { tier: "quality" as const, maxInputTokens: 120_000, maxOutputTokens: 32_000, timeoutMs: 180_000 };
const texts = (ex: typeof demoExplanation, type: string) =>
  ex.sections.flatMap((s) => s.blocks.filter((b) => b.type === type).map((b) => b.text));

describe.skipIf(!process.env.LIMPID_LIVE)("nouvelles versions réelles", () => {
  it("produit une version validée plus simple, puis une avec d'autres exemples", async () => {
    const provider = new GeminiProvider(geminiConfigFromEnv());
    const base = {
      goal: demoExplanation.goal,
      targetPages: 5 as const,
      preferences: demoExplanation.preferences_snapshot,
      signal: new AbortController().signal,
      budgets: { comprehension: budget, explanation: budget },
    };
    const level = { ...demoExplanation, level: "etudiant" as const };
    const simpler = await regenerateExplanation(provider, { ...base, level: simplerLevel("etudiant") }, demoKnowledge, demoEvidence, level, "simpler");
    const other = await regenerateExplanation(provider, { ...base, level: demoExplanation.level }, demoKnowledge, demoEvidence, demoExplanation, "other_example");
    writeFileSync(process.env.LIMPID_OUT ?? "/dev/null", JSON.stringify({ simpler: simpler.explanation, other: other.explanation, v: [simpler.validation, other.validation] }, null, 2));
    expect(simpler.status).toBe("validated");
    expect(simpler.explanation.level).toBe("grand_public");
    expect(other.status).toBe("validated");
    const before = [...texts(demoExplanation, "analogy"), ...texts(demoExplanation, "fictional_example")];
    const after = [...texts(other.explanation, "analogy"), ...texts(other.explanation, "fictional_example")];
    expect(after.length).toBeGreaterThan(0);
    expect(after.some((t) => before.includes(t))).toBe(false);
  }, 600_000);
});
