import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { SourceReview, type PreviewGroup } from "@/components/SourceReview";
import { requireUser } from "@/lib/auth";
import type { Level, Locator } from "@/lib/contracts/schemas";
import { fr } from "@/lib/i18n/fr";
import { createUserClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: fr.source.title };

const LEVEL_BY_FAMILIARITY: Record<string, Level> = { aucune: "grand_public", bases: "grand_public", maitrise: "etudiant" };
const Coverage = z.object({
  notes: z.array(z.string()).optional(),
  partial: z.boolean().optional(),
  empty_pages: z.array(z.number()).optional(),
  pending_ocr: z.boolean().optional(),
});
const PREVIEW_CHARS = 1_400;
const SEGMENTS_PER_PART = 4;

/** Regroupe les segments par page (PDF) ou par parties de quelques paragraphes. */
function previewGroups(segments: { locator: Locator; text: string }[]): PreviewGroup[] {
  const groups: { label: string; heading: string | null; texts: string[] }[] = [];
  const paged = segments.some((s) => s.locator.kind === "pdf_page");
  for (const s of segments) {
    const loc = s.locator;
    const label = paged && loc.kind === "pdf_page" ? `Page ${loc.physical_index}` : `Partie ${Math.floor(groups.length) + 1}`;
    const last = groups[groups.length - 1];
    const sameGroup = paged ? last?.label === label : last && last.texts.length < SEGMENTS_PER_PART;
    if (sameGroup && last) last.texts.push(s.text);
    else groups.push({ label, heading: loc.kind === "section" ? (loc.heading_path.at(-1) ?? null) : null, texts: [s.text] });
  }
  return groups.map((g) => {
    const text = g.texts.join("\n\n");
    return { label: g.label, heading: g.heading, text: text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS).trimEnd()}…` : text };
  });
}

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  await requireUser();
  const supabase = await createUserClient();
  // Lectures via RLS : la source d'un autre compte est introuvable.
  const { data: src } = await supabase
    .from("sources")
    .select("id, title, kind, status, page_count, coverage, original_url, reports(id)")
    .eq("id", id)
    .maybeSingle();
  if (!src) notFound();
  const report = (src.reports as unknown as { id: string }[] | null)?.[0];
  if (report) redirect(`/rapports/${report.id}`);

  const [{ data: segs }, { data: prefs }] = await Promise.all([
    supabase.from("source_segments").select("locator, text").eq("source_id", id).order("ordinal").limit(2_000),
    supabase.from("reader_preferences").select("familiarity, goal").maybeSingle(),
  ]);
  const coverage = Coverage.safeParse(src.coverage).data ?? {};
  const groups = previewGroups((segs ?? []) as { locator: Locator; text: string }[]);
  const pagesRead =
    src.kind === "pdf" || (src.kind === "url" && src.page_count)
      ? new Set((segs ?? []).map((s) => (s.locator as Locator).kind === "pdf_page" ? (s.locator as { physical_index: number }).physical_index : 0)).size
      : null;

  return (
    <SourceReview
      source={{
        id: src.id,
        title: src.title,
        kind: src.kind,
        pageCount: src.page_count,
        pagesRead,
        paragraphs: segs?.length ?? 0,
        notes: coverage.notes ?? [],
        partial: coverage.partial ?? false,
        pendingOcr: src.status === "extracting" && coverage.pending_ocr === true,
        url: src.original_url,
      }}
      groups={groups}
      defaultLevel={LEVEL_BY_FAMILIARITY[prefs?.familiarity ?? ""] ?? "grand_public"}
      defaultGoal={(prefs?.goal as "comprendre" | "reviser" | "appliquer" | "decider" | null) ?? "comprendre"}
    />
  );
}
