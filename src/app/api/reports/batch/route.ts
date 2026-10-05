import { after, NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";
import { drainQueue } from "@/lib/jobs/worker";
import { BatchRequest, createBatch, CreateError } from "@/lib/reports/create";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { billingResponse, isBillingBlock } from "@/lib/billing/errors";
import { getLang, getT } from "@/lib/i18n/server";

export const maxDuration = 300;

/** « Un Limpid par document » : une génération indépendante par document, en file. */
export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  if (isDemoMode() || !isAdminConfigured()) {
    return NextResponse.json({ error: "non_configure", message: "La génération n'est pas configurée sur ce serveur." }, { status: 503 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const parsed = BatchRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "requete_invalide" }, { status: 400 });
  try {
    const { reportIds } = await createBatch(user.id, parsed.data);
    const started = Date.now();
    after(() => drainQueue(`batch-${crypto.randomUUID().slice(0, 8)}`, started + 270_000));
    return NextResponse.json({ reportIds }, { status: 201 });
  } catch (e) {
    if (e instanceof CreateError) {
      if (isBillingBlock(e.code)) return billingResponse(await getT(), await getLang(), e.code, e.detail);
      const status = { limit: 429, rate: 429, source_missing: 410, source_used: 409, generation_disabled: 503, storage: 500 }[e.code as string] ?? 422;
      return NextResponse.json({ error: e.code, message: e.message, reportId: e.reportId }, { status });
    }
    console.error("create batch", (e as Error).name);
    return NextResponse.json({ error: "interne" }, { status: 500 });
  }
}
