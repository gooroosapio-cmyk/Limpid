import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

const Id = z.string().uuid();

/** Illustration stockée d'un rapport : propriétaire vérifié par la RLS, fichier privé relu côté serveur. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; assetId: string }> }) {
  if (!(await currentUser())) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const { id, assetId } = await ctx.params;
  if (!Id.safeParse(id).success || !Id.safeParse(assetId).success) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const supabase = await createUserClient();
  const { data: asset } = await supabase
    .from("visual_assets")
    .select("storage_path, mime")
    .eq("id", assetId)
    .eq("report_id", id)
    .maybeSingle();
  if (!asset?.storage_path || !asset.mime) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const { data: file } = await adminClient().storage.from("exports").download(asset.storage_path);
  if (!file) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  return new NextResponse(new Uint8Array(await file.arrayBuffer()), {
    headers: {
      "Content-Type": asset.mime,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
