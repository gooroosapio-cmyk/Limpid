import { describe, expect, it } from "vitest";
import {
  demoBlueprint,
  demoEvidence,
  demoExplanation,
  demoKnowledge,
  demoSegments,
} from "@/lib/demo/cycle-eau";
import { Evidence, ExplanationObject, KnowledgeObject, ReportBlueprint, SourceSegment } from "./schemas";
import {
  ValidationCollector,
  validateBlueprint,
  validateEvidence,
  validateExplanation,
  validateKnowledge,
} from "./validate";

function runAll(ko = demoKnowledge, ex = demoExplanation, evidence = demoEvidence) {
  const v = new ValidationCollector();
  const segments = new Map(demoSegments.map((s) => [s.id, s]));
  const evidenceIds = new Set(evidence.map((e) => e.id));
  validateEvidence(evidence, segments, v);
  validateKnowledge(ko, evidence, v);
  validateExplanation(ex, ko, evidenceIds, v);
  validateBlueprint(demoBlueprint, ex, ko, evidenceIds, v);
  return v;
}

const clone = <T>(x: T): T => structuredClone(x);

describe("schémas", () => {
  it("le rapport de démonstration respecte tous les schémas", () => {
    for (const s of demoSegments) SourceSegment.parse(s);
    for (const e of demoEvidence) Evidence.parse(e);
    KnowledgeObject.parse(demoKnowledge);
    ExplanationObject.parse(demoExplanation);
    ReportBlueprint.parse(demoBlueprint);
  });

  it("refuse les champs inattendus", () => {
    const bad = { ...clone(demoKnowledge), extra: 1 };
    expect(KnowledgeObject.safeParse(bad).success).toBe(false);
  });

  it("refuse un type de bloc inconnu", () => {
    const ex = clone(demoExplanation) as unknown as { sections: { blocks: { type: string }[] }[] };
    ex.sections[0]!.blocks[0]!.type = "opinion";
    expect(ExplanationObject.safeParse(ex).success).toBe(false);
  });

  it("une analogie exige sa limite", () => {
    const ex = clone(demoExplanation) as unknown as { sections: { blocks: Record<string, unknown>[] }[] };
    delete ex.sections[2]!.blocks[1]!.limit;
    expect(ExplanationObject.safeParse(ex).success).toBe(false);
  });
});

describe("contrôles sémantiques", () => {
  it("la démonstration passe sans erreur bloquante", () => {
    const v = runAll();
    expect(v.blocking).toEqual([]);
  });

  it("détecte une citation qui ne correspond pas au texte source", () => {
    const evidence = clone(demoEvidence);
    evidence[0]!.quote = "L'eau reste immobile dans les océans.";
    expect(runAll(demoKnowledge, demoExplanation, evidence).blocking.join()).toMatch(/evidence_quote_match/);
  });

  it("détecte un nombre absent des preuves", () => {
    const ko = clone(demoKnowledge);
    ko.claims[8]!.numbers[0]!.value = 79;
    ko.claims[8]!.numbers[0]!.source_form = "79 %";
    expect(runAll(ko).blocking.join()).toMatch(/claim_number_in_evidence/);
  });

  it("refuse une affirmation non soutenue présentée comme un fait", () => {
    const ko = clone(demoKnowledge);
    ko.claims[0]!.support_status = "unsupported";
    expect(runAll(ko).blocking.join()).toMatch(/fact_supported/);
  });

  it("une affirmation ambiguë produit un avertissement, pas un blocage", () => {
    const ko = clone(demoKnowledge);
    ko.claims[0]!.support_status = "ambiguous";
    const v = runAll(ko);
    expect(v.blocking).toEqual([]);
    expect(v.warnings.join()).toMatch(/fact_ambiguous/);
  });

  it("refuse une référence de preuve inventée", () => {
    const ex = clone(demoExplanation);
    ex.sections[0]!.blocks[0]!.evidence_ids = ["ev_999"];
    expect(runAll(demoKnowledge, ex).blocking.join()).toMatch(/block_evidence_exist/);
  });

  it("refuse une relation orpheline", () => {
    const ko = clone(demoKnowledge);
    ko.relations[0]!.to_id = "cpt_inconnu";
    expect(runAll(ko).blocking.join()).toMatch(/relation_endpoints/);
  });

  it("refuse les identifiants dupliqués", () => {
    const ko = clone(demoKnowledge);
    ko.claims[1]!.id = "clm_1";
    expect(runAll(ko).blocking.join()).toMatch(/knowledge_ids_unique/);
  });
});
