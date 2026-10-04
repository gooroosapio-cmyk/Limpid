/**
 * Chargement d'un rapport pour l'utilisateur connecté, partagé par le lecteur et l'export
 * PDF. Lectures via la RLS uniquement : un rapport d'un autre compte est introuvable, et
 * chaque objet stocké est revalidé contre son contrat avant d'être affiché.
 */
import "server-only";
import { z } from "zod";
import { Evidence, ExplanationObject, ReportBlueprint, SourceSegment } from "@/lib/contracts/schemas";
import { createUserClient } from "@/lib/supabase/server";

/** Remarques de couverture enregistrées à l'extraction (pages non lues, troncature…). */
const CoverageNotes = z.object({ notes: z.array(z.string().max(300)).max(10) });

export interface JobView {
  status: string;
  stage: string | null;
  error_code: string | null;
}

export type LoadedReport =
  | { state: "pending"; id: string; title: string; job: JobView }
  | {
      state: "ready";
      id: string;
      title: string;
      explanation: ExplanationObject;
      blueprint: ReportBlueprint;
      evidence: Evidence[];
      segments: SourceSegment[];
      checkStatus: string;
      sourceTitle: string;
      sourceUrl: string | null;
      notes: string[];
      createdAt: Date;
    };

export async function loadReport(id: string): Promise<LoadedReport | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  const supabase = await createUserClient();
  const { data: report } = await supabase
    .from("reports")
    .select("id, title, source_id, current_version_id, sources(title, coverage, original_url)")
    .eq("id", id)
    .maybeSingle();
  if (!report) return null;

  if (!report.current_version_id) {
    const { data: job } = await supabase
      .from("jobs")
      .select("status, stage, error_code")
      .eq("report_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { state: "pending", id, title: report.title, job: job ?? { status: "queued", stage: null, error_code: null } };
  }

  const { data: version } = await supabase
    .from("report_versions")
    .select("explanation, blueprint, knowledge_id, check_status, created_at")
    .eq("id", report.current_version_id)
    .single();
  if (!version) return null;
  const [{ data: ev }, { data: segs }] = await Promise.all([
    supabase.from("evidence").select("id, segment_id, start_offset, end_offset, quote").eq("knowledge_id", version.knowledge_id),
    supabase
      .from("source_segments")
      .select("id, source_version, locator, text, content_hash, extraction_warnings")
      .eq("source_id", report.source_id)
      .order("ordinal"),
  ]);

  const source = report.sources as unknown as { title: string; coverage: unknown; original_url: string | null } | null;
  return {
    state: "ready",
    id,
    title: report.title,
    explanation: ExplanationObject.parse(version.explanation),
    blueprint: ReportBlueprint.parse(version.blueprint),
    evidence: (ev ?? []).map((e) => Evidence.parse(e)),
    segments: (segs ?? []).map((s) => SourceSegment.parse({ ...s, source_id: `src_${report.source_id}` })),
    checkStatus: version.check_status,
    sourceTitle: source?.title ?? report.title,
    sourceUrl: source?.original_url ?? null,
    notes: CoverageNotes.safeParse(source?.coverage).data?.notes ?? [],
    createdAt: new Date(version.created_at),
  };
}
