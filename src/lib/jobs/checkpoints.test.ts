import { describe, expect, it } from "vitest";
import { PROMPT_VERSION } from "@/lib/engine/pipeline";
import { parseCheckpoint, UnderstandingCheckpoint } from "./checkpoints";

describe("points de reprise du pipeline", () => {
  it("ignorés s'ils viennent d'une autre version des consignes ou sont invalides", () => {
    expect(parseCheckpoint(UnderstandingCheckpoint, null)).toBeNull();
    expect(parseCheckpoint(UnderstandingCheckpoint, { prompt_version: "ancienne", payload: {} })).toBeNull();
    expect(parseCheckpoint(UnderstandingCheckpoint, { prompt_version: PROMPT_VERSION, payload: { knowledge: 1 } })).toBeNull();
  });
});
