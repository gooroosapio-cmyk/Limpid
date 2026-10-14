import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { ReviewError, saveSession, SessionRequest } from "@/lib/supports/reviews";

/** Session de révision reprenable (file, position, carte révélée). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { id } = await ctx.params;
  const body = SessionRequest.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "requete" }, { status: 400 });
  try {
    return NextResponse.json(await saveSession(user.id, id, body.data), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ReviewError) return NextResponse.json({ error: e.code }, { status: e.code === "storage" ? 500 : 404 });
    throw e;
  }
}
