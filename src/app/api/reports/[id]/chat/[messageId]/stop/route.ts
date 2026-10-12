import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { stopChat } from "@/lib/chat/service";

/** « Arrêter » : annulation explicite ; le texte déjà écrit est conservé. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string; messageId: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { messageId } = await ctx.params;
  if (!z.string().uuid().safeParse(messageId).success) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  return NextResponse.json({ stopping: await stopChat(user.id, messageId) });
}
