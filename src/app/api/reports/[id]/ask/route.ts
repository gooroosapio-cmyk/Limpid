import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { READER_AI_STATUS, ReaderAIError } from "@/lib/reports/ai-call";
import { askDocument, AskRequest } from "@/lib/reports/ask";
import { isAdminConfigured } from "@/lib/supabase/admin";

export const maxDuration = 75;

/** Poser une question au document : réponse fondée sur ses passages, non enregistrée. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (isDemoMode() || !isAdminConfigured()) {
    return NextResponse.json({ error: "non_configure", message: "L'IA n'est pas configurée sur ce serveur." }, { status: 503 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const parsed = AskRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "requete_invalide", message: "Question vide ou trop longue." }, { status: 400 });

  const { id } = await ctx.params;
  try {
    const result = await askDocument(user.id, id, parsed.data);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ReaderAIError) return NextResponse.json({ error: e.code, message: e.message }, { status: READER_AI_STATUS[e.code] });
    console.error("ask", (e as Error).name);
    return NextResponse.json({ error: "interne", message: "Une erreur est survenue. Réessayez." }, { status: 500 });
  }
}
