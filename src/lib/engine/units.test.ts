import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.mock("server-only", () => ({}));

import { callWithRetry, reviewSelection, type GenerationInput } from "./pipeline";
import { ProviderError, type AIProvider, type StructuredRequest } from "./provider";
import { courseLanguage } from "./supports";

const usage = { provider: "fake", model: "m", inputTokens: 1, outputTokens: 1, durationMs: 1, requestId: null };

/** Fournisseur qui échoue toujours avec le même code (réponse facturée). */
class Failing implements AIProvider {
  readonly name = "fake";
  readonly isDemo = false;
  calls = 0;
  constructor(private readonly code: "schema_mismatch" | "truncated") {}
  async generateStructured<T extends z.ZodType>(_req: StructuredRequest<T>): Promise<never> {
    this.calls++;
    throw new ProviderError(this.code, "échec", usage, ["x"]);
  }
}

const input = { signal: new AbortController().signal } as unknown as GenerationInput;
const req = { schema: {} as z.ZodType, instructions: "i", data: [], budget: { tier: "fast" as const, maxInputTokens: 1, maxOutputTokens: 8_000, timeoutMs: 1 } };

describe("nouvelles tentatives par unité (§ 9.8)", () => {
  it("un premier appel et deux nouvelles tentatives au plus", async () => {
    const p = new Failing("schema_mismatch");
    await expect(callWithRetry(p, input, "s", 0, req)).rejects.toBeInstanceOf(ProviderError);
    expect(p.calls).toBe(3);
  });
  it("budget partagé : une unité qui a déjà réparé n'a plus qu'un essai", async () => {
    const p = new Failing("truncated");
    const attempts = { left: 1 };
    await expect(callWithRetry(p, input, "s", 0, { ...req, attempts })).rejects.toBeInstanceOf(ProviderError);
    expect(p.calls).toBe(2);
    expect(attempts.left).toBe(0);
  });
});

describe("vérification par échantillon (§ 9.4)", () => {
  const claim = (id: string, statement: string, support_status = "supported") => ({ id, statement, support_status }) as never;
  it("affirmations à risque, définitions centrales et 10 % stables des autres", () => {
    const plain = Array.from({ length: 25 }, (_, i) => claim(`clm_${i}`, "La cellule contient un noyau."));
    const ko = {
      claims: [...plain, claim("clm_r", "La dose est de 5 mg."), claim("clm_u", "Texte.", "partial")],
      concepts: [{ id: "cpt_1", importance: "central", definition_claim_ids: ["clm_3"] }] as never,
    };
    const a = reviewSelection(ko);
    expect([...a.required].sort()).toEqual(["clm_3", "clm_r", "clm_u"]);
    expect(a.sample.size).toBe(3);
    expect(a.rest).toHaveLength(21);
    // Stable d'une génération à l'autre.
    expect([...reviewSelection(ko).sample]).toEqual([...a.sample]);
    // Au moins une affirmation quand il en existe.
    expect(reviewSelection({ claims: [claim("clm_a", "Texte simple.")], concepts: [] }).sample.size).toBe(1);
  });
});

describe("langue du cours pour les supports (§ 10)", () => {
  const sec = (text: string) => ({ question: text, takeaway: text, blocks: [{ text }] }) as never;
  it("reconnaît le français et l'anglais, sinon ne tranche pas", () => {
    expect(courseLanguage({ sections: [sec("La cellule est l'unité de base du vivant et elle contient un noyau dans la plupart des cas, pour les organismes qui sont complexes.")] })).toBe("fr");
    expect(courseLanguage({ sections: [sec("The cell is the basic unit of life and it contains a nucleus in most cases, for the organisms that are complex and this is from the book.")] })).toBe("en");
    expect(courseLanguage({ sections: [sec("ADN ARN")] })).toBeNull();
  });
});

describe("coûts (lot 5)", () => {
  it("coût exact au dix-millième de centime, plus d'arrondi au centime supérieur", async () => {
    const { usageCents, roundCents } = await import("@/lib/budget");
    expect(roundCents(0.123456)).toBe(0.1235);
    expect(usageCents({ inputTokens: 1, outputTokens: 1, costUsd: 0.0001 })).toBeLessThan(1);
  });
  it("bilan : données abrégées sous la taille visée, questions existantes transmises", async () => {
    const { explanationPayload } = await import("./exercises");
    const long = "x".repeat(2_000);
    const ex = {
      key_points: [],
      glossary: [],
      sections: Array.from({ length: 30 }, (_, i) => ({
        id: `sec_${i}`, question: `Q${i}`, takeaway: "t",
        blocks: Array.from({ length: 12 }, (_, j) => ({ id: `blk_${j}`, type: "fact", text: long, evidence_ids: [] })),
        quiz: [{ prompt: "Déjà posée ?" }],
      })),
    } as never;
    const out = explanationPayload(ex, 36_000);
    expect(out.length).toBeLessThanOrEqual(60_000);
    expect(out).toContain("Déjà posée ?");
  });
});
