/**
 * Banque SVG Limpid (comparatif IA, § 6) : un SVG Recraft généré pour un cours est réutilisé
 * pour les cours suivants, de tous les comptes, quand le même sujet revient : aucune nouvelle
 * génération. Isolement des comptes : la banque ne garde que le dessin assaini et des mots-clés
 * génériques en anglais (sans nom propre ni chiffre, choisis par le plan) ; jamais le compte,
 * le document ni le cours d'origine. Chaque cours reçoit sa propre copie du fichier.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeImageQuery } from "@/lib/render/visuals";
import type { StoredVector } from "./illustrate";

const BUCKET = "exports";

/** Mots-clés d'une requête (anglais, minuscules, sans chiffres), mots vides retirés. */
const STOP = new Set(["the", "and", "with", "for", "from", "into", "of", "on", "in", "a", "an", "to", "at", "by", "or"]);
export function libraryKeywords(query: string): string[] {
  const q = safeImageQuery(query);
  if (!q) return [];
  return [...new Set(q.split(" ").filter((w) => w.length >= 3 && !STOP.has(w)))].slice(0, 6);
}

/**
 * Meilleur SVG de la banque pour une requête : au moins deux mots-clés communs (un seul si la
 * requête n'en a qu'un), et au moins 60 % des mots de la requête. Égalité : le plus réutilisé.
 */
export function bestMatch<T extends { keywords: string[]; uses: number }>(words: string[], candidates: T[]): T | null {
  if (words.length === 0) return null;
  const need = Math.max(words.length === 1 ? 1 : 2, Math.ceil(words.length * 0.6));
  let best: { c: T; score: number } | null = null;
  for (const c of candidates) {
    const score = words.filter((w) => c.keywords.includes(w)).length;
    if (score < need) continue;
    if (!best || score > best.score || (score === best.score && c.uses > best.c.uses)) best = { c, score };
  }
  return best?.c ?? null;
}

export interface SvgLibrary {
  find(query: string): Promise<{ image: StoredVector; model: string | null } | null>;
  save(image: StoredVector, query: string, model: string | null): Promise<void>;
}

export function svgLibrary(db: SupabaseClient): SvgLibrary {
  return {
    async find(query) {
      const words = libraryKeywords(query);
      if (words.length === 0) return null;
      const { data } = await db.from("svg_library").select("id, keywords, uses, storage_path, width, height, sha256, model").overlaps("keywords", words).limit(50);
      const hit = bestMatch(words, (data ?? []) as { id: string; keywords: string[]; uses: number; storage_path: string; width: number; height: number; sha256: string; model: string | null }[]);
      if (!hit) return null;
      const file = await db.storage.from(BUCKET).download(hit.storage_path);
      if (file.error || !file.data) return null;
      const bytes = Buffer.from(await file.data.arrayBuffer());
      // Fichier altéré : ignoré (l'empreinte enregistrée fait foi).
      if (createHash("sha256").update(bytes).digest("hex") !== hit.sha256) return null;
      await db.from("svg_library").update({ uses: hit.uses + 1, last_used_at: new Date().toISOString() }).eq("id", hit.id);
      return { image: { bytes, mime: "image/svg+xml", width: hit.width, height: hit.height, sha256: hit.sha256 }, model: hit.model };
    },
    async save(image, query, model) {
      const keywords = libraryKeywords(query);
      if (keywords.length === 0) return;
      const path = `library/svg/${image.sha256}.svg`;
      const up = await db.storage.from(BUCKET).upload(path, image.bytes, { contentType: "image/svg+xml", upsert: true });
      if (up.error) return;
      await db
        .from("svg_library")
        .upsert({ sha256: image.sha256, keywords, query: keywords.join(" "), storage_path: path, width: image.width, height: image.height, model }, { onConflict: "sha256", ignoreDuplicates: true });
    },
  };
}
