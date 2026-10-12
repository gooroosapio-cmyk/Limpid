import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { chatMessage } from "@/lib/chat/service";

/** État enregistré d'une réponse : reprise du suivi après une coupure réseau. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; messageId: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const { messageId } = await ctx.params;
  if (!z.string().uuid().safeParse(messageId).success) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const message = await chatMessage(user.id, messageId);
  if (!message) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  return NextResponse.json({ message }, { headers: { "Cache-Control": "no-store" } });
}
