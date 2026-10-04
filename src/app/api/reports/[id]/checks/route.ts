import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { AnswerError, AnswerRequest, gradeAnswer } from "@/lib/reports/checks";
import { isAdminConfigured } from "@/lib/supabase/admin";

export const maxDuration = 90;

/** Corrige la réponse du lecteur à une question de compréhension du rapport. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (isDemoMode() || !isAdminConfigured()) {
    return NextResponse.json({ error: "non_configure", message: "La correction n'est pas configurée sur ce serveur." }, { status: 503 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const parsed = AnswerRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "requete_invalide", message: "Réponse vide ou trop longue." }, { status: 400 });

  const { id } = await ctx.params;
  try {
    const feedback = await gradeAnswer(user.id, id, parsed.data);
    return NextResponse.json(feedback, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AnswerError) {
      const status = { not_found: 404, not_ready: 409, rate: 429, budget: 402, provider: 502 }[e.code];
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    console.error("grade answer", (e as Error).name);
    return NextResponse.json({ error: "interne", message: "La correction a échoué." }, { status: 500 });
  }
}
