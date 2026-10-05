import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { Fab } from "@/components/shell/AppShell";
import { Screen } from "@/components/shell/Screen";
import { ReportLink } from "@/components/ReportLink";
import { FolderActions, NewFolder } from "@/components/library/FolderDialogs";
import { LibraryMemory } from "@/components/library/LibraryMemory";
import { LibrarySearch } from "@/components/library/LibrarySearch";
import { ReportRow, type RowData } from "@/components/library/ReportRow";
import { requireUser } from "@/lib/auth";
import { demoBlueprint } from "@/lib/demo/cycle-eau";
import { getLang, getT } from "@/lib/i18n/server";
import { loadLibrary, whenLabel, type LibraryItem } from "@/lib/library/load";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.library.title };
}

const FILTERS = ["tous", "prets", "en_cours", "echecs"] as const;
type Filter = (typeof FILTERS)[number];
const KIND_LABELS: Record<string, string> = { pdf: "PDF", docx: "DOCX", txt: "TXT", paste: "Texte", url: "Lien", png: "Image", jpeg: "Image", webp: "Image" };
const STATE_OF: Record<Exclude<Filter, "tous">, LibraryItem["state"]> = { prets: "ready", en_cours: "running", echecs: "failed" };

function href(params: { vue?: string; q?: string; filtre?: string; dossier?: string }): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/?${s}` : "/";
}

/**
 * Bibliothèque, page principale (kit V3, écrans 25 à 28) : rapports et sources, recherche et
 * filtres effaçables, bouton flottant pour expliquer un nouveau document.
 */
export default async function HomeLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; q?: string; filtre?: string; dossier?: string }>;
}) {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  await requireUser();
  const sp = await searchParams;
  const view = sp.vue === "sources" ? "sources" : "rapports";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.filtre ?? "") ? (sp.filtre as Filter) : "tous";
  const supabase = await createUserClient();

  if (view === "sources") {
    const { data: sources } = await supabase
      .from("sources")
      .select("id, title, kind, page_count, byte_size, storage_path, original_url, original_purged_at, created_at, reports(id)")
      .eq("is_demo", false)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    const items = (sources ?? []).map((s) => {
      const report = (s.reports as unknown as { id: string }[] | null)?.[0];
      const hasOriginal = s.kind === "url" ? !!s.original_url : !!s.storage_path;
      const meta = [
        KIND_LABELS[s.kind] ?? s.kind,
        s.page_count ? t.added.pageCount(s.page_count) : null,
        s.byte_size ? t.added.size(s.byte_size) : null,
        !hasOriginal && s.kind !== "paste" ? t.library.originalGone : null,
        !report ? t.library.noReport : null,
      ].filter(Boolean).join(" · ");
      return { id: s.id, title: s.title, meta, href: report ? `/rapports/${report.id}` : `/sources/${s.id}`, gone: !hasOriginal && s.kind !== "paste", isUrl: s.kind === "url" };
    });
    return (
      <Screen fab>
        <h1>{t.library.documents}</h1>
        <p className="lede">{t.library.sourcesLede}</p>
        {items.length === 0 ? (
          <p className="muted">{t.library.sourcesEmpty}</p>
        ) : (
          <ul className="rows stagger">
            {items.map((s) => (
              <li key={s.id}>
                <Link href={s.href} className="row">
                  <span className="row-icon"><Icon name={s.isUrl ? "link" : "file"} /></span>
                  <span className="row-text"><b>{s.title}</b><small>{s.meta}</small></span>
                  <Icon name="chevron" className="row-chevron" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {items.some((s) => s.gone) && (
          <section aria-labelledby="recover-h">
            <h2 className="eyebrow">{t.library.recover}</h2>
            <div className="card recover">
              <Icon name="alert" />
              <h3 id="recover-h">{t.library.recoverTitle}</h3>
              <p>{t.library.recoverText}</p>
              <Link href="/ajouter" className="btn btn-block">{t.library.recoverCta}</Link>
            </div>
          </section>
        )}
        <Fab />
      </Screen>
    );
  }

  const { folders, items, error } = await loadLibrary({ q: q || undefined });
  const folder = sp.dossier ? (folders.find((f) => f.id === sp.dossier) ?? null) : null;
  const [{ data: prefs }] = await Promise.all([supabase.from("reader_preferences").select("recent_searches").maybeSingle()]);
  const recent = Array.isArray(prefs?.recent_searches) ? (prefs.recent_searches as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 5) : [];
  const toRow = (i: LibraryItem): RowData => ({
    id: i.id,
    title: i.title,
    state: i.state,
    unread: i.unread,
    folderId: i.folderId,
    sub: [
      i.state === "failed" ? t.library.failed : i.state === "running" ? t.library.running : i.mode ? (t.add.modes[i.mode]?.title ?? null) : null,
      whenLabel(i.createdAt, lang, t.library.today, t.library.yesterday),
      i.incomplete ? t.library.incomplete : null,
    ]
      .filter(Boolean)
      .join(" · "),
    reason: i.state === "failed" ? (t.jobErrors[i.errorCode ?? "unknown"] ?? t.jobErrors.unknown) : undefined,
  });
  // Racine sans recherche ni filtre : dossiers d'abord, puis les Limpid hors dossier.
  const root = !folder && !q && filter === "tous";
  const scoped = folder ? items.filter((i) => i.folderId === folder.id) : root ? items.filter((i) => !i.folderId) : items;
  const shown = filter === "tous" ? scoped : scoped.filter((i) => i.state === STATE_OF[filter]);
  const emptyLibrary = !q && !folder && items.length === 0 && folders.length === 0 && !error;
  const folderList = folders.map((f) => ({ id: f.id, name: f.name }));
  const base = { filtre: filter === "tous" ? undefined : filter, dossier: folder?.id };

  return (
    <Screen fab>
      <LibraryMemory />
      {folder && (
        <nav className="crumbs" aria-label={t.library.folders}>
          <Link href={href({ filtre: base.filtre })}>{t.library.backToLibrary}</Link> <span aria-hidden="true">›</span>
        </nav>
      )}
      <div className="lib-head">
        <h1>{folder ? folder.name : t.library.title}</h1>
        {!emptyLibrary && <LibrarySearch q={q} recent={recent} base={base} />}
      </div>
      {folder && <FolderActions id={folder.id} name={folder.name} />}
      {emptyLibrary ? (
        <div className="empty lib-empty stagger">
          <div className="empty-art" aria-hidden="true"><Icon name="book" size={56} /></div>
          <h2>{t.library.emptyTitle}</h2>
          <p className="muted">{t.library.empty}</p>
          <Link href="/ajouter" className="btn btn-primary btn-block"><Icon name="plus" /> {t.library.emptyCta}</Link>
          <NewFolder />
          <Link href="/rapports/demo" className="btn-link">{t.library.example}</Link>
        </div>
      ) : (
        <>
          {q && (
            <p className="active-search" role="status">
              <span>{t.library.results(shown.length, q)}</span>
              <Link href={href(base)} className="chip">
                <Icon name="close" size={14} /> {t.library.clear}
              </Link>
            </p>
          )}
          <nav className="filters lib-filters" aria-label={t.library.filters}>
            {FILTERS.map((f) => (
              <Link key={f} href={href({ q: q || undefined, dossier: folder?.id, filtre: f === "tous" ? undefined : f })} className="filterchip" aria-current={filter === f ? "true" : undefined}>
                {t.library.filter[f]}
              </Link>
            ))}
          </nav>
          {filter === "echecs" && <p className="muted small lib-failures-intro">{t.library.failuresIntro}</p>}

          {root && (
            <section aria-labelledby="folders-h" className="lib-folders">
              <div className="lib-section-head">
                <h2 id="folders-h" className="eyebrow">{t.library.folders}</h2>
                <NewFolder />
              </div>
              {folders.length > 0 && (
                <ul className="rows">
                  {folders.map((f) => (
                    <li key={f.id}>
                      <Link href={href({ dossier: f.id })} className="row">
                        <span className="row-icon"><Icon name="folder" /></span>
                        <span className="row-text"><b>{f.name}</b><small>{t.library.folderCount(f.count)}</small></span>
                        <Icon name="chevron" className="row-chevron" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section aria-labelledby="limpids-h">
            <h2 id="limpids-h" className="eyebrow">{t.library.limpids}</h2>
            {shown.length === 0 ? (
              <p className="muted">{q ? t.library.noResult : folder && filter === "tous" ? t.library.folderEmpty : t.library.noneInFilter}</p>
            ) : (
              <ul className="rows lib-rows">
                {shown.map((i) => (
                  <ReportRow key={i.id} row={toRow(i)} folders={folderList} showFailure={filter === "echecs"} />
                ))}
              </ul>
            )}
          </section>

          {root && (
            <ul className="rows lib-extra">
              <li>
                <ReportLink href="/rapports/demo" className="row" immersive>
                  <span className="row-icon"><Icon name="star" /></span>
                  <span className="row-text"><b>{demoBlueprint.title}</b><small>{t.library.demoTitle} · {t.demo.badge}</small></span>
                  <Icon name="chevron" className="row-chevron" />
                </ReportLink>
              </li>
              <li>
                <Link href={href({ vue: "sources" })} className="row">
                  <span className="row-icon"><Icon name="file" /></span>
                  <span className="row-text"><b>{t.library.documents}</b></span>
                  <Icon name="chevron" className="row-chevron" />
                </Link>
              </li>
            </ul>
          )}
        </>
      )}
      <Fab />
    </Screen>
  );
}
