import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { BilanSubmit, submitBilan } from "@/lib/reports/bilan";
import { isAdminConfigured } from "@/lib/supabase/admin";

const Id = z.string().uuid();

/** Soumission du bilan final : correction et note calculées par le serveur (kit V5). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json({ error: "non_configure" }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { id } = await ctx.params;
  const parsed = BilanSubmit.safeParse(await request.json().catch(() => null));
  if (!Id.safeParse(id).success || !parsed.success) return NextResponse.json({ error: "requete_invalide" }, { status: 400 });
  const result = await submitBilan(user.id, id, parsed.data);
  if (!result) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
