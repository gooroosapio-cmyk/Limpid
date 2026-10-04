import { after, NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { PrepareError, PrepareRequest, prepareSource } from "@/lib/sources/prepare";
import { purgeUnusedSources } from "@/lib/sources/uploads";
import { isAdminConfigured } from "@/lib/supabase/admin";

export const maxDuration = 60;

/** Prépare une source (lecture sans IA) ; le lecteur la vérifie avant de lancer le rapport. */
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (isDemoMode() || !isAdminConfigured()) {
    return NextResponse.json({ error: "non_configure", message: "La génération n'est pas configurée sur ce serveur." }, { status: 503 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const parsed = PrepareRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "requete_invalide" }, { status: 400 });

  try {
    const { sourceId, pendingOcr } = await prepareSource(user.id, parsed.data);
    after(() => purgeUnusedSources(20).catch(() => undefined));
    return NextResponse.json({ sourceId, pendingOcr }, { status: 201 });
  } catch (e) {
    if (e instanceof PrepareError) {
      const status = { extraction: 422, url: 422, upload_missing: 410, url_disabled: 403, ocr_consent: 409, rate: 429, storage: 500 }[e.code];
      return NextResponse.json({ error: e.code, message: e.message, pages: e.pages }, { status });
    }
    console.error("prepare source", (e as Error).name);
    return NextResponse.json({ error: "interne" }, { status: 500 });
  }
}
