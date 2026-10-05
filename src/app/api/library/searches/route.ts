import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { pushRecent } from "@/lib/library/folders";
import { createUserClient } from "@/lib/supabase/server";

const Body = z.strictObject({ q: z.string().trim().min(1).max(80) });

/** Mémorise une recherche (5 récentes par compte, via la RLS). */
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "requete" }, { status: 400 });
  const supabase = await createUserClient();
  const { data } = await supabase.from("reader_preferences").select("recent_searches").maybeSingle();
  const recent = pushRecent(data?.recent_searches, body.data.q);
  const { error } = await supabase.from("reader_preferences").upsert({ owner_id: user.id, recent_searches: recent });
  if (error) return NextResponse.json({ error: "stockage" }, { status: 500 });
  return NextResponse.json({ recent });
}

/** Efface l'historique des recherches. */
export async function DELETE(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const supabase = await createUserClient();
  await supabase.from("reader_preferences").update({ recent_searches: [] }).eq("owner_id", user.id);
  return NextResponse.json({ recent: [] });
}
