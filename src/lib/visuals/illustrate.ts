/**
 * Illustrations d'un rapport (cahier V2, § 9-10 ; Atlas). Ordre en mode auto : schémas (déjà
 * faits par le moteur), illustrations vectorielles Recraft (dans la limite du rapport), banque
 * autorisée (Commons, puis Unsplash si activé), puis planche Gemini Image si activée et dans le quota. Sinon le visuel est retiré : le texte validé reste seul.
 * Une illustration n'est jamais une preuve ; ses crédits vivent dans visual_assets.
 */
import type { ReportBlueprint, VisualMode } from "@/lib/contracts/schemas";
import type { UsageReport } from "@/lib/engine/provider";
import { IllustrationData } from "@/lib/render/visuals";
import type { VisualConfig } from "./config";
import { plateGrid, platePrompt, PLATE_MAX } from "./plate-prompt";
import { rankCandidates, type Candidate, type StoredImage } from "./sources";

/** Illustrations par rapport (V4.1 : jusqu'à 4, générées si besoin en une seule planche). */
export const MAX_ILLUSTRATIONS = 4;
/** Temps total accordé à la recherche d'images (cahier : 8 s). */
export const SEARCH_BUDGET_MS = 8_000;

/** Image vectorielle assainie, prête à stocker. */
export interface StoredVector {
  bytes: Buffer;
  mime: "image/svg+xml";
  width: number;
  height: number;
  sha256: string;
}

export interface AssetRow {
  provider: Candidate["provider"] | "gemini" | "recraft";
  kind: "photo" | "illustration" | "generated";
  query: string;
  source_url: string | null;
  remote_url: string | null;
  storage_path: string | null;
  mime: string | null;
  width: number;
  height: number;
  byte_size: number | null;
  sha256: string | null;
  author: string | null;
  license: string | null;
  license_url: string | null;
  modifications: string | null;
  model: string | null;
}

export interface IllustrateDeps {
  searchCommons(query: string, timeoutMs: number): Promise<Candidate[]>;
  downloadCommons(c: Candidate, timeoutMs: number): Promise<StoredImage | null>;
  searchUnsplash?(query: string, timeoutMs: number): Promise<Candidate[]>;
  trackUnsplash?(location: string): Promise<void>;
  generateImage?(prompt: string, aspectRatio: "1:1" | "16:9" | "3:2" | "4:3"): Promise<{ bytes: Buffer; mime: string; usage: UsageReport }>;
  /** Découpe une planche en images à fond transparent (une par case). */
  cutPlate?(bytes: Buffer, n: number): Promise<(StoredImage | null)[]>;
  onImageUsage?(attempt: number, usage: UsageReport): Promise<void> | void;
  /** Images générées ce mois-ci par le compte. */
  generatedThisMonth(): Promise<number>;
  /** Illustration vectorielle (Recraft) : SVG déjà assaini. */
  generateVector?(item: { subject: string; purpose: string; altText: string }): Promise<{ vector: StoredVector; usage: UsageReport }>;
  onVectorUsage?(attempt: number, usage: UsageReport): Promise<void> | void;
  /** Illustrations vectorielles encore permises pour ce rapport (Atlas : 1 / 2 / 4). */
  vectorBudget?: number;
  /** Dépôt privé ; renvoie le chemin, ou null en cas d'échec. */
  store(img: StoredImage | StoredVector, ext: "jpg" | "png" | "svg"): Promise<string | null>;
  /** Enregistre l'actif ; renvoie son identifiant, ou null. */
  insertAsset(row: AssetRow): Promise<string | null>;
  now?(): number;
}

/** Consigne d'image (cahier, § 10) : brève, expurgée, sans texte ni chiffre. */
export function imagePrompt(subject: string, purpose: string, altText: string): string {
  return `Crée une illustration pédagogique de ${subject}, pour montrer ${purpose}. Style éditorial simple, fond clair, palette ivoire, encre et jaune doux, format 4:3. Respecte uniquement ces éléments validés : ${altText}. Aucun texte, logo, chiffre ni détail documentaire inventé. Cette image sera légendée comme illustration générée.`;
}

function withoutVisual(bp: ReportBlueprint, id: string): ReportBlueprint {
  return {
    ...bp,
    visual_specs: bp.visual_specs.filter((v) => v.id !== id),
    sections: bp.sections.map((s) => ({ ...s, visual_ids: s.visual_ids.filter((v) => v !== id) })),
  };
}

function withAsset(bp: ReportBlueprint, id: string, assetId: string): ReportBlueprint {
  return {
    ...bp,
    visual_specs: bp.visual_specs.map((v) => (v.id === id ? { ...v, data: { ...v.data, asset_id: assetId } } : v)),
  };
}

export function pendingIllustrations(bp: ReportBlueprint) {
  return bp.visual_specs.flatMap((v) => {
    if (v.kind !== "illustration") return [];
    const d = IllustrationData.safeParse(v.data);
    return d.success && !d.data.asset_id ? [{ spec: v, data: d.data }] : [];
  });
}

export async function illustrate(
  blueprint: ReportBlueprint,
  mode: VisualMode,
  config: VisualConfig,
  deps: IllustrateDeps,
): Promise<{ blueprint: ReportBlueprint; notes: string[]; added: number }> {
  const now = deps.now ?? Date.now;
  const deadline = now() + SEARCH_BUDGET_MS;
  const notes: string[] = [];
  let bp = blueprint;
  let added = 0;
  const pending = pendingIllustrations(bp);
  if (mode === "aucun" || mode === "schemas") {
    for (const p of pending) bp = withoutVisual(bp, p.spec.id);
    return { blueprint: bp, notes, added };
  }
  const useGemini = config.geminiImage && !!deps.generateImage && (mode === "gemini" || mode === "auto");
  let generated = useGemini ? await deps.generatedThisMonth() : 0;
  let imageAttempt = 0;

  const items = pending.slice(0, MAX_ILLUSTRATIONS);
  const found = new Map<string, string>();

  // Illustrations conceptuelles vectorielles (Recraft) : sans texte ni chiffre, dans la limite du rapport.
  let vectorsLeft = mode === "auto" || mode === "gemini" ? (deps.generateVector ? (deps.vectorBudget ?? 0) : 0) : 0;
  let vectorAttempt = 0;
  const tryVector = async ({ spec, data }: (typeof items)[number]): Promise<string | null> => {
    if (vectorsLeft <= 0 || !deps.generateVector) return null;
    vectorsLeft--;
    vectorAttempt++;
    try {
      const out = await deps.generateVector({ subject: data.subject, purpose: spec.purpose, altText: spec.alt_text });
      await deps.onVectorUsage?.(vectorAttempt, out.usage);
      const path = await deps.store(out.vector, "svg");
      if (!path) return null;
      return deps.insertAsset({
        provider: "recraft",
        kind: "generated",
        query: data.query,
        source_url: null,
        remote_url: null,
        storage_path: path,
        mime: out.vector.mime,
        width: out.vector.width,
        height: out.vector.height,
        byte_size: out.vector.bytes.length,
        sha256: out.vector.sha256,
        author: null,
        license: null,
        license_url: null,
        modifications: "Illustration vectorielle générée, nettoyée (aucun script ni lien externe)",
        model: out.usage.model,
      });
    } catch (e) {
      const usage = (e as { usage?: UsageReport }).usage;
      if (usage) await deps.onVectorUsage?.(vectorAttempt, usage);
      return null;
    }
  };
  for (const it of items) {
    if (vectorsLeft <= 0) break;
    const id = await tryVector(it);
    if (id) found.set(it.spec.id, id);
  }

  // Banque autorisée : Commons d'abord (stocké, PDF possible), Unsplash ensuite (web seulement).
  const tryWeb = async ({ data }: (typeof items)[number]): Promise<string | null> => {
    if (config.commons && now() < deadline) {
      const candidates = await deps.searchCommons(data.query, Math.max(500, deadline - now())).catch(() => []);
      for (const c of rankCandidates(data.query, candidates).slice(0, 2)) {
        if (now() >= deadline) break;
        const img = await deps.downloadCommons(c, Math.max(500, deadline - now())).catch(() => null);
        if (!img) continue;
        const path = await deps.store(img, img.mime === "image/png" ? "png" : "jpg");
        if (!path) continue;
        return deps.insertAsset({
          provider: "commons",
          kind: c.kind,
          query: data.query,
          source_url: c.sourceUrl,
          remote_url: null,
          storage_path: path,
          mime: img.mime,
          width: img.width,
          height: img.height,
          byte_size: img.bytes.length,
          sha256: img.sha256,
          author: c.author,
          license: c.license,
          license_url: c.licenseUrl,
          modifications: c.modifications,
          model: null,
        });
      }
    }
    if (config.unsplash && deps.searchUnsplash && now() < deadline) {
      const candidates = await deps.searchUnsplash(data.query, Math.max(500, deadline - now())).catch(() => []);
      const c = rankCandidates(data.query, candidates)[0];
      if (c) {
        if (c.downloadLocation) await deps.trackUnsplash?.(c.downloadLocation);
        return deps.insertAsset({
          provider: "unsplash",
          kind: c.kind,
          query: data.query,
          source_url: c.sourceUrl,
          remote_url: c.imageUrl,
          storage_path: null,
          mime: null,
          width: c.width,
          height: c.height,
          byte_size: null,
          sha256: null,
          author: c.author,
          license: c.license,
          license_url: c.licenseUrl,
          modifications: null,
          model: null,
        });
      }
    }
    return null;
  };

  // Planche : toutes les illustrations restantes en UNE génération, découpées sans fond.
  const tryPlate = async (todo: typeof items) => {
    if (!useGemini || !deps.cutPlate || todo.length === 0 || generated >= config.monthlyGenerated) return;
    const batch = todo.slice(0, Math.min(PLATE_MAX, config.monthlyGenerated - generated));
    imageAttempt++;
    try {
      const prompt = platePrompt(batch.map(({ spec, data }) => ({ subject: data.subject, purpose: spec.purpose, altText: spec.alt_text })));
      const out = await deps.generateImage!(prompt, plateGrid(batch.length).aspectRatio);
      await deps.onImageUsage?.(imageAttempt, out.usage);
      const cells = await deps.cutPlate(out.bytes, batch.length);
      for (const [k, cell] of cells.entries()) {
        const item = batch[k];
        if (!cell || !item) continue;
        const path = await deps.store(cell, "png");
        if (!path) continue;
        const id = await deps.insertAsset({
          provider: "gemini",
          kind: "generated",
          query: item.data.query,
          source_url: null,
          remote_url: null,
          storage_path: path,
          mime: cell.mime,
          width: cell.width,
          height: cell.height,
          byte_size: cell.bytes.length,
          sha256: cell.sha256,
          author: null,
          license: null,
          license_url: null,
          modifications: "Découpée d'une planche, fond rendu transparent",
          model: out.usage.model,
        });
        if (id) {
          found.set(item.spec.id, id);
          generated++;
        }
      }
    } catch (e) {
      // Un appel image échoué peut quand même être facturé : il est journalisé.
      const usage = (e as { usage?: UsageReport }).usage;
      if (usage) await deps.onImageUsage?.(imageAttempt, usage);
    }
  };

  const rest = () => items.filter((it) => !found.has(it.spec.id));
  if (mode === "gemini") {
    await tryPlate(rest());
    for (const it of rest()) { const id = await tryWeb(it); if (id) found.set(it.spec.id, id); }
  } else {
    for (const it of rest()) { const id = await tryWeb(it); if (id) found.set(it.spec.id, id); }
    await tryPlate(rest());
  }

  for (const { spec, data } of items) {
    const assetId = found.get(spec.id);
    if (assetId) {
      bp = withAsset(bp, spec.id, assetId);
      added++;
    } else {
      bp = withoutVisual(bp, spec.id);
      notes.push(`Aucune illustration exploitable pour « ${data.subject} » : texte seul.`);
    }
  }
  // Au-delà du maximum : retirées sans recherche.
  for (const p of pending.slice(MAX_ILLUSTRATIONS)) bp = withoutVisual(bp, p.spec.id);
  return { blueprint: bp, notes, added };
}

/**
 * Nouvelle version complète : les illustrations déjà trouvées sont reprises (aucune nouvelle
 * recherche ni génération), placées dans la même section si elle existe encore.
 */
export function carryIllustrations(previous: ReportBlueprint, next: ReportBlueprint): ReportBlueprint {
  let bp = next;
  for (const v of next.visual_specs.filter((x) => x.kind === "illustration")) bp = withoutVisual(bp, v.id);
  const kept = previous.visual_specs.filter((v) => v.kind === "illustration" && IllustrationData.safeParse(v.data).data?.asset_id);
  const sectionIds = new Set(bp.sections.map((s) => s.section_id));
  for (const v of kept) {
    const home = previous.sections.find((s) => s.visual_ids.includes(v.id))?.section_id;
    const target = home && sectionIds.has(home) ? home : bp.sections[0]?.section_id;
    if (!target) continue;
    bp = {
      ...bp,
      visual_specs: [...bp.visual_specs, v],
      sections: bp.sections.map((s) => (s.section_id === target ? { ...s, visual_ids: [...s.visual_ids, v.id].slice(0, 5) } : s)),
    };
  }
  return bp;
}
