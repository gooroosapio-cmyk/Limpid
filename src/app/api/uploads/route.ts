import { after, NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { createUpload, purgeDueOriginals, UploadError, UploadRequest } from "@/lib/sources/uploads";
import { isAdminConfigured } from "@/lib/supabase/admin";

/** Prépare l'envoi direct d'un fichier vers le stockage privé (URL signée à usage unique). */
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (isDemoMode() || !isAdminConfigured()) {
    return NextResponse.json({ error: "non_configure", message: "La génération n'est pas configurée sur ce serveur." }, { status: 503 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });

  const parsed = UploadRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "requete_invalide" }, { status: 400 });

  try {
    const { uploadId, signedUrl } = await createUpload(user.id, parsed.data);
    // Entretien opportuniste : les envois abandonnés n'attendent pas le cron quotidien.
    after(() => purgeDueOriginals(20).catch(() => undefined));
    return NextResponse.json({ uploadId, signedUrl }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof UploadError) {
      const status = e.code === "storage" ? 500 : e.code === "rate" ? 429 : 422;
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    console.error("create upload", (e as Error).name);
    return NextResponse.json({ error: "interne" }, { status: 500 });
  }
}
