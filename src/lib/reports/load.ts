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
import { engineEvidence, engineSegments } from "./source-set";
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
      /** Documents du Limpid, dans l'ordre (plusieurs : Limpid commun). */
      documents: { sourceId: string; title: string; originalHref: string | null }[];
      /** Titre de chaque document par identifiant du moteur (références nommées). */
      documentTitles: Record<string, string>;
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
  // Documents du Limpid (ensemble enregistré ; anciens Limpid : leur source unique).
  const { data: setRows } = await supabase
    .from("report_sources")
    .select("source_id, position, sources(title, kind, original_url, storage_path, coverage)")
    .eq("report_id", id)
    .order("position");
  const sourceIds = setRows?.length ? setRows.map((r) => r.source_id as string) : report.source_id ? [report.source_id as string] : [];
  const [{ data: ev }, { data: segs }, { data: ans }, { data: assetRows }, { data: quizRow }, { data: progress }] = await Promise.all([
    supabase.from("evidence").select("id, segment_id, source_id, start_offset, end_offset, quote").eq("knowledge_id", version.knowledge_id),
    supabase
      .from("source_segments")
      .select("id, source_id, source_version, locator, text, content_hash, extraction_warnings, ordinal")
      .in("source_id", sourceIds)
      .order("ordinal")
      .limit(10_000),
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
  type DocRow = { title: string; kind: string; original_url: string | null; storage_path: string | null; coverage: unknown } | null;
  const documents = (setRows?.length ? setRows : [{ source_id: report.source_id, sources: source }]).flatMap((r) => {
    const d = r.sources as unknown as DocRow;
    if (!r.source_id || !d) return [];
    const has = d.kind === "url" ? !!d.original_url : !!d.storage_path;
    return [{ sourceId: r.source_id as string, title: d.title, originalHref: has ? `/api/sources/${r.source_id}/original` : null }];
  });
  // Remarques de couverture de chaque document (nommé quand il y en a plusieurs).
  const allNotes = (setRows?.length ? setRows : [{ source_id: report.source_id, sources: source }]).flatMap((r) => {
    const d = r.sources as unknown as DocRow;
    const notes = CoverageNotes.safeParse(d?.coverage).data?.notes ?? [];
    return (setRows?.length ?? 0) > 1 ? notes.map((n) => `${d?.title ?? ""} : ${n}`) : notes;
  });
  const anyPartial = (setRows?.length ? setRows : [{ source_id: report.source_id, sources: source }]).some(
    (r) => CoverageNotes.safeParse((r.sources as unknown as DocRow)?.coverage).data?.partial === true,
  );
  return {
    state: "ready",
    id,
    versionId: shown.id,
    answers,
    title: report.title,
    explanation: ExplanationObject.parse(version.explanation),
    blueprint: ReportBlueprint.parse(version.blueprint),
    evidence: (ev ?? []).map((e) => {
      const { source_id: _s, ...row } = engineEvidence(e, sourceIds);
      return Evidence.parse(row);
    }),
    segments: engineSegments(
      sourceIds.map((sid) => ({
        sourceId: sid,
        rows: (segs ?? []).filter((x) => x.source_id === sid).map(({ source_id: _s, ...x }) => x),
      })),
    ),
    documents,
    documentTitles: Object.fromEntries(documents.map((d) => [`src_${d.sourceId}`, d.title])),
    checkStatus: version.check_status,
    sourceTitle: documents.length > 1 ? documents.map((d) => d.title).join(" · ").slice(0, 300) : (source?.title ?? report.title),
    sourceUrl: source?.original_url ?? null,
    originalHref: hasOriginal ? `/api/sources/${report.source_id}/original` : null,
    sourceKind: source?.kind ?? null,
    notes: allNotes.slice(0, 10),
    partial: anyPartial,
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
