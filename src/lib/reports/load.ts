/**
 * Chargement d'un rapport pour l'utilisateur connecté, partagé par le lecteur et l'export
 * PDF. Lectures via la RLS uniquement : un rapport d'un autre compte est introuvable, et
 * chaque objet stocké est revalidé contre son contrat avant d'être affiché.
 */
import "server-only";
import { z } from "zod";
import { Evidence, ExerciseSet, ExplanationObject, Mode, ReportBlueprint, SourceSegment, ThemeId, VisualMode } from "@/lib/contracts/schemas";
import type { AssetView } from "@/lib/render/visuals";
import { reportExpiresAt } from "./retention";
import { autoTheme } from "@/lib/display/themes";
import { createUserClient } from "@/lib/supabase/server";

/** Remarques de couverture enregistrées à l'extraction (pages non lues, troncature…). */
const CoverageNotes = z.object({ notes: z.array(z.string().max(300)).max(10), partial: z.boolean().optional() });

export interface JobView {
  status: string;
  stage: string | null;
  error_code: string | null;
}

export interface VersionInfo {
  number: number;
  changeReason: string | null;
  level: string;
  current: boolean;
  mode: Mode | null;
  createdAt: string;
}

export type LoadedReport =
  | { state: "pending"; id: string; title: string; job: JobView }
  | {
      state: "ready";
      id: string;
      versionId: string;
      /** Dernière réponse corrigée par question (quiz). */
      answers: Record<string, { answer: string; feedback: unknown }>;
      title: string;
      explanation: ExplanationObject;
      blueprint: ReportBlueprint;
      evidence: Evidence[];
      segments: SourceSegment[];
      checkStatus: string;
      sourceTitle: string;
      sourceUrl: string | null;
      /** Original consultable (fichier gardé 30 jours ou page d'origine), servi par Limpid après contrôle du propriétaire. */
      originalHref: string | null;
      sourceKind: string | null;
      notes: string[];
      /** Couverture partielle (sinon les remarques sont informatives, ex. lecture OCR). */
      partial: boolean;
      createdAt: Date;
      /** Versions du rapport (la plus récente en dernier) et version affichée. */
      versions: VersionInfo[];
      shownVersion: number;
      isCurrent: boolean;
      /** Dernière tâche du rapport (nouvelle version en préparation, échec récent…). */
      latestJob: JobView | null;
      /** Thème affiché : choix du lecteur, sinon choix automatique selon l'organisation. */
      theme: ThemeId;
      /** Choix explicite du lecteur (null = automatique). */
      themeChoice: ThemeId | null;
      visualMode: VisualMode;
      /** Date d'effacement automatique (conservation), ou null si illimitée. */
      expiresAt: Date | null;
      /** Exercices pré-générés de la version affichée (null : génération antérieure ou échec). */
      exercises: ExerciseSet | null;
      /** Dernière position de lecture enregistrée (identifiant de pièce). */
      progressAnchor: string | null;
      /** Approche de la version affichée. */
      mode: Mode | null;
      /** Illustrations du rapport, par identifiant d'actif (avec chemin privé pour l'export). */
      assets: Record<string, AssetView & { storagePath: string | null; mime: string | null }>;
    };

/** `versionNumber` : version à afficher (par défaut la version courante). */
export async function loadReport(id: string, versionNumber?: number): Promise<LoadedReport | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  const supabase = await createUserClient();
  const { data: report } = await supabase
    .from("reports")
    .select("id, title, source_id, current_version_id, theme_id, visual_mode, created_at, sources(title, kind, coverage, original_url, storage_path)")
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

  const [{ data: list }, { data: latestJob }] = await Promise.all([
    supabase.from("report_versions").select("id, version_number, change_reason, level, mode, created_at").eq("report_id", id).order("version_number"),
    supabase
      .from("jobs")
      .select("status, stage, error_code")
      .eq("report_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const versions = list ?? [];
  const shown =
    (versionNumber !== undefined && versions.find((v) => v.version_number === versionNumber)) ||
    versions.find((v) => v.id === report.current_version_id);
  if (!shown) return null;

  const { data: version } = await supabase
    .from("report_versions")
    .select("explanation, blueprint, knowledge_id, check_status, created_at")
    .eq("id", shown.id)
    .single();
  if (!version) return null;
  const [{ data: ev }, { data: segs }, { data: ans }, { data: assetRows }, { data: quizRow }, { data: progress }] = await Promise.all([
    supabase.from("evidence").select("id, segment_id, start_offset, end_offset, quote").eq("knowledge_id", version.knowledge_id),
    supabase
      .from("source_segments")
      .select("id, source_version, locator, text, content_hash, extraction_warnings")
      .eq("source_id", report.source_id)
      .order("ordinal"),
    supabase
      .from("comprehension_answers")
      .select("check_id, answer, feedback")
      .eq("report_version_id", shown.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("visual_assets")
      .select("id, provider, source_url, remote_url, storage_path, mime, width, height, author, license, license_url, modifications, model")
      .eq("report_id", id)
      .limit(20),
    supabase.from("report_quizzes").select("questions").eq("report_version_id", shown.id).eq("scope_key", "exercises").maybeSingle(),
    supabase.from("report_progress").select("anchor").eq("report_id", id).maybeSingle(),
  ]);
  const assets: Record<string, AssetView & { storagePath: string | null; mime: string | null }> = {};
  for (const a of assetRows ?? []) {
    if (!a.width || !a.height) continue;
    assets[a.id] = {
      id: a.id,
      // Actif stocké : servi par Limpid après contrôle du propriétaire ; Unsplash : depuis son hébergeur.
      src: a.remote_url ?? `/api/reports/${id}/assets/${a.id}`,
      width: a.width,
      height: a.height,
      provider: a.provider,
      author: a.author,
      license: a.license,
      licenseUrl: a.license_url,
      sourceUrl: a.source_url,
      modifications: a.modifications,
      model: a.model,
      storagePath: a.storage_path,
      mime: a.mime,
    };
  }
  const answers: Record<string, { answer: string; feedback: unknown }> = {};
  for (const a of ans ?? []) answers[a.check_id] = { answer: a.answer, feedback: a.feedback };

  const source = report.sources as unknown as {
    title: string;
    kind: string;
    coverage: unknown;
    original_url: string | null;
    storage_path: string | null;
  } | null;
  const hasOriginal = !!source && (source.kind === "url" ? !!source.original_url : !!source.storage_path);
  return {
    state: "ready",
    id,
    versionId: shown.id,
    answers,
    title: report.title,
    explanation: ExplanationObject.parse(version.explanation),
    blueprint: ReportBlueprint.parse(version.blueprint),
    evidence: (ev ?? []).map((e) => Evidence.parse(e)),
    segments: (segs ?? []).map((s) => SourceSegment.parse({ ...s, source_id: `src_${report.source_id}` })),
    checkStatus: version.check_status,
    sourceTitle: source?.title ?? report.title,
    sourceUrl: source?.original_url ?? null,
    originalHref: hasOriginal ? `/api/sources/${report.source_id}/original` : null,
    sourceKind: source?.kind ?? null,
    notes: CoverageNotes.safeParse(source?.coverage).data?.notes ?? [],
    partial: CoverageNotes.safeParse(source?.coverage).data?.partial ?? false,
    createdAt: new Date(version.created_at),
    versions: versions.map((v) => ({
      number: v.version_number,
      changeReason: v.change_reason,
      level: v.level,
      current: v.id === report.current_version_id,
      mode: Mode.safeParse(v.mode).data ?? null,
      createdAt: v.created_at,
    })),
    shownVersion: shown.version_number,
    isCurrent: shown.id === report.current_version_id,
    latestJob: latestJob ?? null,
    themeChoice: ThemeId.safeParse(report.theme_id).data ?? null,
    theme: ThemeId.safeParse(report.theme_id).data ?? autoTheme(ReportBlueprint.parse(version.blueprint).template_id),
    visualMode: VisualMode.safeParse(report.visual_mode).data ?? "auto",
    expiresAt: reportExpiresAt(new Date(report.created_at)),
    exercises: ExerciseSet.safeParse(quizRow?.questions).data ?? null,
    progressAnchor: typeof progress?.anchor === "string" ? progress.anchor : null,
    mode: Mode.safeParse(ExplanationObject.parse(version.explanation).mode).data ?? null,
    assets,
  };
}
