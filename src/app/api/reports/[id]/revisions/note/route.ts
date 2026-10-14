import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { rateCard, RateRequest, ReviewError } from "@/lib/supports/reviews";

/** Autoévaluation d'une flashcard (À revoir, Difficile, Acquis) : aucun appel IA, aucun crédit. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { id } = await ctx.params;
  const body = RateRequest.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "requete" }, { status: 400 });
  try {
    const state = await rateCard(user.id, id, body.data);
    return NextResponse.json({ state }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ReviewError) return NextResponse.json({ error: e.code }, { status: e.code === "storage" ? 500 : 404 });
    throw e;
  }
}
