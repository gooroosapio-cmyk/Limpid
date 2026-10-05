import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { AttemptRequest, listAttempts, saveAttempt } from "@/lib/reports/reading";
import { isAdminConfigured } from "@/lib/supabase/admin";

const Id = z.string().uuid();

/** Tentatives de bilan précédentes d'une version (les plus récentes d'abord). */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json({ attempts: [] });
  const { id } = await ctx.params;
  const version = request.nextUrl.searchParams.get("version") ?? "";
  if (!Id.safeParse(id).success || !Id.safeParse(version).success) return NextResponse.json({ error: "requete_invalide" }, { status: 400 });
  return NextResponse.json({ attempts: await listAttempts(user.id, id, version) }, { headers: { "Cache-Control": "no-store" } });
}

/** Enregistre une tentative (point de contrôle ou bilan) ; les précédentes sont conservées. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json({ error: "non_configure" }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { id } = await ctx.params;
  const parsed = AttemptRequest.safeParse(await request.json().catch(() => null));
  if (!Id.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "requete_invalide" }, { status: 400 });
  const ok = await saveAttempt(user.id, id, parsed.data);
  return NextResponse.json({ ok }, { status: ok ? 201 : 404 });
}
