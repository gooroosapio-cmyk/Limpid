import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DeleteReport } from "@/components/DeleteReport";
import { JobProgress } from "@/components/JobProgress";
import { Reader } from "@/components/reader/Reader";
import { requireUser } from "@/lib/auth";
import { Evidence, ExplanationObject, ReportBlueprint, SourceSegment } from "@/lib/contracts/schemas";
import { fr } from "@/lib/i18n/fr";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rapport" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  await requireUser();
  const supabase = await createUserClient();

  // Lectures via RLS uniquement : un rapport d'un autre compte est simplement introuvable.
  const { data: report } = await supabase
    .from("reports")
    .select("id, title, source_id, current_version_id, sources(title)")
    .eq("id", id)
    .maybeSingle();
  if (!report) notFound();

  if (!report.current_version_id) {
    const { data: job } = await supabase
      .from("jobs")
      .select("status, stage, error_code")
      .eq("report_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (
      <>
        <h1>{report.title}</h1>
        <JobProgress reportId={id} initial={job ?? { status: "queued", stage: null, error_code: null }} />
        <DeleteReport reportId={id} />
      </>
    );
  }

  const { data: version } = await supabase
    .from("report_versions")
    .select("explanation, blueprint, knowledge_id, check_status")
    .eq("id", report.current_version_id)
    .single();
  if (!version) notFound();
  const [{ data: ev }, { data: segs }] = await Promise.all([
    supabase.from("evidence").select("id, segment_id, start_offset, end_offset, quote").eq("knowledge_id", version.knowledge_id),
    supabase
      .from("source_segments")
      .select("id, source_version, locator, text, content_hash, extraction_warnings")
      .eq("source_id", report.source_id)
      .order("ordinal"),
  ]);

  // Revalidation à la lecture : un objet stocké hors contrat n'est jamais affiché.
  const explanation = ExplanationObject.parse(version.explanation);
  const blueprint = ReportBlueprint.parse(version.blueprint);
  const evidence = (ev ?? []).map((e) => Evidence.parse(e));
  const segments = (segs ?? []).map((s) => SourceSegment.parse({ ...s, source_id: `src_${report.source_id}` }));
  const sourceTitle = (report.sources as unknown as { title: string } | null)?.title ?? report.title;

  return (
    <>
      {version.check_status !== "validated" && (
        <p className="notice notice-warn" role="status">
          {fr.reports.status.incomplete_check} : certaines vérifications n'ont pas abouti. Lisez ce rapport avec prudence.
        </p>
      )}
      <Reader
        blueprint={blueprint}
        explanation={explanation}
        evidence={evidence}
        segments={segments}
        sourceTitle={sourceTitle}
        isDemo={false}
      />
      <DeleteReport reportId={id} />
    </>
  );
}
