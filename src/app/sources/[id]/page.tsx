import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Icon } from "@/components/Icon";
import { ExplainDocument } from "@/components/prep/ExplainDocument";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import type { Locator } from "@/lib/contracts/schemas";
import { getT } from "@/lib/i18n/server";
import { createUserClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.added.title };
}

const Coverage = z.object({
  notes: z.array(z.string()).optional(),
  partial: z.boolean().optional(),
  pending_ocr: z.boolean().optional(),
});

const KIND_LABELS: Record<string, string> = { pdf: "PDF", docx: "DOCX", txt: "TXT", paste: "Texte", url: "Lien", png: "Image", jpeg: "Image", webp: "Image" };

/** Approche annoncée : la même règle que les réglages automatiques côté serveur (familiarité, objectif). */
function approachKey(familiarity: string | null | undefined, goal: string | null | undefined): string {
  if (goal === "reviser" || goal === "appliquer" || goal === "decider") return goal;
  return familiarity === "maitrise" ? "essentiel" : "quotidien";
}

/** Document ajouté (kit V3, écran 03) : un seul aperçu de fichier, l'original et le lancement. */
export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  await requireUser();
  const supabase = await createUserClient();
  // Lectures via RLS : la source d'un autre compte est introuvable.
  const { data: src } = await supabase
    .from("sources")
    .select("id, title, kind, status, page_count, byte_size, coverage, original_url, storage_path, original_purge_at, reports(id)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!src) notFound();
  const report = (src.reports as unknown as { id: string }[] | null)?.[0];
  if (report) redirect(`/rapports/${report.id}`);

  const [{ data: segs }, { data: prefs }] = await Promise.all([
    supabase.from("source_segments").select("locator").eq("source_id", id).limit(5_000),
    supabase.from("reader_preferences").select("familiarity, goal").maybeSingle(),
  ]);
  const coverage = Coverage.safeParse(src.coverage).data ?? {};
  const pendingOcr = src.status === "extracting" && coverage.pending_ocr === true;
  const pages = new Set(
    (segs ?? []).flatMap((s) => ((s.locator as Locator).kind === "pdf_page" ? [(s.locator as { physical_index: number }).physical_index] : [])),
  ).size;
  const reading = pendingOcr
    ? t.source.pendingOcr
    : src.page_count && pages
      ? t.source.pagesRead(pages, src.page_count)
      : t.source.paragraphs(segs?.length ?? 0);
  const meta = [
    KIND_LABELS[src.kind] ?? src.kind,
    src.page_count ? t.added.pageCount(src.page_count) : null,
    src.byte_size ? t.added.size(src.byte_size) : null,
  ].filter(Boolean).join(" · ");
  const approach = t.added.approaches[approachKey(prefs?.familiarity, prefs?.goal)]!;
  const isUrl = src.kind === "url";
  const hasOriginal = isUrl ? !!src.original_url : !!src.storage_path;
  const openLabel = isUrl ? t.added.openLink : src.kind === "pdf" ? t.added.open : t.added.openOriginal;
  const until = src.original_purge_at
    ? new Date(src.original_purge_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" })
    : null;

  return (
    <Screen>
      <div className="stagger">
        <h1 className="display">{t.added.heading}</h1>
        <div className="card filecard">
          <span className="filetile filetile-sm" aria-hidden="true"><Icon name={isUrl ? "link" : "file"} /></span>
          <h2>{src.title}</h2>
          <p className="muted">{meta}</p>
          <p className="source-reading">
            {!coverage.partial && !pendingOcr && <span className="source-ok" aria-hidden="true"><Icon name="check" size={16} /></span>}
            {reading}
          </p>
          {hasOriginal ? (
            <a className="btn btn-block" href={`/api/sources/${src.id}/original`} target="_blank" rel="noopener">
              <Icon name={isUrl ? "link" : "file"} /> {openLabel}
            </a>
          ) : (
            <p className="muted small"><Icon name="info" size={16} /> {t.added.unavailable}. {t.added.unavailableNote}</p>
          )}
          {hasOriginal && !isUrl && until && <p className="muted small">{t.added.keptUntil(until)}</p>}
        </div>

        {coverage.notes && coverage.notes.length > 0 && (
          <div className="notice notice-warn" role="status">
            <strong>{coverage.partial ? t.reader.partialCoverage : t.reader.aboutSource}</strong>
            <ul>{coverage.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        )}

        <section aria-labelledby="approach-h">
          <h2 id="approach-h" className="eyebrow">{t.added.approach}</h2>
          <div className="approach">
            <Icon name="sun" />
            <span><b>{approach.title}</b><small>{approach.sub}</small></span>
          </div>
        </section>

        <div className="note">
          <b>{t.added.faithfulTitle}</b>
          <p>{t.added.faithful}</p>
        </div>
        {pendingOcr && <p className="notice" role="status">{t.source.ocrNote}</p>}
        <ExplainDocument sourceId={src.id} />
      </div>
    </Screen>
  );
}
