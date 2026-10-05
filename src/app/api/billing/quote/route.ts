import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { ACTION_PRICES, reportAction } from "@/lib/billing/catalog";
import { automaticSettings } from "@/lib/reports/create";
import { MAX_SOURCES } from "@/lib/reports/source-set";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";

const Body = z.strictObject({ source_ids: z.array(z.string().uuid()).min(1).max(MAX_SOURCES) });

/** Devis d'un Limpid commun (§ 19) : prix fixe selon la taille réelle des documents lus, sans appel IA. */
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json({ error: "non_configure" }, { status: 503 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "requete_invalide" }, { status: 400 });
  const ids = [...new Set(parsed.data.source_ids)];
  const { count } = await adminClient().from("sources").select("id", { count: "exact", head: true }).in("id", ids).eq("owner_id", user.id).is("deleted_at", null);
  if (count !== ids.length) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const action = reportAction((await automaticSettings(user.id, ids)).chars);
  return NextResponse.json({ action, credits: ACTION_PRICES[action] }, { headers: { "Cache-Control": "no-store" } });
}
