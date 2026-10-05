import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { drainQueue } from "@/lib/jobs/worker";
import { RetryError, retryReport } from "@/lib/reports/retry";

export const maxDuration = 300;

const Body = z.strictObject({ idempotency_key: z.string().uuid() });

/** Relance la préparation d'un Limpid en échec (mêmes réglages, même document). */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "non_connecte" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "origine" }, { status: 403 });
  const { id } = await ctx.params;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !body.success) return NextResponse.json({ error: "requete" }, { status: 400 });
  try {
    await retryReport(user.id, id, body.data.idempotency_key);
  } catch (e) {
    if (e instanceof RetryError) {
      const status = { not_found: 404, not_failed: 409, limit: 429, disabled: 503, storage: 500 }[e.code];
      return NextResponse.json({ error: e.code, message: e.message }, { status });
    }
    throw e;
  }
  const started = Date.now();
  after(() => drainQueue(`retry-${crypto.randomUUID().slice(0, 8)}`, started + 270_000));
  return NextResponse.json({ status: "queued" }, { status: 202 });
}
