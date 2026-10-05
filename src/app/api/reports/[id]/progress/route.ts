import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { ProgressRequest, saveProgress } from "@/lib/reports/reading";
import { isAdminConfigured } from "@/lib/supabase/admin";

/** Position de lecture et statut lu (appelé par le lecteur, sans IA). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json({ error: "non_configure" }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { id } = await ctx.params;
  const parsed = ProgressRequest.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "requete_invalide" }, { status: 400 });
  const ok = await saveProgress(user.id, id, parsed.data);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
