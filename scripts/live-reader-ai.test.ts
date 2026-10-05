/**
 * Recette réelle (Gemini) des appels du lecteur : QCM « Me tester » et « Poser une question ».
 * LIMPID_LIVE=1 NODE_USE_ENV_PROXY=1 npx vitest run scripts/live-reader-ai.test.ts — 2 requêtes.
 */
import { describe, expect, it } from "vitest";
import { demoExplanation, demoSegments } from "@/lib/demo/cycle-eau";
import { GeminiProvider, geminiConfigFromEnv } from "@/lib/engine/gemini";
import { askModel, pickSegments, verifyCitations } from "@/lib/reports/ask";
import { explanationText } from "@/lib/reports/explanation-text";
import { askQuiz, normalizeQuiz } from "@/lib/reports/quiz";

describe.skipIf(!process.env.LIMPID_LIVE)("recette V3.1 : IA du lecteur (Gemini réel)", () => {
  const provider = () => new GeminiProvider(geminiConfigFromEnv());
  const titles = new Map(demoExplanation.sections.map((s) => [s.id, s.question]));

  it("rédige un devoir QCM valide sur tout le document", async () => {
    const res = await askQuiz(provider(), explanationText(demoExplanation), 5, AbortSignal.timeout(90_000));
    const qs = normalizeQuiz(res.value, titles, demoExplanation.sections[0]!.id);
    console.log(JSON.stringify({ model: res.usage.model, n: qs.length, answers: qs.map((q) => q.answer), sample: qs[0] }, null, 1));
    expect(qs.length).toBeGreaterThanOrEqual(4);
    for (const q of qs) {
      expect(q.options).toHaveLength(4);
      expect(titles.has(q.sectionId)).toBe(true);
    }
  }, 120_000);

  it("répond à une question avec des citations vérifiées", async () => {
    const question = "Pourquoi les nuages finissent-ils par donner de la pluie ?";
    const passages = pickSegments(demoSegments, question, new Set());
    const res = await askModel(provider(), { question }, explanationText(demoExplanation, ["sec_3"]), passages, AbortSignal.timeout(90_000));
    const cites = verifyCitations(res.value.citations, new Map(passages.map((s) => [s.id, s])));
    console.log(JSON.stringify({ model: res.usage.model, answer: res.value.answer, raw: res.value.citations.length, verified: cites, followups: res.value.followups }, null, 1));
    expect(res.value.answer.length).toBeGreaterThan(20);
    expect(res.value.in_document).toBe(true);
  }, 120_000);
});
