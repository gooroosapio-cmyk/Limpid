import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { coverGenerationEnabled, generateCover } from "@/lib/library/cover-gen";
import { adminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

export const maxDuration = 120;
const Id = z.string().uuid();

/** Couverture générée d'un Limpid, servie par Limpid au seul propriétaire (la CSP n'autorise que nos images). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) return new NextResponse(null, { status: 404 });
  const { data } = await (await createUserClient()).from("reports").select("cover_path").eq("id", id).maybeSingle();
  if (!data?.cover_path) return new NextResponse(null, { status: 404 });
  const file = await adminClient().storage.from("exports").download(data.cover_path as string);
  if (file.error || !file.data) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(await file.data.arrayBuffer()), {
    headers: {
      "Content-Type": "image/webp",
      // Adresse versionnée par le chemin (?k=) : mise en cache longue, privée.
      "Cache-Control": "private, max-age=604800, immutable",
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** « Générer la couverture » (leçons existantes ou nouvelle image) : gratuite, plafonnée par le budget IA. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  if (!coverGenerationEnabled()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const db = adminClient();
  const { data: report } = await db
    .from("reports")
    .select("title, current_version_id, report_versions!reports_current_version_fk(explanation)")
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!report?.current_version_id) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  // Une génération par Limpid et par 10 minutes au plus (journal de consommation).
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await db.from("audit_log").select("id", { count: "exact", head: true }).eq("actor_id", user.id).eq("action", "report.cover").eq("target_id", id).gte("created_at", since);
  if ((count ?? 0) > 0) return NextResponse.json({ error: "trop_tot" }, { status: 429 });
  await db.from("audit_log").insert({ actor_id: user.id, action: "report.cover", target_kind: "report", target_id: id });
  const explanation = (report.report_versions as unknown as { explanation: { key_points?: string[] } } | null)?.explanation;
  const path = await generateCover({ reportId: id, ownerId: user.id, title: report.title as string, hints: explanation?.key_points ?? [] });
  return path ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "echec" }, { status: 502 });
}
