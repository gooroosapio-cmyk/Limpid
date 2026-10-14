import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/wallet";
import { assertWithinPlan, automaticSettings, contentCap, courseQuote, CreateError, ocrCap } from "@/lib/reports/create";
import { MAX_SOURCES } from "@/lib/reports/source-set";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { DEFAULT_SUPPORTS, SupportSelection, withIncludedSupports } from "@/lib/supports/supports";

const Body = z.strictObject({
  source_ids: z.array(z.string().uuid()).min(1).max(MAX_SOURCES),
  /** Supports choisis ; absents : le livre seul (ancien client). Carte et flashcards incluses. */
  supports: SupportSelection.optional(),
  /** Nouvelles images générées demandées (0 par défaut). */
  images: z.number().int().min(0).max(10).optional(),
});

/**
 * Devis d'un Limpid (spécification du 14 octobre 2026, § 4 et § 5) : prix continu selon les
 * pages de contenu, les pages scannées et les images choisies. Aucun appel IA. `limits` borne le
 * choix d'images ; `block` signale une limite de l'offre dépassée avant tout lancement.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json({ error: "non_configure" }, { status: 503 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "requete_invalide" }, { status: 400 });
  const ids = [...new Set(parsed.data.source_ids)];
  const { count } = await adminClient().from("sources").select("id", { count: "exact", head: true }).in("id", ids).eq("owner_id", user.id).is("deleted_at", null);
  if (count !== ids.length) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const [ent, settings] = await Promise.all([getEntitlements(user.id), automaticSettings(user.id, ids)]);
  const images = Math.min(parsed.data.images ?? 0, ent.limits.imagesPerCourse);
  const quote = courseQuote(settings.measure, images);
  let block: { code: string; limit?: number } | null = null;
  try {
    assertWithinPlan(ent, settings.measure, images);
  } catch (e) {
    if (!(e instanceof CreateError)) throw e;
    block = { code: e.code, limit: e.detail.limit };
  }
  return NextResponse.json(
    {
      action: "report",
      credits: quote.credits,
      pages: quote.P,
      ocr_pages: quote.R,
      images: quote.G,
      supports: withIncludedSupports(parsed.data.supports ?? DEFAULT_SUPPORTS),
      limits: { images: ent.limits.imagesPerCourse, pages: contentCap(ent), ocr_pages: ocrCap(ent) },
      block,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
