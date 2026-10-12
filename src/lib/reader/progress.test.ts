import { describe, expect, it } from "vitest";
import { practiceBySection } from "./progress";

describe("progression séparée (PRO-01 à PRO-03)", () => {
  it("réussite autonome, erreur à revoir, variante aidée sans effet sur l'erreur", () => {
    const state = practiceBySection([
      { section_id: "sec_1", created_at: "2026-10-12T10:00:00Z", answers: [{ id: "q_1", correct: true }, { id: "q_2", correct: false }, { id: "q_3", correct: true, variant_of: "q_2", aided: true }] },
      { section_id: "sec_2", created_at: "2026-10-12T10:05:00Z", answers: [{ id: "q_1", correct: true }] },
    ]);
    expect(state.sec_1).toEqual({ success: true, review: true });
    expect(state.sec_2).toEqual({ success: true, review: false });
  });

  it("une nouvelle réponse autonome juste lève le « à revoir » ; l'historique reste", () => {
    const state = practiceBySection([
      { section_id: "sec_1", created_at: "2026-10-12T11:00:00Z", answers: [{ id: "q_2", correct: true }] },
      { section_id: "sec_1", created_at: "2026-10-12T10:00:00Z", answers: [{ id: "q_2", correct: false }] },
    ]);
    expect(state.sec_1).toEqual({ success: true, review: false });
  });

  it("question passée : non évaluée (ni réussite ni échec)", () => {
    expect(practiceBySection([{ section_id: "sec_1", created_at: "2026-10-12T10:00:00Z", answers: [{ id: "q_1", correct: null }] }]).sec_1).toEqual({ success: false, review: false });
  });
});
