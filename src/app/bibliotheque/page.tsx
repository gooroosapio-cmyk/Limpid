import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/shell/Screen";
import { ReportLink } from "@/components/ReportLink";
import { FolderActions, NewFolder } from "@/components/library/FolderDialogs";
import { LibraryMemory } from "@/components/library/LibraryMemory";
import { LibraryBrowser, type ResumeItem } from "@/components/library/LibraryBrowser";
import { Preparations } from "@/components/library/Preparations";
import { SortSelect } from "@/components/library/SortSelect";
import { canRetryNow } from "@/lib/library/retry";
import { type RowData } from "@/components/library/ReportRow";
import { requireUser } from "@/lib/auth";
import { demoBlueprint } from "@/lib/demo/cycle-eau";
import { getLang, getT } from "@/lib/i18n/server";
import { coverFor, coverView } from "@/lib/library/covers";
import { loadLibrary, whenLabel, type LibraryItem } from "@/lib/library/load";
import { createUserClient } from "@/lib/supabase/server";
import { Illustration } from "@/components/Illustration";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.library.title };
}

const FILTERS = ["tous", "prets", "en_cours", "favoris"] as const;
type Filter = (typeof FILTERS)[number] | "dossiers";
const SORTS = ["recents", "anciens", "titre"] as const;
type Sort = (typeof SORTS)[number];
const KIND_LABELS: Record<string, string> = { pdf: "PDF", docx: "DOCX", txt: "TXT", paste: "Texte", url: "Lien", png: "Image", jpeg: "Image", webp: "Image" };

/** Codes d'échec liés à la taille traitée par le modèle (limite de tokens). */
const TOKEN_LIMIT = new Set(["provider_truncated", "provider_context_overflow"]);

function href(params: { vue?: string; q?: string; filtre?: string; dossier?: string; tri?: string }): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/bibliotheque?${s}` : "/bibliotheque";
}

/**
 * Bibliothèque (V2 « galerie », /bibliotheque depuis la V4) : recherche, rail de filtres, Reprendre,
 * collections et leçons ; vue Préparations (en cours, à vérifier) ; documents sources.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; q?: string; filtre?: string; dossier?: string; tri?: string }>;
}) {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  await requireUser();
  const sp = await searchParams;
  const view = sp.vue === "sources" ? "sources" : sp.vue === "preparations" ? "preparations" : "rapports";
  const q = (sp.q ?? "").trim().slice(0, 80);
  // « recents » (V2) devient le tri par défaut ; « dossiers » reste l'accès à toutes les collections.
  const filter: Filter = sp.filtre === "dossiers" ? "dossiers" : (FILTERS as readonly string[]).includes(sp.filtre ?? "") ? (sp.filtre as Filter) : "tous";
  const sort: Sort = (SORTS as readonly string[]).includes(sp.tri ?? "") ? (sp.tri as Sort) : "recents";
  const supabase = await createUserClient();

  if (view === "sources") {
    const { data: sources } = await supabase
      .from("sources")
      .select("id, title, kind, page_count, byte_size, storage_path, original_url, original_purged_at, created_at, reports!report_sources(id)")
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
      <Screen>
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
              <Link href="/" className="btn btn-block">{t.library.recoverCta}</Link>
            </div>
          </section>
        )}
      </Screen>
    );
  }

  const { folders, items, error } = await loadLibrary();
  const v = t.library.v2;

  if (view === "preparations") {
    const running = items.filter((i) => i.state === "running" || i.updating);
    const failed = items.filter((i) => i.state === "failed");
    return (
      <Screen>
        <Preparations
          running={running.map((i) => ({ id: i.id, title: i.title, cover: i.cover, sourceCount: i.sourceCount, stage: i.stage }))}
          failed={failed.map((i) => ({ id: i.id, title: i.title, cover: i.cover, sourceCount: i.sourceCount, reason: t.jobErrors[i.errorCode ?? "unknown"] ?? t.jobErrors.unknown ?? "", retryable: canRetryNow(i.errorCode) }))}
          initialTab={sp.filtre === "a_verifier" ? "failed" : "running"}
        />
      </Screen>
    );
  }

  const folder = sp.dossier ? (folders.find((f) => f.id === sp.dossier) ?? null) : null;
  const { data: prefs } = await supabase.from("reader_preferences").select("recent_searches").maybeSingle();
  const recent = Array.isArray(prefs?.recent_searches) ? (prefs.recent_searches as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 5) : [];
  const folderNames = new Map(folders.map((f) => [f.id, f.name]));
  const failureReason = (code: string | null) =>
    TOKEN_LIMIT.has(code ?? "") ? t.v4.failure.tokenLimit : (t.jobErrors[code ?? "unknown"] ?? t.jobErrors.unknown);
  const toRow = (i: LibraryItem): RowData => ({
    id: i.id,
    title: i.title,
    state: i.state,
    unread: i.unread,
    folderId: i.folderId,
    folderName: i.folderId ? (folderNames.get(i.folderId) ?? null) : null,
    sub: whenLabel(i.createdAt, lang, t.library.today, t.library.yesterday),
    reason: i.state === "failed" ? failureReason(i.errorCode) : undefined,
    favorite: i.favorite,
    cover: i.cover,
    sourceCount: i.sourceCount,
  });
  const scoped = folder ? items.filter((i) => i.folderId === folder.id) : items;
  // Les préparations échouées restent dans la liste (« Échec » et motif), comme les autres.
  const lessons = scoped.filter((i) => i.state === "ready");
  const byOpened = (a: LibraryItem, b: LibraryItem) => (b.openedAt ?? b.createdAt).localeCompare(a.openedAt ?? a.createdAt);
  const pool =
    filter === "prets" ? lessons
    : filter === "favoris" ? lessons.filter((i) => i.favorite)
    : filter === "en_cours" ? scoped.filter((i) => i.state === "running")
    : scoped;
  const shown = [...pool].sort((a, b) =>
    sort === "titre" ? a.title.localeCompare(b.title, lang) : sort === "anciens" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt),
  );
  const last = lessons.filter((i) => i.openedAt).sort(byOpened)[0];
  const resume: ResumeItem | null = last
    ? { id: last.id, title: last.title, cover: last.cover, sourceCount: last.sourceCount, opened: whenLabel(last.openedAt!, lang, t.library.today, t.library.yesterday).split(" · ")[0]!.toLowerCase() }
    : null;
  const emptyLibrary = !folder && items.length === 0 && folders.length === 0 && !error;
  const emptyText = filter === "favoris" ? v.noFavorites : filter === "en_cours" ? t.v4.library.noneRunning : folder ? t.library.folderEmpty : t.library.noneInFilter;

  if (emptyLibrary) {
    return (
      <Screen>
        <LibraryMemory />
        <h1>{t.library.title}</h1>
        <section className="lib-empty-v2 stagger">
          <Illustration name="bibliotheque-vide" fallback="lumiere" className="lib-empty-cover" eager />
          <h2>{v.emptyTitle}</h2>
          <p className="muted">{v.emptyText}</p>
          <Link href="/" className="btn btn-primary btn-block">{t.library.emptyCta} <Icon name="arrow" /></Link>
          <NewFolder />
          <ReportLink href="/rapports/demo" className="btn-link" immersive>{t.library.example}</ReportLink>
        </section>
      </Screen>
    );
  }

  const l = t.v4.library;
  const keep = { dossier: folder?.id, tri: sort === "recents" ? undefined : sort };
  const sortHrefs = Object.fromEntries(SORTS.map((k) => [k, href({ dossier: folder?.id, filtre: filter === "tous" ? undefined : filter, tri: k === "recents" ? undefined : k })]));

  return (
    <Screen>
      <LibraryMemory />
      {folder && (
        <nav className="crumbs" aria-label={t.library.folders}>
          <Link href="/bibliotheque"><Icon name="back" size={18} /> {t.library.backToLibrary}</Link>
        </nav>
      )}
      <LibraryBrowser
        title={folder ? folder.name : t.library.title}
        folder={folder ? { id: folder.id, name: folder.name } : null}
        folders={folder ? [] : folders.map((f) => ({ ...f, cover: coverView(coverFor(f.id, null)) }))}
        allFolders={folders.map((f) => ({ id: f.id, name: f.name }))}
        rows={shown.map(toRow)}
        root={!folder}
        filter={filter}
        initialQuery={q}
        recent={recent}
        resume={resume}
        emptyText={emptyText}
        newFolder={<NewFolder iconOnly />}
        headerExtra={folder ? <FolderActions id={folder.id} name={folder.name} count={scoped.length} /> : undefined}
        rail={
          <nav className="lib-filters lib-controls" aria-label={l.filtersLabel}>
            {FILTERS.map((f) => (
              <Link key={f} href={href({ ...keep, filtre: f === "tous" ? undefined : f })} aria-current={filter === f ? "true" : undefined}>{l.filters[f]}</Link>
            ))}
          </nav>
        }
        sortControl={<SortSelect value={sort} hrefs={sortHrefs} />}
        preparations={null}
        filtered={filter !== "tous" || sort !== "recents"}
        footer={
          !folder ? (
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
          ) : undefined
        }
      />
    </Screen>
  );
}
