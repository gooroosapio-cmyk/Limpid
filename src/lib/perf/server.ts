/**
 * Mesures serveur (prompt « Fluidité », § 1) : durées seulement, jamais de contenu, de jeton
 * ni d'adresse. Écriture « au mieux » : une mesure perdue n'interrompt jamais un traitement.
 */
import "server-only";
import { adminClient } from "@/lib/supabase/admin";

export interface PerfContext {
  jobId?: string | null;
  traceId?: string | null;
  route?: string | null;
  ok?: boolean;
}

export async function recordPerf(name: string, valueMs: number, ctx: PerfContext = {}): Promise<void> {
  if (!Number.isFinite(valueMs) || valueMs < 0) return;
  const { error } = await adminClient()
    .from("perf_events")
    .insert({
      name,
      value_ms: Math.min(Math.round(valueMs), 86_400_000),
      source: "server",
      job_id: ctx.jobId ?? null,
      trace_id: ctx.traceId?.slice(0, 40) ?? null,
      route: ctx.route?.slice(0, 80) ?? null,
      ok: ctx.ok ?? true,
    });
  if (error) console.error("perf", name, error.code);
}
