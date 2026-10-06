import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

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
