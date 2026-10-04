import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { deleteReport } from "@/lib/reports/delete";
import { createUserClient } from "@/lib/supabase/server";

const Id = z.string().uuid();

/** État de la génération (lecture via RLS : seul le propriétaire voit sa tâche). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("jobs")
    .select("status, stage, error_code")
    .eq("report_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const result = await deleteReport(user.id, id);
  if (result === "not_found") return NextResponse.json({ error: "introuvable" }, { status: 404 });
  return NextResponse.json({ status: result });
}
