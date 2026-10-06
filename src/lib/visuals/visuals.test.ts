import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { ReportBlueprint } from "@/lib/contracts/schemas";
import { safeImageQuery } from "@/lib/render/visuals";
import { availableVisualModes, effectiveVisualMode, visualConfig } from "./config";
import { creditText } from "./credit";
import { carryIllustrations, illustrate, mergeVisualPasses, type AssetRow, type IllustrateDeps } from "./illustrate";
import { checkImage, commonsCandidates, plainText, rankCandidates, relevance, unsplashCandidates, type Candidate } from "./sources";

/** PNG valide minimal (en-tête IHDR lu par imageSize). */
function png(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
  };
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.alloc(10))), chunk("IEND", Buffer.alloc(0))]);
}

const page = (index: number, title: string, license: string, extra: Record<string, unknown> = {}) => ({
  index,
  title: `File:${title}.jpg`,
  imageinfo: [
    {
      mime: "image/jpeg",
      thumburl: `https://thumb.wikimedia.org/wikipedia/commons/thumb/x/${index}.jpg/960px-x.jpg`,
      thumbwidth: 960,
      thumbheight: 640,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${title}.jpg`,
      extmetadata: {
        License: { value: license },
        LicenseShortName: { value: license.toUpperCase() },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
        Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:X">Jeanne &amp; Co</a>' },
        ...extra,
      },
    },
  ],
});

describe("connecteur Wikimedia Commons", () => {
  it("garde les licences réutilisables et écarte restrictions, licences inconnues et hôtes étrangers", () => {
    const json = {
      query: {
        pages: [
          page(3, "Rain_cloud", "cc-by-sa-4.0"),
          page(1, "Water_cycle", "cc0"),
          page(2, "Logo", "cc-by-4.0", { Restrictions: { value: "trademarked" } }),
          page(4, "Unknown", "fair use"),
          { ...page(5, "Evil", "pd"), imageinfo: [{ ...page(5, "Evil", "pd").imageinfo[0], thumburl: "https://evil.example/x.jpg" }] },
        ],
      },
    };
    const c = commonsCandidates(json);
    expect(c.map((x) => x.title)).toEqual(["Water cycle", "Rain cloud"]);
    expect(c[0]!.author).toBe("Jeanne & Co");
    expect(c[0]!.sourceUrl).toBe("https://commons.wikimedia.org/wiki/File:Water_cycle.jpg");
    expect(c[0]!.modifications).toBe("Redimensionnée");
  });

  it("classe par pertinence et écarte les fichiers hors sujet", () => {
    expect(relevance("water drops leaf", "Water drop on banana leaf")).toBe(1);
    const cands = [{ title: "Red car on a road" }, { title: "Clouds over the sea" }, { title: "Rain clouds" }] as Candidate[];
    expect(rankCandidates("rain clouds", cands).map((c) => c.title)).toEqual(["Rain clouds", "Clouds over the sea"]);
  });

  it("nettoie le HTML des métadonnées", () => {
    expect(plainText("<span>A&nbsp;<b>B</b></span>")).toBe("A B");
    expect(plainText("  ")).toBeNull();
  });
});

describe("connecteur Unsplash", () => {
  it("n'accepte que l'hébergeur officiel et ajoute le suivi de provenance", () => {
    const c = unsplashCandidates({
      results: [
        { width: 4000, height: 3000, urls: { regular: "https://images.unsplash.com/photo-1" }, links: { html: "https://unsplash.com/photos/1", download_location: "https://api.unsplash.com/photos/1/download" }, user: { name: "Ana" }, alt_description: "rain on window" },
        { width: 100, height: 100, urls: { regular: "https://evil.example/2" }, links: { html: "https://unsplash.com/photos/2" } },
      ],
    });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ width: 1080, height: 810, author: "Ana", sourceUrl: "https://unsplash.com/photos/1?utm_source=limpid&utm_medium=referral" });
  });
});

describe("contrôle des images", () => {
  it("vérifie la signature et les dimensions", () => {
    expect(checkImage(png(960, 640))).toMatchObject({ mime: "image/png", width: 960, height: 640 });
    expect(checkImage(png(50, 50))).toBeNull();
    expect(checkImage(Buffer.from("<svg/>"))).toBeNull();
  });
  it("expurge les requêtes", () => {
    expect(safeImageQuery("<b>Rain</b> 2024 !! clouds")).toBe("rain clouds");
    expect(safeImageQuery("12 34")).toBeNull();
  });
});

describe("configuration des illustrations", () => {
  it("n'active aucune dépendance payante sans configuration explicite", () => {
    const c = visualConfig({} as NodeJS.ProcessEnv);
    expect(c).toMatchObject({ commons: true, unsplash: false, geminiImage: false });
    expect(availableVisualModes(c)).toEqual(["auto", "schemas", "web", "aucun"]);
    expect(effectiveVisualMode("gemini", c)).toBe("auto");
    const all = visualConfig({ UNSPLASH_ACCESS_KEY: "k", LIMPID_ILLUSTRATIONS_UNSPLASH: "on", LIMPID_IMAGE_MODEL: "img", LIMPID_ILLUSTRATIONS_GEMINI: "on" } as unknown as NodeJS.ProcessEnv);
    expect(availableVisualModes(all)).toContain("gemini");
  });
  it("rédige les crédits", () => {
    expect(creditText({ provider: "commons", author: "A", license: "CC BY-SA 4.0", licenseUrl: "https://l", sourceUrl: "https://s", modifications: "Redimensionnée", model: null })).toBe(
      "A · CC BY-SA 4.0 (https://l) · Wikimedia Commons : https://s · Redimensionnée",
    );
    expect(creditText({ provider: "gemini", author: null, license: null, licenseUrl: null, sourceUrl: null, modifications: null, model: "m" })).toContain("sans valeur documentaire");
  });
});

/* ---------- Orchestration ---------- */

function blueprint(): ReportBlueprint {
  const ill = (n: number) => ({
    id: `vis_ill_${n}`,
    kind: "illustration" as const,
    purpose: "Illustrer",
    claim_ids: ["clm_1"],
    evidence_ids: [],
    data: { query: n === 1 ? "rain clouds" : "ocean waves", subject: `Sujet ${n}`, asset_id: null },
    alt_text: "Une image.",
    caption: `Sujet ${n}`,
    illustrative_only: true,
  });
  return {
    schema_version: "1.0.0",
    id: "bp_1",
    explanation_id: "exp_1",
    template_id: "comprendre_sujet",
    target_pages: 5,
    title: "T",
    sections: [{ section_id: "sec_1", visual_ids: ["vis_ill_1", "vis_ill_2"], page_hint: 1 }],
    visual_specs: [ill(1), ill(2)],
    source_index: [],
    layout_warnings: [],
  } as ReportBlueprint;
}

function deps(over: Partial<IllustrateDeps> = {}): IllustrateDeps & { rows: AssetRow[] } {
  const rows: AssetRow[] = [];
  return {
    rows,
    searchCommons: async (q) => (q === "rain clouds" ? [{ provider: "commons", title: "Rain clouds", kind: "photo", imageUrl: "https://upload.wikimedia.org/a.png", width: 960, height: 640, sourceUrl: "https://commons.wikimedia.org/wiki/File:A", author: "A", license: "CC0", licenseUrl: null, modifications: "Redimensionnée" }] : []),
    downloadCommons: async () => checkImage(png(960, 640)),
    generatedThisMonth: async () => 0,
    store: async (_img, ext) => `o/r/assets/x.${ext}`,
    insertAsset: async (row) => {
      rows.push(row);
      return `00000000-0000-4000-8000-00000000000${rows.length}`;
    },
    ...over,
  };
}

const configOff = visualConfig({} as NodeJS.ProcessEnv);

describe("orchestration des illustrations", () => {
  it("prend une image libre de droits, retire celle sans résultat, sans génération non activée", async () => {
    const d = deps({ generateImage: async () => { throw new Error("ne doit pas être appelé"); } });
    const out = await illustrate(blueprint(), "auto", configOff, d);
    expect(out.added).toBe(1);
    expect(out.blueprint.visual_specs.map((v) => v.id)).toEqual(["vis_ill_1"]);
    expect(out.blueprint.visual_specs[0]!.data.asset_id).toBe("00000000-0000-4000-8000-000000000001");
    expect(out.blueprint.sections[0]!.visual_ids).toEqual(["vis_ill_1"]);
    expect(d.rows[0]).toMatchObject({ provider: "commons", license: "CC0", storage_path: "o/r/assets/x.png", width: 960 });
    expect(out.notes[0]).toContain("Sujet 2");
  });

  it("illustrations vectorielles Recraft d'abord, dans la limite du rapport", async () => {
    const config = { ...configOff, commons: true };
    let calls = 0;
    const generateVector = async () => {
      calls++;
      const bytes = Buffer.from('<svg viewBox="0 0 800 600"></svg>');
      return { vector: { bytes, mime: "image/svg+xml" as const, width: 800, height: 600, sha256: "a".repeat(64) }, usage: { provider: "recraft", model: "recraftv4_1_vector", inputTokens: null, outputTokens: null, durationMs: 1, requestId: null, costUsd: 0.08 } };
    };
    const d = deps({ generateVector, vectorBudget: 1 });
    const out = await illustrate(blueprint(), "auto", config, d);
    expect(calls).toBe(1);
    expect(d.rows[0]).toMatchObject({ provider: "recraft", mime: "image/svg+xml", storage_path: "o/r/assets/x.svg" });
    // La seconde illustration passe par la banque (aucune deuxième image vectorielle).
    expect(out.added).toBeGreaterThanOrEqual(1);
    // Mode « schémas » : aucune image vectorielle.
    calls = 0;
    await illustrate(blueprint(), "schemas", config, deps({ generateVector, vectorBudget: 4 }));
    expect(calls).toBe(0);
  });

  it("respecte le quota mensuel d'images générées", async () => {
    const config = { ...configOff, commons: false, geminiImage: true, imageModel: "img", monthlyGenerated: 20 };
    let calls = 0;
    const gen = async () => {
      calls++;
      return { bytes: png(1024, 768), mime: "image/png", usage: { provider: "gemini", model: "img", inputTokens: 1, outputTokens: 1, durationMs: 1, requestId: null } };
    };
    const cutPlate = async (_b: Buffer, n: number) => Array.from({ length: n }, () => checkImage(png(400, 300)));
    const ok = await illustrate(blueprint(), "gemini", config, deps({ generateImage: gen, cutPlate, generatedThisMonth: async () => 19 }));
    expect(calls).toBe(1);
    expect(ok.added).toBe(1);
    const full = await illustrate(blueprint(), "gemini", config, deps({ generateImage: gen, cutPlate, generatedThisMonth: async () => 20 }));
    expect(calls).toBe(1);
    expect(full.added).toBe(0);
  });

  it("génère toutes les illustrations en une seule planche, découpée sans fond", async () => {
    const config = { ...configOff, commons: false, geminiImage: true, imageModel: "img", monthlyGenerated: 20 };
    const prompts: string[] = [];
    const ratios: string[] = [];
    const gen = async (prompt: string, ratio: string) => {
      prompts.push(prompt);
      ratios.push(ratio);
      return { bytes: png(1600, 900), mime: "image/png", usage: { provider: "gemini", model: "img", inputTokens: 1, outputTokens: 1, durationMs: 1, requestId: null } };
    };
    const d = deps({ generateImage: gen, cutPlate: async (_b, n) => Array.from({ length: n }, () => checkImage(png(400, 300))) });
    const out = await illustrate(blueprint(), "auto", config, d);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("2 illustrations distinctes");
    expect(prompts[0]).toContain("Fond blanc pur");
    expect(ratios).toEqual(["16:9"]);
    expect(out.added).toBe(2);
    expect(d.rows.map((r) => r.modifications)).toEqual(["Découpée d'une planche, fond rendu transparent", "Découpée d'une planche, fond rendu transparent"]);
  });

  it("ne cherche rien en mode schémas ou aucun", async () => {
    const d = deps({ searchCommons: async () => { throw new Error("ne doit pas chercher"); } });
    const out = await illustrate(blueprint(), "schemas", configOff, d);
    expect(out.blueprint.visual_specs).toHaveLength(0);
  });

  it("reprend les illustrations trouvées dans une nouvelle version", async () => {
    const prev = (await illustrate(blueprint(), "auto", configOff, deps())).blueprint;
    const next = { ...blueprint(), sections: [{ section_id: "sec_1", visual_ids: ["vis_ill_1"], page_hint: 1 }] };
    const carried = carryIllustrations(prev, next);
    expect(carried.visual_specs).toEqual(prev.visual_specs);
    expect(carried.sections[0]!.visual_ids).toEqual(["vis_ill_1"]);
  });
});

describe("panne de la génération d'image", () => {
  it("se replie sur la banque d'images et journalise l'appel échoué", async () => {
    const config = { ...configOff, geminiImage: true, imageModel: "img" };
    const usages: number[] = [];
    const err = Object.assign(new Error("HTTP 500"), { usage: { provider: "gemini", model: "img", inputTokens: 1, outputTokens: 0, durationMs: 5, requestId: null } });
    const out = await illustrate(blueprint(), "gemini", config, deps({ generateImage: async () => { throw err; }, cutPlate: async () => [], onImageUsage: (a) => void usages.push(a) }));
    expect(out.blueprint.visual_specs.map((v) => v.id)).toEqual(["vis_ill_1"]);
    // Une seule génération (la planche), journalisée même en échec.
    expect(usages).toEqual([1]);
  });
});

describe("passes visuelles parallèles", () => {
  it("garde les dessins ajoutés, les actifs posés et retire les illustrations abandonnées", () => {
    const base = blueprint();
    const drawing = { ...base.visual_specs[0]!, id: "vis_drw_1", kind: "drawing" } as ReportBlueprint["visual_specs"][number];
    const drawn: ReportBlueprint = {
      ...base,
      visual_specs: [...base.visual_specs, drawing],
      sections: [{ ...base.sections[0]!, visual_ids: [...base.sections[0]!.visual_ids, "vis_drw_1"] }],
    };
    const first = base.visual_specs[0]!;
    const illustrated: ReportBlueprint = {
      ...base,
      visual_specs: [{ ...first, data: { ...first.data, asset_id: "11111111-1111-1111-1111-111111111111" } }],
      sections: [{ ...base.sections[0]!, visual_ids: ["vis_ill_1"] }],
    };
    const out = mergeVisualPasses(base, drawn, illustrated);
    expect(out.visual_specs.map((v) => v.id)).toEqual(["vis_ill_1", "vis_drw_1"]);
    expect((out.visual_specs[0]!.data as { asset_id: string }).asset_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(out.sections[0]!.visual_ids).toEqual(["vis_ill_1", "vis_drw_1"]);
  });
});
