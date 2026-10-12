import { describe, expect, it } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { demoBlueprint, demoEvidence, demoExplanation, demoSegments } from "@/lib/demo/cycle-eau";
import { dictFor } from "@/lib/i18n";
import type { VisualSpec } from "@/lib/contracts/schemas";
import { composeLimpid } from "./Pieces";

describe("composition du lecteur", () => {
  it("chapitre à sous-chapitres avec une illustration pas encore prête : aucune erreur", () => {
    const blueprint = structuredClone(demoBlueprint);
    const ill = { id: "vis_ill", kind: "illustration", title: "Illustration", data: { asset_id: "absent" }, evidence_ids: [] } as unknown as VisualSpec;
    blueprint.visual_specs.push(ill);
    const bs = blueprint.sections.find((x) => x.section_id === "sec_2")!;
    bs.visual_ids = [...bs.visual_ids, "vis_ill"];
    const doc = composeLimpid({ t: dictFor("fr"), blueprint, explanation: demoExplanation, evidence: demoEvidence, segments: demoSegments, exercises: null, modeLabel: null, canReformulate: false });
    const html = renderToStaticMarkup(createElement(Fragment, null, ...(doc.pieces as React.ReactNode[])));
    expect(html).toContain("part_s2_1");
  });
});
