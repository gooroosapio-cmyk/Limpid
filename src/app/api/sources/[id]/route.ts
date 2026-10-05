import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { purgeOriginal } from "@/lib/sources/uploads";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";

/**
 * Retire un document ajouté mais pas encore expliqué (« Supprimer » à l'import) : marqué
 * supprimé et original effacé. Un document déjà lié à un Limpid n'est pas concerné.
 */
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json({ error: "non_configure" }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const db = adminClient();
  const { data: src } = await db.from("sources").select("id, storage_path, reports!report_sources(id)").eq("id", id).eq("owner_id", user.id).is("deleted_at", null).maybeSingle();
  if (!src) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  if (((src.reports as unknown as { id: string }[] | null) ?? []).length > 0) return NextResponse.json({ error: "utilise" }, { status: 409 });
  await db.from("sources").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("owner_id", user.id);
  await purgeOriginal(id, (src.storage_path as string | null) ?? null).catch(() => undefined);
  return NextResponse.json({ status: "supprime" });
}
