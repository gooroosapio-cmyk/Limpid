import { parseHTML } from "linkedom";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Reader } from "@/components/reader/Reader";
import { DEMO_SOURCE_TITLE, demoBlueprint, demoEvidence, demoExplanation, demoSegments } from "@/lib/demo/cycle-eau";
import { extractPdf } from "@/lib/extract/pdf";
import { renderReportPdf } from "./pdf";
import { safeHref } from "./visuals";

const HOSTILE = `<script>alert(1)</script><img src=x onerror=alert(2)><a href="javascript:alert(3)">x</a>`;

function hostileReport() {
  const explanation = structuredClone(demoExplanation);
  explanation.sections[0]!.question = `Question ${HOSTILE}`;
  explanation.sections[0]!.blocks[0]!.text = `Texte ${HOSTILE}`;
  explanation.limitations = [`Limite ${HOSTILE}`];
  const blueprint = structuredClone(demoBlueprint);
  blueprint.title = `Titre ${HOSTILE}`;
  blueprint.visual_specs.push({
    id: "vis_ill_1",
    kind: "illustration",
    purpose: "x",
    claim_ids: ["clm_1"],
    evidence_ids: [],
    data: { query: "water", subject: "Eau", asset_id: "00000000-0000-4000-8000-000000000001" },
    alt_text: `Alt ${HOSTILE}`,
    caption: `Légende ${HOSTILE}`,
    illustrative_only: true,
  });
  blueprint.sections[0]!.visual_ids.push("vis_ill_1");
  return { explanation, blueprint };
}

describe("rendu face à un contenu hostile (XSS)", () => {
  it("échappe le texte et neutralise les liens dangereux", () => {
    const { explanation, blueprint } = hostileReport();
    const html = renderToStaticMarkup(
      h(Reader, {
        blueprint,
        explanation,
        evidence: demoEvidence,
        segments: demoSegments,
        sourceTitle: `${DEMO_SOURCE_TITLE} ${HOSTILE}`,
        sourceUrl: "javascript:alert(4)",
        pdfHref: "#",
        isDemo: false,
        assets: {
          "00000000-0000-4000-8000-000000000001": {
            id: "a",
            src: "/x.jpg",
            width: 960,
            height: 640,
            provider: "commons",
            author: HOSTILE,
            license: "CC0",
            licenseUrl: "javascript:alert(5)",
            sourceUrl: "data:text/html,<script>alert(6)</script>",
            modifications: null,
            model: null,
          },
        },
      }),
    );
    const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
    expect(document.querySelectorAll("script")).toHaveLength(0);
    const all = [...document.querySelectorAll("*")];
    expect(all.flatMap((el) => [...el.attributes].map((a) => a.name)).filter((n) => n.startsWith("on"))).toEqual([]);
    expect([...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((x) => !/^(https?:|#|\/)/.test(x ?? ""))).toEqual([]);
    // Le texte hostile reste lisible, comme du texte.
    expect(document.body.textContent).toContain("<script>alert(1)</script>");
  });

  it("n'accepte que des liens http(s)", () => {
    expect(safeHref("https://commons.wikimedia.org/wiki/File:A.jpg")).toBe("https://commons.wikimedia.org/wiki/File:A.jpg");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "//evil", "", null]) expect(safeHref(bad)).toBeNull();
  });
});

describe("panne à l'export", () => {
  it("produit le PDF sans l'image quand celle-ci est illisible", async () => {
    const { explanation, blueprint } = hostileReport();
    const pdf = await renderReportPdf({
      blueprint,
      explanation,
      evidence: demoEvidence,
      segments: demoSegments,
      sourceTitle: DEMO_SOURCE_TITLE,
      sourceUrl: "javascript:alert(1)",
      images: { "00000000-0000-4000-8000-000000000001": { data: Buffer.from("pas une image"), format: "jpg", width: 960, height: 640, credit: "x" } },
    });
    const text = (await extractPdf(new Uint8Array(pdf), { maxPages: 50 })).blocks.map((b) => b.text).join(" ");
    expect(text).toContain(demoExplanation.sections.at(-1)!.question);
    // Aucun lien actif vers javascript: dans le fichier (le texte hostile n'est que du texte).
    expect(Buffer.from(pdf).toString("latin1")).not.toMatch(/\/URI\s*\(javascript/i);
  }, 60_000);
});
