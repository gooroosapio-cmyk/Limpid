/**
 * Lecture de la bibliothèque (page principale et menu latéral), via la RLS : dossiers,
 * Limpid avec leur état (prêt, en cours, échec), lu / non lu et dossier.
 */
import "server-only";
import { Mode } from "@/lib/contracts/schemas";
import { lessonCover, type CoverView } from "@/lib/library/covers";
import { createUserClient } from "@/lib/supabase/server";

export type LibraryState = "ready" | "running" | "failed";

export interface LibraryItem {
  id: string;
  title: string;
  createdAt: string;
  mode: Mode | null;
  folderId: string | null;
  state: LibraryState;
  /** Mise à jour en cours d'un Limpid déjà prêt (nouvelle version). */
  updating: boolean;
  unread: boolean;
  incomplete: boolean;
  errorCode: string | null;
  /** Documents utilisés par le Limpid (plusieurs : Limpid commun). */
  sourceCount: number;
  favorite: boolean;
  cover: CoverView;
  /** Dernière consultation (position de lecture enregistrée), ou null. */
  openedAt: string | null;
  /** Étape serveur de la préparation en cours (validation, extraction…), ou null. */
  stage: string | null;
}

export interface LibraryFolder {
  id: string;
  name: string;
  count: number;
}

export async function loadLibrary(opts: { q?: string; limit?: number } = {}): Promise<{ folders: LibraryFolder[]; items: LibraryItem[]; error: boolean }> {
  const supabase = await createUserClient();
  let query = supabase
    .from("reports")
    .select(
      "id, title, created_at, mode, folder_id, favorite, cover_id, cover_path, cover_url, cover_credit, current_version_id, report_versions!reports_current_version_fk(check_status), jobs(status, stage, error_code, created_at), report_progress(read_at, updated_at), report_sources(source_id)",
    )
    .eq("is_demo", false)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.q) query = query.ilike("title", `%${opts.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const [{ data, error }, { data: folderRows }] = await Promise.all([
    query,
    supabase.from("folders").select("id, name, created_at").order("created_at", { ascending: true }).limit(100),
  ]);
  const items: LibraryItem[] = (data ?? []).map((r) => {
    const jobs = (r.jobs as { status: string; stage: string | null; error_code: string | null; created_at: string }[] | null) ?? [];
    const job = [...jobs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const running = !!job && (job.status === "queued" || job.status === "running");
    const ready = !!r.current_version_id;
    const version = r.report_versions as unknown as { check_status: string } | null;
    type Progress = { read_at: string | null; updated_at: string | null };
    const progress = (r.report_progress as unknown as Progress[] | Progress | null) ?? null;
    const p = Array.isArray(progress) ? progress[0] : progress;
    const readAt = p?.read_at;
    return {
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      mode: Mode.safeParse(r.mode).data ?? null,
      folderId: (r.folder_id as string | null) ?? null,
      state: ready ? "ready" : running ? "running" : "failed",
      updating: ready && running,
      unread: ready && !readAt,
      incomplete: version?.check_status === "incomplete",
      errorCode: !ready && !running ? (job?.error_code ?? null) : null,
      sourceCount: Math.max(1, ((r.report_sources as unknown as unknown[] | null) ?? []).length),
      favorite: r.favorite === true,
      cover: lessonCover(r.id, r.cover_id as string | null, r.cover_path as string | null, { url: r.cover_url as string | null, credit: r.cover_credit }),
      openedAt: p?.updated_at ?? null,
      stage: running ? (job?.stage ?? null) : null,
    };
  });
  const counts = new Map<string, number>();
  for (const i of items) if (i.folderId) counts.set(i.folderId, (counts.get(i.folderId) ?? 0) + 1);
  const folders = (folderRows ?? []).map((f) => ({ id: f.id, name: f.name, count: counts.get(f.id) ?? 0 }));
  return { folders, items, error: !!error };
}

/** « Aujourd'hui · 14:32 », « Hier · 09:05 », « 3 oct. · 18:10 » (heure de Paris). */
export function whenLabel(iso: string, lang: "fr" | "en", today: string, yesterday: string, now = new Date()): string {
  const locale = lang === "en" ? "en-GB" : "fr-FR";
  const tz = "Europe/Paris";
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: tz });
  if (day(d) === day(now)) return `${today} · ${time}`;
  if (day(d) === day(new Date(now.getTime() - 86_400_000))) return `${yesterday} · ${time}`;
  const sameYear = d.toLocaleDateString("en-CA", { year: "numeric", timeZone: tz }) === now.toLocaleDateString("en-CA", { year: "numeric", timeZone: tz });
  const date = d.toLocaleDateString(locale, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: tz });
  return `${date} · ${time}`;
}
