import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { deleteFolder, FolderName, renameFolder } from "@/lib/library/folders";
import { deleteReport } from "@/lib/reports/delete";
import { adminClient } from "@/lib/supabase/admin";

const Id = z.string().uuid();
const Body = z.strictObject({ name: FolderName });

async function guard(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return { error: NextResponse.json({ error: "non_connecte" }, { status: 401 }) };
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return { error: NextResponse.json({ error: "origine" }, { status: 403 }) };
  const { id } = await ctx.params;
  if (!Id.safeParse(id).success) return { error: NextResponse.json({ error: "introuvable" }, { status: 404 }) };
  return { userId: user.id, id };
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(request, ctx);
  if ("error" in g) return g.error;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "requete" }, { status: 400 });
  return (await renameFolder(g.userId, g.id, body.data.name))
    ? NextResponse.json({ id: g.id, name: body.data.name })
    : NextResponse.json({ error: "introuvable" }, { status: 404 });
}

/**
 * Supprime le dossier ; par défaut ses Limpid sont conservés et reviennent à la racine.
 * ?avec_limpid=1 (choix distinct, confirmé dans l'interface) supprime aussi ses Limpid.
 */
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(request, ctx);
  if ("error" in g) return g.error;
  if (request.nextUrl.searchParams.get("avec_limpid") === "1") {
    const { data: inside } = await adminClient().from("reports").select("id").eq("folder_id", g.id).eq("owner_id", g.userId).is("deleted_at", null);
    for (const r of inside ?? []) await deleteReport(g.userId, r.id);
  }
  return (await deleteFolder(g.userId, g.id)) ? NextResponse.json({ status: "deleted" }) : NextResponse.json({ error: "introuvable" }, { status: 404 });
}
