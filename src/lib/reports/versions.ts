/**
 * Demande d'une nouvelle version d'un rapport (« Plus simple », « Un autre exemple »).
 * La version est produite par le worker à partir de la connaissance déjà validée ; la
 * version courante reste lisible pendant ce temps, et l'historique est conservé.
 */
import "server-only";
import { z } from "zod";
import { Level } from "@/lib/contracts/schemas";
import { simplerLevel } from "@/lib/engine/pipeline";
import { assertCanStartJob, LimitError } from "@/lib/jobs/limits";
import { adminClient } from "@/lib/supabase/admin";

export const MAX_VERSIONS = 10;

export const VersionRequest = z.strictObject({
  variation: z.enum(["simpler", "other_example"]),
  /** Section à réécrire seule ; absente = tout le rapport. */
  section_id: z.string().regex(/^[a-z]{1,6}_[A-Za-z0-9_-]{1,64}$/).optional(),
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
});

export class VersionError extends Error {
  constructor(
    public readonly code: "not_found" | "busy" | "limit" | "storage",
    message: string,
  ) {
    super(message);
  }
}

export async function requestVersion(userId: string, reportId: string, input: z.infer<typeof VersionRequest>) {
  const db = adminClient();
  const { data: report } = await db
    .from("reports")
    .select("id, source_id, current_version_id")
    .eq("id", reportId)
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!report?.current_version_id) throw new VersionError("not_found", "Rapport introuvable ou pas encore prêt.");

  const { data: busy } = await db
    .from("jobs")
    .select("id, idempotency_key")
    .eq("report_id", reportId)
    .in("status", ["queued", "running"])
    .limit(1)
    .maybeSingle();
  // Double clic : même clé, même demande en cours.
  if (busy) {
    if (busy.idempotency_key === input.idempotency_key) return;
    throw new VersionError("busy", "Une version est déjà en préparation.");
  }
  try {
    await assertCanStartJob(userId, { newReport: false });
  } catch (e) {
    if (e instanceof LimitError) throw new VersionError("busy", e.message);
    throw e;
  }
  const { count } = await db.from("report_versions").select("id", { count: "exact", head: true }).eq("report_id", reportId);
  if ((count ?? 0) >= MAX_VERSIONS) throw new VersionError("limit", `Ce rapport a atteint ${MAX_VERSIONS} versions.`);

  const { data: current } = await db
    .from("report_versions")
    .select("id, level, goal, target_pages, explanation")
    .eq("id", report.current_version_id)
    .single();
  if (!current) throw new VersionError("not_found", "Version introuvable.");
  const sections = ((current.explanation as { sections?: { id: string }[] } | null)?.sections ?? []).map((x) => x.id);
  if (input.section_id && !sections.includes(input.section_id)) throw new VersionError("not_found", "Cette partie n'existe plus dans la version actuelle.");
  const level = Level.parse(current.level);

  const job = await db.from("jobs").insert({
    owner_id: userId,
    report_id: reportId,
    source_id: report.source_id,
    kind: "reexplain_section",
    idempotency_key: input.idempotency_key,
    params: {
      variation: input.variation,
      base_version_id: current.id,
      // Une section plus simple garde le niveau du rapport ; seule sa rédaction change.
      level: input.variation === "simpler" && !input.section_id ? simplerLevel(level) : level,
      ...(input.section_id ? { section_id: input.section_id } : {}),
      goal: current.goal,
      target_pages: current.target_pages,
    },
  });
  if (job.error && job.error.code !== "23505") throw new VersionError("storage", "La demande n'a pas pu être enregistrée.");
}
