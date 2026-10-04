import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { drainQueue } from "@/lib/jobs/worker";
import { isAdminConfigured } from "@/lib/supabase/admin";

export const maxDuration = 300;

/** Filet de sécurité (cron Vercel) : reprend les tâches restées en file ou au bail expiré. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok =
    !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "interdit" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json({ error: "non_configure" }, { status: 503 });
  const processed = await drainQueue("cron", Date.now() + 270_000);
  return NextResponse.json({ processed });
}
