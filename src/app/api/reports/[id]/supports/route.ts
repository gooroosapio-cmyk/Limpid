import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { billingResponse } from "@/lib/billing/errors";
import { getLang, getT } from "@/lib/i18n/server";
import { drainQueue } from "@/lib/jobs/worker";
import { requestSupport, SupportRequestError } from "@/lib/supports/request";
import { DerivedSupport } from "@/lib/supports/supports";

export const maxDuration = 300;

const Body = z.strictObject({ support: DerivedSupport, idempotency_key: z.string().uuid() });

/** Ajoute (ou reprend après un échec) la carte mentale ou les flashcards d'un Limpid prêt. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { id } = await ctx.params;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "requete" }, { status: 400 });
  try {
    await requestSupport(user.id, id, body.data.support, body.data.idempotency_key);
  } catch (e) {
    if (e instanceof SupportRequestError) {
      if (e.code === "credits" || e.code === "quota") return billingResponse(await getT(), await getLang(), e.code, e.detail);
      const status = { not_found: 404, not_ready: 409, busy: 409, ready: 409, storage: 500 }[e.code];
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    throw e;
  }
  const started = Date.now();
  after(() => drainQueue(`support-${crypto.randomUUID().slice(0, 8)}`, started + 270_000));
  return NextResponse.json({ status: "queued" }, { status: 202 });
}
