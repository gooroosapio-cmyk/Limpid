/**
 * Illustrations d'un rapport (cahier V2, § 9-10). Ordre en mode auto : schémas (déjà faits
 * par le moteur), banque autorisée (Commons, puis Unsplash si activé), puis Gemini Image si
 * activé et dans le quota. Sinon le visuel est retiré : le texte validé reste seul.
 * Une illustration n'est jamais une preuve ; ses crédits vivent dans visual_assets.
 */
import type { ReportBlueprint, VisualMode } from "@/lib/contracts/schemas";
import type { UsageReport } from "@/lib/engine/provider";
import { IllustrationData } from "@/lib/render/visuals";
import type { VisualConfig } from "./config";
import { checkImage, rankCandidates, type Candidate, type StoredImage } from "./sources";

/** Illustrations par rapport (cahier : 2 au plus). */
export const MAX_ILLUSTRATIONS = 2;
/** Temps total accordé à la recherche d'images (cahier : 8 s). */
export const SEARCH_BUDGET_MS = 8_000;

export interface AssetRow {
  provider: Candidate["provider"] | "gemini";
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
  generateImage?(prompt: string): Promise<{ bytes: Buffer; mime: string; usage: UsageReport }>;
  onImageUsage?(attempt: number, usage: UsageReport): Promise<void> | void;
  /** Images générées ce mois-ci par le compte. */
  generatedThisMonth(): Promise<number>;
  /** Dépôt privé ; renvoie le chemin, ou null en cas d'échec. */
  store(img: StoredImage, ext: "jpg" | "png"): Promise<string | null>;
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

  for (const { spec, data } of pending.slice(0, MAX_ILLUSTRATIONS)) {
    let assetId: string | null = null;

    // En mode « gemini », la banque reste le repli ; en mode auto, elle passe d'abord.
    const tryWeb = async () => {
      // Banque autorisée : Commons d'abord (stocké, PDF possible), Unsplash ensuite (web seulement).
      if (config.commons && now() < deadline) {
        const found = await deps.searchCommons(data.query, Math.max(500, deadline - now())).catch(() => []);
        for (const c of rankCandidates(data.query, found).slice(0, 2)) {
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
        const found = await deps.searchUnsplash(data.query, Math.max(500, deadline - now())).catch(() => []);
        const c = rankCandidates(data.query, found)[0];
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

    const tryGemini = async () => {
      if (!useGemini || generated >= config.monthlyGenerated || imageAttempt >= MAX_ILLUSTRATIONS) return null;
      imageAttempt++;
      try {
        const out = await deps.generateImage!(imagePrompt(data.subject, spec.purpose, spec.alt_text));
        await deps.onImageUsage?.(imageAttempt, out.usage);
        generated++;
        const img = checkImage(out.bytes);
        if (!img) return null;
        const path = await deps.store(img, img.mime === "image/png" ? "png" : "jpg");
        if (!path) return null;
        return deps.insertAsset({
          provider: "gemini",
          kind: "generated",
          query: data.query,
          source_url: null,
          remote_url: null,
          storage_path: path,
          mime: img.mime,
          width: img.width,
          height: img.height,
          byte_size: img.bytes.length,
          sha256: img.sha256,
          author: null,
          license: null,
          license_url: null,
          modifications: null,
          model: out.usage.model,
        });
      } catch (e) {
        // Un appel image échoué peut quand même être facturé : il est journalisé.
        const usage = (e as { usage?: UsageReport }).usage;
        if (usage) await deps.onImageUsage?.(imageAttempt, usage);
        return null;
      }
    };

    assetId = mode === "gemini" ? ((await tryGemini()) ?? (await tryWeb())) : ((await tryWeb()) ?? (await tryGemini()));
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
