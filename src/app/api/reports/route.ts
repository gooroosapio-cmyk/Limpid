import { after, NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { drainQueue } from "@/lib/jobs/worker";
import { CreateError, CreateFromText, createReportFromText } from "@/lib/reports/create";
import { isAdminConfigured } from "@/lib/supabase/admin";

// La génération s'exécute après la réponse, dans la même fonction (durée Vercel max.).
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (isDemoMode() || !isAdminConfigured()) {
    return NextResponse.json({ error: "non_configure", message: "La génération n'est pas configurée sur ce serveur." }, { status: 503 });
  }
  // Même origine uniquement (en plus des cookies SameSite).
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });

  const parsed = CreateFromText.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "requete_invalide" }, { status: 400 });

  try {
    const { reportId } = await createReportFromText(user.id, parsed.data);
    const started = Date.now();
    after(() => drainQueue(`web-${crypto.randomUUID().slice(0, 8)}`, started + 270_000));
    return NextResponse.json({ reportId }, { status: 201 });
  } catch (e) {
    if (e instanceof CreateError) {
      const status = e.code === "extraction" ? 422 : e.code === "generation_disabled" ? 503 : 500;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    console.error("create report", (e as Error).name);
    return NextResponse.json({ error: "interne" }, { status: 500 });
  }
}
