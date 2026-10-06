/**
 * Illustrations d'un cours (V5) : 0 ou 1 par chapitre, 3 au plus, générées seulement quand le
 * plan les juge utiles. Chaque image suit la route réglée pour son type dans la console admin
 * (Recraft pour les illustrations, Gemini pour les schémas composés pour le téléphone), puis
 * l'autre fournisseur en repli. Sans image exploitable, le visuel est retiré : le texte reste.
 * Une illustration n'est jamais une preuve ; ses crédits vivent dans visual_assets.
 */
import type { ReportBlueprint, VisualMode } from "@/lib/contracts/schemas";
import type { UsageReport } from "@/lib/engine/provider";
import { IllustrationData } from "@/lib/render/visuals";
import type { ImageProviderId, ImageRoute, ImageSettings, ImageStyle } from "./image-models";
import { imageAttempts } from "./image-models";
import type { Candidate, StoredImage } from "./sources";
import type { SvgLibrary } from "./svg-library";

/** Images générées par cours : 3 images + 2 SVG au plus (le plan applique le plafond par taille). */
export const MAX_ILLUSTRATIONS = 5;

/** Image vectorielle assainie, prête à stocker. */
export interface StoredVector {
  bytes: Buffer;
  mime: "image/svg+xml";
  width: number;
  height: number;
  sha256: string;
}

export interface AssetRow {
  provider: Candidate["provider"] | "gemini" | "recraft" | "seedream";
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
  settings: ImageSettings;
  /** Fournisseurs configurés (clé présente). */
  available: Record<ImageProviderId, boolean>;
  /** Génère une image pour une route ; SVG déjà assaini, image matricielle déjà contrôlée. */
  render(route: ImageRoute, style: ImageStyle, item: { subject: string; purpose: string; altText: string; content: string }): Promise<{ image: StoredImage | StoredVector; usage: UsageReport }>;
  onUsage?(route: ImageRoute, attempt: number, usage: UsageReport): Promise<void> | void;
  /** Dépôt privé ; renvoie le chemin, ou null en cas d'échec. */
  store(img: StoredImage | StoredVector, ext: "jpg" | "png" | "svg"): Promise<string | null>;
  /** Enregistre l'actif ; renvoie son identifiant, ou null. */
  insertAsset(row: AssetRow): Promise<string | null>;
  /** Banque SVG Limpid : réutilisée avant toute génération vectorielle, enrichie ensuite. */
  library?: SvgLibrary;
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
  deps: IllustrateDeps,
): Promise<{ blueprint: ReportBlueprint; notes: string[]; added: number }> {
  const notes: string[] = [];
  let bp = blueprint;
  let added = 0;
  let pending = pendingIllustrations(bp);
  if (mode === "aucun" || !deps.settings.enabled) {
    for (const p of pending) bp = withoutVisual(bp, p.spec.id);
    return { blueprint: bp, notes, added };
  }
  if (mode === "schemas") {
    // « Schémas seulement » : les illustrations décoratives sont retirées, les schémas restent.
    for (const p of pending) if (!(p.data.style === "diagram" && p.data.content)) bp = withoutVisual(bp, p.spec.id);
    pending = pendingIllustrations(bp);
  }
  const items = pending.slice(0, MAX_ILLUSTRATIONS);
  const results = await Promise.all(
    items.map(async ({ spec, data }, n) => {
      const style: ImageStyle =
        data.style === "realistic" || data.style === "illustration" || (data.style === "diagram" && data.content) ? data.style : "vector";
      // SVG : la banque Limpid d'abord (même sujet déjà dessiné), aucune nouvelle génération.
      if (style === "vector" && deps.library) {
        const hit = await deps.library.find(data.query).catch(() => null);
        if (hit) {
          const path = await deps.store(hit.image, "svg");
          const id = path
            ? await deps.insertAsset({
                provider: "recraft",
                kind: "generated",
                query: data.query,
                source_url: null,
                remote_url: null,
                storage_path: path,
                mime: hit.image.mime,
                width: hit.image.width,
                height: hit.image.height,
                byte_size: hit.image.bytes.length,
                sha256: hit.image.sha256,
                author: null,
                license: null,
                license_url: null,
                modifications: "Illustration vectorielle de la banque Limpid (réutilisée, nettoyée)",
                model: hit.model,
              })
            : null;
          if (id) return id;
        }
      }
      const routes = imageAttempts(style, deps.settings, deps.available);
      for (const [k, route] of routes.entries()) {
        const attempt = n * 10 + k + 1;
        try {
          const out = await deps.render(route, style, { subject: data.subject, purpose: spec.purpose, altText: spec.alt_text, content: data.content ?? "" });
          await deps.onUsage?.(route, attempt, out.usage);
          const svg = out.image.mime === "image/svg+xml";
          const path = await deps.store(out.image, svg ? "svg" : out.image.mime === "image/png" ? "png" : "jpg");
          if (!path) continue;
          if (svg) await deps.library?.save(out.image as StoredVector, data.query, out.usage.model).catch(() => undefined);
          const id = await deps.insertAsset({
            provider: route.provider === "nanobanana" ? "gemini" : route.provider,
            kind: "generated",
            query: data.query,
            source_url: null,
            remote_url: null,
            storage_path: path,
            mime: out.image.mime,
            width: out.image.width,
            height: out.image.height,
            byte_size: out.image.bytes.length,
            sha256: out.image.sha256,
            author: null,
            license: null,
            license_url: null,
            modifications: svg ? "Illustration vectorielle générée, nettoyée (aucun script ni lien externe)" : style === "diagram" ? "Schéma généré" : "Illustration générée",
            model: out.usage.model,
          });
          if (id) return id;
        } catch (e) {
          // Un appel échoué peut être facturé : il est journalisé, puis l'autre fournisseur est essayé.
          const usage = (e as { usage?: UsageReport }).usage;
          if (usage) await deps.onUsage?.(route, attempt, usage);
          if ((e as { code?: string }).code === "cancelled") throw e;
        }
      }
      return null;
    }),
  );
  for (const [k, { spec, data }] of items.entries()) {
    const assetId = results[k];
    if (assetId) {
      bp = withAsset(bp, spec.id, assetId);
      added++;
    } else {
      bp = withoutVisual(bp, spec.id);
      notes.push(`Aucune illustration exploitable pour « ${data.subject} » : texte seul.`);
    }
  }
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
