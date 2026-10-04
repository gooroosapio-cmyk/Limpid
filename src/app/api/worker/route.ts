import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { drainQueue } from "@/lib/jobs/worker";
import { purgeExpiredReports } from "@/lib/reports/retention";
import { purgeDueOriginals, purgeUnusedSources } from "@/lib/sources/uploads";
import { isAdminConfigured } from "@/lib/supabase/admin";

export const maxDuration = 300;

/** Filet de sécurité (cron Vercel) : purge les originaux et les rapports échus, reprend les tâches restées en file. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok =
    !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "interdit" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json({ error: "non_configure" }, { status: 503 });
  // Purge des originaux arrivés à échéance et des envois abandonnés (cadrage Q18).
  const purged = await purgeDueOriginals().catch(() => -1);
  const unused = await purgeUnusedSources().catch(() => -1);
  // Rapports arrivés au terme de leur conservation (30 jours après création).
  const expired = await purgeExpiredReports().catch(() => -1);
  const processed = await drainQueue("cron", Date.now() + 270_000);
  return NextResponse.json({ processed, purged, unused, expired });
}
