/**
 * Couverture générée (image Lite de Gemini, via OpenRouter ou Google) pour chaque leçon (V2.1) : décorative, sans texte, comprise
 * dans le prix de la leçon (aucun crédit), plafonnée par le budget IA. Un échec laisse le
 * dégradé de la banque : la leçon reste complète.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { priceBasisFor, usageCents } from "@/lib/budget";
import { getImageProvider } from "@/lib/engine";
import { imageModelFor } from "@/lib/visuals/config";
import { assertBudget } from "@/lib/jobs/budget-guard";
import { adminClient } from "@/lib/supabase/admin";

export function coverGenerationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const keyed = !!env.OPENROUTER_API_KEY?.trim() || !!env.GEMINI_API_KEY?.trim();
  return keyed && !!imageModelFor(env as NodeJS.ProcessEnv) && env.LIMPID_COVERS_GEMINI !== "off";
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
  const model = imageModelFor()!;
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
  const { error: upd } = await db.from("reports").update({ cover_path: path }).eq("id", input.reportId).eq("owner_id", input.ownerId);
  if (upd) {
    await db.storage.from("exports").remove([path]);
    return null;
  }
  if (prev?.cover_path) await db.storage.from("exports").remove([prev.cover_path as string]);
  return path;
}
