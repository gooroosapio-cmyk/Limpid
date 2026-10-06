import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { ReportBlueprint } from "@/lib/contracts/schemas";
import { safeImageQuery } from "@/lib/render/visuals";
import { availableVisualModes, effectiveVisualMode, visualConfig } from "./config";
import { creditText } from "./credit";
import { illustrate, type AssetRow, type IllustrateDeps } from "./illustrate";
import { DEFAULT_IMAGE_SETTINGS, diagramPrompt, imageAttempts, imageSettingsFrom } from "./image-models";
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

const usage = (model: string) => ({ provider: "x", model, inputTokens: 1, outputTokens: 1, durationMs: 1, requestId: null });

function deps(over: Partial<IllustrateDeps> = {}): IllustrateDeps & { rows: AssetRow[]; calls: string[] } {
  const rows: AssetRow[] = [];
  const calls: string[] = [];
  return {
    rows,
    calls,
    settings: DEFAULT_IMAGE_SETTINGS,
    available: { recraft: true, nanobanana: true },
    render: async (route, style) => {
      calls.push(`${style}:${route.provider}:${route.model}`);
      return { image: checkImage(png(960, 640))!, usage: usage(route.model) };
    },
    store: async (_img, ext) => `o/r/assets/x.${ext}`,
    insertAsset: async (row) => {
      rows.push(row);
      return `00000000-0000-4000-8000-00000000000${rows.length}`;
    },
    ...over,
  };
}

function styled(): ReportBlueprint {
  const bp = blueprint();
  return { ...bp, visual_specs: bp.visual_specs.map((v, i) => ({ ...v, data: { ...v.data, ...(i === 0 ? { style: "vector" } : { style: "diagram", content: "Évaporation → Condensation → Pluie" }) } })) };
}

describe("illustrations V5 : route par type de visuel", () => {
  it("illustration par Recraft, schéma par Gemini (réglages par défaut)", async () => {
    const d = deps();
    const out = await illustrate(styled(), "auto", d);
    expect(out.added).toBe(2);
    expect(d.calls.sort()).toEqual(["diagram:nanobanana:google/gemini-3.1-flash-image", "vector:recraft:recraftv4_1_vector"]);
    expect(d.rows.map((r) => r.provider).sort()).toEqual(["gemini", "recraft"]);
  });

  it("repli sur l'autre fournisseur, appel échoué journalisé", async () => {
    const logged: string[] = [];
    const d = deps({
      render: async (route) => {
        if (route.provider === "recraft") throw Object.assign(new Error("402"), { usage: usage(route.model) });
        return { image: checkImage(png(960, 640))!, usage: usage(route.model) };
      },
      onUsage: (route, attempt) => void logged.push(`${route.provider}:${attempt}`),
    });
    const out = await illustrate({ ...styled(), visual_specs: [styled().visual_specs[0]!] }, "auto", d);
    expect(out.added).toBe(1);
    expect(logged).toEqual(["recraft:1", "nanobanana:2"]);
  });

  it("réglage admin respecté, fournisseur absent ignoré, rien sans image exploitable", async () => {
    const d = deps({ settings: { ...DEFAULT_IMAGE_SETTINGS, vector: { provider: "nanobanana", model: "google/gemini-3.1-flash-image" } }, available: { recraft: false, nanobanana: true } });
    await illustrate({ ...styled(), visual_specs: [styled().visual_specs[0]!] }, "auto", d);
    expect(d.calls).toEqual(["vector:nanobanana:google/gemini-3.1-flash-image"]);
    const none = deps({ available: { recraft: false, nanobanana: false } });
    const out = await illustrate(styled(), "auto", none);
    expect(out.blueprint.visual_specs).toHaveLength(0);
    expect(out.blueprint.sections[0]!.visual_ids).toEqual([]);
  });

  it("aucune image en texte seul ou quand les illustrations sont coupées", async () => {
    expect((await illustrate(styled(), "aucun", deps())).blueprint.visual_specs).toHaveLength(0);
    const off = deps({ settings: { ...DEFAULT_IMAGE_SETTINGS, enabled: false } });
    expect((await illustrate(styled(), "auto", off)).added).toBe(0);
    expect(off.calls).toEqual([]);
  });

  it("« Schémas seulement » : le schéma reste, l'illustration décorative est retirée", async () => {
    const d = deps();
    const out = await illustrate(styled(), "schemas", d);
    expect(d.calls).toEqual(["diagram:nanobanana:google/gemini-3.1-flash-image"]);
    expect(out.blueprint.visual_specs).toHaveLength(1);
  });
});

describe("catalogue des modèles d'image", () => {
  it("réglages en base nettoyés : modèle inconnu ou incohérent → défaut du type", () => {
    expect(imageSettingsFrom({ images_enabled: true, image_vector_provider: "recraft", image_vector_model: "google/gemini-3.1-flash-image", image_realistic_provider: "recraft", image_realistic_model: "recraftv4_1" })).toEqual({
      enabled: true,
      vector: DEFAULT_IMAGE_SETTINGS.vector,
      realistic: { provider: "recraft", model: "recraftv4_1" },
      diagram: DEFAULT_IMAGE_SETTINGS.diagram,
    });
    expect(imageAttempts("diagram", DEFAULT_IMAGE_SETTINGS, { recraft: true, nanobanana: true })).toEqual([
      { provider: "nanobanana", model: "google/gemini-3.1-flash-image" },
      { provider: "recraft", model: "recraftv4_1" },
    ]);
    expect(diagramPrompt("Cycle de l'eau", "ordre des étapes", "Évaporation → Pluie")).toMatch(/portrait 3:4.*Évaporation → Pluie.*symmetrical/s);
  });
});
