import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { Fab } from "@/components/shell/AppShell";
import { Screen } from "@/components/shell/Screen";
import { ReportLink } from "@/components/ReportLink";
import { ThemeId } from "@/lib/contracts/schemas";
import { requireUser } from "@/lib/auth";
import { demoBlueprint } from "@/lib/demo/cycle-eau";
import { autoTheme } from "@/lib/display/themes";
import { fr } from "@/lib/i18n/fr";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: fr.library.title };

const FILTERS = ["tous", "prets", "en_cours", "a_revoir"] as const;
type Filter = (typeof FILTERS)[number];
const KIND_LABELS: Record<string, string> = { pdf: "PDF", docx: "DOCX", txt: "TXT", paste: "Texte", url: "Lien", png: "Image", jpeg: "Image", webp: "Image" };
const THEME_ICONS: Record<string, IconName> = { sciences: "spark", recit: "book", dossier: "filter", guide: "list", confort: "eye" };

function when(date: string): string {
  const d = new Date(date);
  const day = (x: Date) => x.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  const now = new Date();
  if (day(d) === day(now)) return fr.library.today;
  if (day(d) === day(new Date(now.getTime() - 86_400_000))) return fr.library.yesterday;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
}

function href(params: { vue?: string; q?: string; filtre?: string }): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `/?${s}` : "/";
}

/**
 * Bibliothèque, page principale (kit V3, écrans 25 à 28) : rapports et sources, recherche et
 * filtres effaçables, bouton flottant pour expliquer un nouveau document.
 */
export default async function HomeLibraryPage({ searchParams }: { searchParams: Promise<{ vue?: string; q?: string; filtre?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const view = sp.vue === "sources" ? "sources" : "rapports";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const filter: Filter = (FILTERS as readonly string[]).includes(sp.filtre ?? "") ? (sp.filtre as Filter) : "tous";
  const supabase = await createUserClient();

  const tabs = (
    <nav className="seg lib-tabs" aria-label={fr.library.tabs}>
      <Link href={href({})} aria-current={view === "rapports" ? "page" : undefined}>{fr.library.reports}</Link>
      <Link href={href({ vue: "sources" })} aria-current={view === "sources" ? "page" : undefined}>{fr.library.sources}</Link>
    </nav>
  );

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
        s.page_count ? fr.added.pageCount(s.page_count) : null,
        s.byte_size ? fr.added.size(s.byte_size) : null,
        !hasOriginal && s.kind !== "paste" ? fr.library.originalGone : null,
        !report ? fr.library.noReport : null,
      ].filter(Boolean).join(" · ");
      return { id: s.id, title: s.title, meta, href: report ? `/rapports/${report.id}` : `/sources/${s.id}`, gone: !hasOriginal && s.kind !== "paste", isUrl: s.kind === "url" };
    });
    return (
      <Screen fab>
        <h1>{fr.library.title}</h1>
        {tabs}
        <p className="lede">{fr.library.sourcesLede}</p>
        {items.length === 0 ? (
          <p className="muted">{fr.library.sourcesEmpty}</p>
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
            <h2 className="eyebrow">{fr.library.recover}</h2>
            <div className="card recover">
              <Icon name="alert" />
              <h3 id="recover-h">{fr.library.recoverTitle}</h3>
              <p>{fr.library.recoverText}</p>
              <Link href="/ajouter" className="btn btn-block">{fr.library.recoverCta}</Link>
            </div>
          </section>
        )}
        <Fab />
      </Screen>
    );
  }

  let query = supabase
    .from("reports")
    .select("id, title, created_at, theme_id, current_version_id, report_versions!reports_current_version_fk(template_id, check_status), jobs(status, created_at)")
    .eq("is_demo", false)
    .order("created_at", { ascending: false })
    .limit(100);
  if (q) query = query.ilike("title", `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const { data: reports, error } = await query;
  const rows = (reports ?? []).map((r) => {
    const job = [...((r.jobs as { status: string; created_at: string }[] | null) ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const version = r.report_versions as unknown as { template_id: string; check_status: string } | null;
    const ready = !!r.current_version_id;
    const running = !!job && (job.status === "queued" || job.status === "running");
    const failed = !ready && !!job && !running;
    const theme = ThemeId.safeParse(r.theme_id).data ?? autoTheme(version?.template_id);
    const state: Filter = failed || version?.check_status === "incomplete" ? "a_revoir" : !ready ? "en_cours" : "prets";
    const sub = failed
      ? fr.library.failed
      : !ready
        ? fr.library.preparing
        : `${fr.themes.names[theme] ?? theme} · ${when(r.created_at)}${version?.check_status === "incomplete" ? ` · ${fr.library.incomplete}` : ""}`;
    return { id: r.id, title: r.title, sub, state, ready, icon: (failed ? "alert" : !ready ? "refresh" : (THEME_ICONS[theme] ?? "book")) as IconName, cls: failed ? "row error" : !ready ? "row running" : "row" };
  });
  const shown = filter === "tous" ? rows : rows.filter((r) => r.state === filter);
  const emptyLibrary = !q && rows.length === 0 && !error;

  return (
    <Screen fab>
      <h1>{fr.library.title}</h1>
      {tabs}
      {emptyLibrary ? (
        <div className="empty lib-empty stagger">
          <div className="empty-art" aria-hidden="true"><Icon name="book" size={56} /></div>
          <h2>{fr.library.emptyTitle}</h2>
          <p className="muted">{fr.library.empty}</p>
          <Link href="/ajouter" className="btn btn-primary btn-block"><Icon name="plus" /> {fr.library.emptyCta}</Link>
          <Link href="/rapports/demo" className="btn-link">{fr.library.example}</Link>
        </div>
      ) : (
        <>
          <form className="searchbox" role="search" action="/">
            <Icon name="search" />
            <label htmlFor="lib-q" className="sr-only">{fr.library.searchLabel}</label>
            <input id="lib-q" name="q" type="search" defaultValue={q} placeholder={fr.library.search} maxLength={80} autoComplete="off" />
            {filter !== "tous" && <input type="hidden" name="filtre" value={filter} />}
          </form>
          <nav className="filters" aria-label={fr.library.filters}>
            {FILTERS.map((f) => (
              <Link key={f} href={href({ q, filtre: f === "tous" ? undefined : f })} className="filterchip" aria-current={filter === f ? "true" : undefined}>
                {fr.library.filter[f]}
              </Link>
            ))}
          </nav>
          {q && (
            <p className="muted small" role="status">
              {fr.library.results(shown.length, q)} · <Link href={href({ filtre: filter === "tous" ? undefined : filter })}>{fr.library.clear}</Link>
            </p>
          )}
          <h2 className="eyebrow">{fr.library.recent}</h2>
          {shown.length === 0 ? (
            <p className="muted">{fr.library.noResult}</p>
          ) : (
            <ul className="rows stagger">
              {shown.map((r) => (
                <li key={r.id}>
                  <ReportLink href={`/rapports/${r.id}`} className={r.cls} immersive={r.ready}>
                    <span className="row-icon"><Icon name={r.icon} /></span>
                    <span className="row-text"><b>{r.title}</b><small>{r.sub}</small></span>
                    <Icon name="chevron" className="row-chevron" />
                  </ReportLink>
                </li>
              ))}
            </ul>
          )}
          <ul className="rows">
            <li>
              <ReportLink href="/rapports/demo" className="row" immersive>
                <span className="row-icon"><Icon name="star" /></span>
                <span className="row-text"><b>{demoBlueprint.title}</b><small>{fr.library.demoTitle} · {fr.demo.badge}</small></span>
                <Icon name="chevron" className="row-chevron" />
              </ReportLink>
            </li>
          </ul>
        </>
      )}
      <Fab />
    </Screen>
  );
}
