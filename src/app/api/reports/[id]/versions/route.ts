import { after, NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { drainQueue } from "@/lib/jobs/worker";
import { requestVersion, VersionError, VersionRequest } from "@/lib/reports/versions";
import { isAdminConfigured } from "@/lib/supabase/admin";

export const maxDuration = 300;

/** Demande une nouvelle version du rapport ; la génération démarre après la réponse. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (isDemoMode() || !isAdminConfigured()) {
    return NextResponse.json({ error: "non_configure", message: "La génération n'est pas configurée sur ce serveur." }, { status: 503 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const parsed = VersionRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "requete_invalide" }, { status: 400 });

  const { id } = await ctx.params;
  try {
    await requestVersion(user.id, id, parsed.data);
    const started = Date.now();
    after(() => drainQueue(`ver-${crypto.randomUUID().slice(0, 8)}`, started + 270_000));
    return NextResponse.json({ status: "queued" }, { status: 202 });
  } catch (e) {
    if (e instanceof VersionError) {
      const status = { not_found: 404, busy: 409, limit: 409, storage: 500 }[e.code];
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    console.error("request version", (e as Error).name);
    return NextResponse.json({ error: "interne" }, { status: 500 });
  }
}
