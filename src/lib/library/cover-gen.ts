/**
 * Couverture de chaque cours (V5) : d'abord une photo Unsplash (aucun coût d'IA, affichée
 * depuis Unsplash avec le crédit du photographe), sinon une image Nano Banana 2 Lite
 * décorative et sans texte, plafonnée par le budget IA. Un échec laisse le dégradé de la
 * banque : le cours reste complet.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { priceBasisFor, usageCents } from "@/lib/budget";
import { getImageProvider } from "@/lib/engine";
import { COVER_MODEL } from "@/lib/visuals/image-models";
import { searchUnsplash, trackUnsplashDownload } from "@/lib/visuals/sources";
import { assertBudget } from "@/lib/jobs/budget-guard";
import { adminClient } from "@/lib/supabase/admin";

export function coverGenerationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.OPENROUTER_API_KEY?.trim() && env.LIMPID_COVERS_GEMINI !== "off";
}

/** Adresse d'affichage d'une photo Unsplash recadrée en 4/3 (paramètres d'image d'Unsplash). */
export function unsplashCoverUrl(imageUrl: string): string | null {
  try {
    const u = new URL(imageUrl);
    if (u.protocol !== "https:" || u.hostname !== "images.unsplash.com") return null;
    for (const [k, v] of Object.entries({ w: "1200", h: "900", fit: "crop", crop: "entropy", auto: "format", q: "75" })) u.searchParams.set(k, v);
    return u.toString().slice(0, 600);
  } catch {
    return null;
  }
}

/**
 * Photo Unsplash pour la couverture : premier résultat paysage de la requête (mots-clés anglais
 * du plan, sinon le titre). Renvoie true si une photo est rattachée.
 */
export async function unsplashCover(input: { reportId: string; ownerId: string; query: string }): Promise<boolean> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  const query = input.query.replace(/[^\p{L}\p{N} -]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!key || query.length < 3) return false;
  const found = (await searchUnsplash(query, key, 5_000, "landscape").catch(() => []))[0];
  const url = found ? unsplashCoverUrl(found.imageUrl) : null;
  if (!found || !url) return false;
  const credit = { author: found.author, url: found.sourceUrl.split("?")[0]! };
  const { error } = await adminClient().from("reports").update({ cover_url: url, cover_credit: credit }).eq("id", input.reportId).eq("owner_id", input.ownerId);
  if (error) return false;
  // Exigence de l'API Unsplash : signaler l'utilisation de la photo.
  if (found.downloadLocation) await trackUnsplashDownload(found.downloadLocation, key);
  return true;
}

/** Couverture d'un nouveau cours : Unsplash, sinon Nano Banana 2 Lite. */
export async function chooseCover(input: { reportId: string; ownerId: string; title: string; hints: string[]; query: string; jobId?: string | null }): Promise<void> {
  if (await unsplashCover({ reportId: input.reportId, ownerId: input.ownerId, query: input.query })) return;
  await generateCover(input);
}

/** Consigne : une photographie éditoriale décorative, jamais une illustration pédagogique. */
export function coverPrompt(title: string, hints: string[]): string {
  const topic = [title, ...hints.slice(0, 3)].join(" — ").replace(/\s+/g, " ").slice(0, 400);
  return [
    `Photographie éditoriale décorative servant de couverture à une leçon intitulée : « ${topic} ».`,
    "Un seul objet ou une seule matière évoquant le sujet (pierre, papier, verre, eau, végétal, métal, lumière), en gros plan.",
    "Lumière douce et chaude, ambiance sombre et premium, fond profond vert-noir, légers reflets dorés, faible profondeur de champ.",
    "Cadrage horizontal 4/3, sujet légèrement décentré, composition calme (le titre est affiché sous l'image, jamais dessus).",
    "Aucun texte, aucune lettre, aucun chiffre, aucun logo, aucune interface, aucun visage reconnaissable.",
  ].join(" ");
}

/** Génère, enregistre et rattache la couverture ; renvoie le chemin, ou null en cas d'échec ou de refus. */
export async function generateCover(input: { reportId: string; ownerId: string; title: string; hints: string[]; jobId?: string | null; signal?: AbortSignal }): Promise<string | null> {
  if (!coverGenerationEnabled()) return null;
  const db = adminClient();
  try {
    await assertBudget(input.ownerId);
  } catch {
    return null;
  }
  const model = COVER_MODEL;
  const provider = getImageProvider();
  let out;
  try {
    out = await provider.generateIllustration({
      model,
      prompt: coverPrompt(input.title, input.hints),
      aspectRatio: "4:3",
      signal: input.signal ?? new AbortController().signal,
      timeoutMs: 90_000,
    });
  } catch (e) {
    console.error("cover.generate", (e as Error).message);
    return null;
  }
  const cents = usageCents(out.usage);
  await db.from("usage_ledger").insert({
    owner_id: input.ownerId,
    job_id: input.jobId ?? null,
    stage: "couverture",
    attempt: 1,
    provider: out.usage.provider,
    model: out.usage.model,
    status: out.usage.inputTokens === null && out.usage.costUsd == null ? "uncertain" : "settled",
    reserved_cents: cents,
    actual_cents: out.usage.inputTokens === null && out.usage.costUsd == null ? null : cents,
    input_tokens: out.usage.inputTokens,
    output_tokens: out.usage.outputTokens,
    duration_ms: out.usage.durationMs,
    provider_request_id: out.usage.requestId,
    price_basis: priceBasisFor(out.usage),
  });
  // WebP 1200 × 900 (cartes 4/3, V4) : léger, net sur téléphone ; les anciennes couvertures portrait sont recadrées à l'affichage.
  const sharp = (await import("sharp")).default;
  const webp = await sharp(out.bytes).resize(1200, 900, { fit: "cover", position: "attention" }).webp({ quality: 78 }).toBuffer();
  const path = `covers/${input.reportId}/${randomUUID()}.webp`;
  const { error } = await db.storage.from("exports").upload(path, webp, { contentType: "image/webp", upsert: false });
  if (error) {
    console.error("cover.upload", error.message);
    return null;
  }
  const { data: prev } = await db.from("reports").select("cover_path").eq("id", input.reportId).maybeSingle();
  const { error: upd } = await db.from("reports").update({ cover_path: path, cover_url: null, cover_credit: null }).eq("id", input.reportId).eq("owner_id", input.ownerId);
  if (upd) {
    await db.storage.from("exports").remove([path]);
    return null;
  }
  if (prev?.cover_path) await db.storage.from("exports").remove([prev.cover_path as string]);
  return path;
}
