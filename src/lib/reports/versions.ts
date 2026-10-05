/**
 * Demande d'une nouvelle version d'un rapport (« Plus simple », « Un autre exemple »).
 * La version est produite par le worker à partir de la connaissance déjà validée ; la
 * version courante reste lisible pendant ce temps, et l'historique est conservé.
 */
import "server-only";
import { z } from "zod";
import { Level, Mode } from "@/lib/contracts/schemas";
import { REFORMULATE_REASONS, simplerLevel } from "@/lib/engine/pipeline";
import { levelFor } from "./create";
import { accountUsage, attachReservation, CreditError, getEntitlements, releaseReservation, reserveCredits } from "@/lib/billing/wallet";
import { adminClient } from "@/lib/supabase/admin";

export const MAX_VERSIONS = 20;

export const VersionRequest = z.strictObject({
  variation: z.enum(["simpler", "other_example", "mode", "reformulate"]),
  /** Créer une autre version : approche demandée. */
  mode: Mode.optional(),
  /** Essayer une autre formulation : motifs (choix multiples) et remarque facultative. */
  reasons: z.array(z.enum(REFORMULATE_REASONS)).max(6).optional(),
  comment: z.string().trim().max(1_000).optional(),
  /** Section à réécrire seule ; absente = tout le rapport. */
  section_id: z.string().regex(/^[a-z]{1,6}_[A-Za-z0-9_-]{1,64}$/).optional(),
  idempotency_key: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
});

export class VersionError extends Error {
  constructor(
    public readonly code: "not_found" | "busy" | "limit" | "storage" | "credits" | "quota",
    message: string,
    public readonly detail: { needed?: number; available?: number; nextAt?: string | null; dayLimit?: number; weekLimit?: number } = {},
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
  const ent = await getEntitlements(userId);
  if ((await accountUsage(userId)).active >= ent.limits.concurrentJobs) {
    throw new VersionError("busy", "Un rapport est déjà en préparation. Attendez qu'il soit prêt pour en lancer un autre.");
  }
  const { count } = await db.from("report_versions").select("id", { count: "exact", head: true }).eq("report_id", reportId);
  if ((count ?? 0) >= MAX_VERSIONS) throw new VersionError("limit", `Ce rapport a atteint ${MAX_VERSIONS} versions.`);

  const { data: current } = await db
    .from("report_versions")
    .select("id, level, goal, target_pages, explanation, mode")
    .eq("id", report.current_version_id)
    .single();
  if (!current) throw new VersionError("not_found", "Version introuvable.");
  const sections = ((current.explanation as { sections?: { id: string }[] } | null)?.sections ?? []).map((x) => x.id);
  if (input.section_id && !sections.includes(input.section_id)) throw new VersionError("not_found", "Cette partie n'existe plus dans la version actuelle.");
  const level = Level.parse(current.level);
  if (input.variation === "mode" && !input.mode) throw new VersionError("not_found", "Approche manquante.");
  const mode = input.variation === "mode" ? input.mode! : (Mode.safeParse(current.mode).data ?? "claire");
  const { data: prefs } = await db.from("reader_preferences").select("familiarity, explanation_lang").eq("owner_id", userId).maybeSingle();

  // Nouvelle version : prix fixe réservé avant la mise en file, rendu en cas d'échec.
  let reservationId: string;
  try {
    ({ reservationId } = await reserveCredits(userId, "report_version", `version:${input.idempotency_key}`, { reportId }, { wallet: ent.wallet }));
  } catch (e) {
    if (e instanceof CreditError && e.code === "insufficient") throw new VersionError("credits", e.message, e.detail);
    if (e instanceof CreditError && e.code === "quota") throw new VersionError("quota", e.message, e.detail);
    throw e;
  }
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
      level:
        input.variation === "mode"
          ? levelFor(mode, prefs?.familiarity)
          : input.variation === "simpler" && !input.section_id
            ? simplerLevel(level)
            : level,
      ...(input.section_id ? { section_id: input.section_id } : {}),
      mode,
      language: prefs?.explanation_lang === "fr" || prefs?.explanation_lang === "en" ? prefs.explanation_lang : null,
      ...(input.variation === "reformulate" ? { reasons: input.reasons ?? [], comment: input.comment || null } : {}),
      goal: mode === "revision" ? "reviser" : current.goal === "reviser" && input.variation === "mode" ? "comprendre" : current.goal,
      target_pages: current.target_pages,
    },
  }).select("id").single();
  if (job.error) {
    if (job.error.code === "23505") return;
    await releaseReservation(reservationId);
    throw new VersionError("storage", "La demande n'a pas pu être enregistrée.");
  }
  await attachReservation(reservationId, { jobId: job.data.id as string });
}
