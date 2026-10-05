import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { BUCKET } from "@/lib/sources/uploads";
import { adminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

/**
 * « Ouvrir le PDF » : l'original privé, après contrôle du propriétaire (RLS), par un lien signé
 * valable 60 secondes. Un original effacé (conservation échue, ancien rapport) renvoie 410.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const supabase = await createUserClient();
  const { data: src } = await supabase.from("sources").select("kind, storage_path, original_url").eq("id", id).maybeSingle();
  if (!src) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  if (src.kind === "url" && src.original_url) return NextResponse.redirect(src.original_url, 302);
  if (!src.storage_path) return NextResponse.json({ error: "original_indisponible" }, { status: 410 });
  const { data } = await adminClient().storage.from(BUCKET).createSignedUrl(src.storage_path, 60);
  if (!data?.signedUrl) return NextResponse.json({ error: "original_indisponible" }, { status: 410 });
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
