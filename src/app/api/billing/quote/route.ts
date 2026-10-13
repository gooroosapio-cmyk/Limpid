import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { reportAction } from "@/lib/billing/catalog";
import { automaticSettings } from "@/lib/reports/create";
import { MAX_SOURCES } from "@/lib/reports/source-set";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { DEFAULT_SUPPORTS, quoteSupports, SupportSelection } from "@/lib/supports/supports";

const Body = z.strictObject({
  source_ids: z.array(z.string().uuid()).min(1).max(MAX_SOURCES),
  /** Supports choisis ; absents : le livre seul (ancien client). */
  supports: SupportSelection.optional(),
});

/**
 * Devis d'un Limpid (§ 19 ; supports § 3) : préparation commune selon la taille réelle des
 * documents lus, puis coût marginal de chaque support dérivé. Aucun appel IA. `credits` reste le
 * total (compatibilité) ; `supports` reprend la sélection pour écarter un devis obsolète.
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
  const supports = parsed.data.supports ?? DEFAULT_SUPPORTS;
  const action = reportAction((await automaticSettings(user.id, ids)).pages);
  const quote = quoteSupports(action, supports);
  return NextResponse.json(
    { action, credits: quote.total, base: quote.base.credits, extras: quote.extras.map((e) => ({ support: e.support, credits: e.credits })), supports },
    { headers: { "Cache-Control": "no-store" } },
  );
}
