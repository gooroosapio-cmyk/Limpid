import { after, NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { drainQueue } from "@/lib/jobs/worker";
import { CreateError, CreateRequest, createReport } from "@/lib/reports/create";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

// La génération s'exécute après la réponse, dans la même fonction (durée Vercel max.).
export const maxDuration = 300;

/** Liste courte des rapports du lecteur (menu latéral), via la RLS. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const supabase = await createUserClient();
  const { data } = await supabase
    .from("reports")
    .select("id, title, current_version_id, jobs(status, created_at)")
    .eq("is_demo", false)
    .order("created_at", { ascending: false })
    .limit(60);
  const reports = (data ?? []).map((r) => {
    const job = [...((r.jobs as { status: string; created_at: string }[] | null) ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const running = !!job && (job.status === "queued" || job.status === "running");
    const state = r.current_version_id ? (running ? "updating" : "ready") : running ? "preparing" : "failed";
    return { id: r.id, title: r.title, state };
  });
  return NextResponse.json({ reports }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (isDemoMode() || !isAdminConfigured()) {
    return NextResponse.json({ error: "non_configure", message: "La génération n'est pas configurée sur ce serveur." }, { status: 503 });
  }
  // Même origine uniquement (en plus des cookies SameSite).
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });

  const parsed = CreateRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "requete_invalide" }, { status: 400 });

  try {
    const { reportId } = await createReport(user.id, parsed.data);
    const started = Date.now();
    after(() => drainQueue(`web-${crypto.randomUUID().slice(0, 8)}`, started + 270_000));
    return NextResponse.json({ reportId }, { status: 201 });
  } catch (e) {
    if (e instanceof CreateError) {
      const status = {
        extraction: 422,
        url: 422,
        upload_missing: 410,
        url_disabled: 403,
        ocr_consent: 409,
        limit: 429,
        rate: 429,
        source_missing: 410,
        source_used: 409,
        generation_disabled: 503,
        storage: 500,
      }[e.code];
      return NextResponse.json({ error: e.code, message: e.message, pages: e.pages, reportId: e.reportId }, { status });
    }
    console.error("create report", (e as Error).name);
    return NextResponse.json({ error: "interne" }, { status: 500 });
  }
}
