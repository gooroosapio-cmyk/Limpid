import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { READER_AI_STATUS, ReaderAIError } from "@/lib/reports/ai-call";
import { GradeRequest, gradeShortAnswer } from "@/lib/reports/reading";
import { isAdminConfigured } from "@/lib/supabase/admin";

export const maxDuration = 75;

/** Correction indicative d'une réponse libre (modèle léger, grille de la question). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (isDemoMode() || !isAdminConfigured()) return NextResponse.json({ error: "non_configure", message: "L'IA n'est pas configurée sur ce serveur." }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { id } = await ctx.params;
  const parsed = GradeRequest.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "requete_invalide", message: "Réponse vide ou trop longue." }, { status: 400 });
  try {
    return NextResponse.json(await gradeShortAnswer(user.id, id, parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ReaderAIError) return NextResponse.json({ error: e.code, message: e.message }, { status: READER_AI_STATUS[e.code] });
    return NextResponse.json({ error: "interne", message: "Une erreur est survenue. Réessayez." }, { status: 500 });
  }
}
