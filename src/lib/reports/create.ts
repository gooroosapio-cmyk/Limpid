/**
 * Création d'un rapport à partir d'un texte collé : source, segments, rapport et tâche,
 * écrits côté serveur pour l'utilisateur authentifié. Idempotent par clé client.
 */
import "server-only";
import { z } from "zod";
import { limits } from "@/lib/config";
import { Goal, Level, TargetPages } from "@/lib/contracts/schemas";
import { segmentText } from "@/lib/extract/text";
import { adminClient } from "@/lib/supabase/admin";

export const CreateFromText = z.strictObject({
  title: z.string().trim().max(200).optional(),
  text: z.string().min(1).max(limits.maxPastedChars),
  level: Level,
  goal: Goal,
  target_pages: TargetPages,
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
});
export type CreateFromText = z.infer<typeof CreateFromText>;

export class CreateError extends Error {
  constructor(
    public readonly code: "generation_disabled" | "extraction" | "storage",
    message: string,
  ) {
    super(message);
  }
}

function defaultTitle(text: string): string {
  const first = text.trim().split("\n").find((l) => l.trim())?.trim() ?? "Texte collé";
  return first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first;
}

export async function createReportFromText(userId: string, input: CreateFromText): Promise<{ reportId: string }> {
  const db = adminClient();

  // Double envoi : la même clé renvoie le même rapport, sans nouvelle tâche.
  const existing = await db
    .from("jobs")
    .select("report_id")
    .eq("owner_id", userId)
    .eq("idempotency_key", input.idempotency_key)
    .maybeSingle();
  if (existing.data?.report_id) return { reportId: existing.data.report_id };

  const settings = await db.from("app_settings").select("generation_enabled").single();
  if (!settings.data?.generation_enabled) {
    throw new CreateError("generation_disabled", "La génération est suspendue par l'administrateur.");
  }

  const sourceId = crypto.randomUUID();
  let extracted;
  try {
    extracted = segmentText(input.text, `src_${sourceId}`, { maxChars: limits.maxPastedChars });
  } catch (e) {
    throw new CreateError("extraction", (e as Error).message);
  }
  const title = (input.title || defaultTitle(input.text)).slice(0, 200);

  const src = await db.from("sources").insert({
    id: sourceId,
    owner_id: userId,
    kind: "paste",
    title,
    content_hash: extracted.sourceVersion,
    byte_size: Buffer.byteLength(input.text, "utf8"),
    status: "extracted",
    coverage: { segments_total: extracted.segments.length, segments_processed: extracted.segments.length, partial: false },
  });
  if (src.error) throw new CreateError("storage", "Enregistrement de la source impossible.");

  const segs = await db.from("source_segments").insert(
    extracted.segments.map((s, i) => ({
      id: s.id,
      source_id: sourceId,
      owner_id: userId,
      source_version: s.source_version,
      ordinal: i,
      locator: s.locator,
      text: s.text,
      content_hash: s.content_hash,
      extraction_warnings: s.extraction_warnings,
    })),
  );
  if (segs.error) {
    await db.from("sources").delete().eq("id", sourceId);
    throw new CreateError("storage", "Enregistrement du texte impossible.");
  }

  const report = await db
    .from("reports")
    .insert({ owner_id: userId, source_id: sourceId, title })
    .select("id")
    .single();
  if (report.error || !report.data) {
    await db.from("sources").delete().eq("id", sourceId);
    throw new CreateError("storage", "Création du rapport impossible.");
  }

  const job = await db.from("jobs").insert({
    owner_id: userId,
    report_id: report.data.id,
    source_id: sourceId,
    kind: "generate_report",
    idempotency_key: input.idempotency_key,
    params: { level: input.level, goal: input.goal, target_pages: input.target_pages },
  });
  if (job.error) {
    // Course entre deux envois simultanés : on garde celui qui a gagné.
    await db.from("sources").delete().eq("id", sourceId);
    await db.from("reports").delete().eq("id", report.data.id);
    if (job.error.code === "23505") return createReportFromText(userId, input);
    throw new CreateError("storage", "Création de la tâche impossible.");
  }
  return { reportId: report.data.id };
}
