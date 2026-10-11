import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { drainQueue } from "@/lib/jobs/worker";
import { purgeDueOriginals, purgeUnusedSources } from "@/lib/sources/uploads";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { reconcilePending } from "@/lib/billing/purchase";

export const maxDuration = 300;

/**
 * Filet de sécurité (cron Vercel) : efface les envois abandonnés ou jamais utilisés, reprend les
 * tâches restées en file. Aucun Limpid ni document utilisé n'est purgé (conservation V4).
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Relais (tâche remise en file par une exécution arrivée à sa limite) : accepté aussitôt, traité après. */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "interdit" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json({ error: "non_configure" }, { status: 503 });
  const started = Date.now();
  after(() => drainQueue(`relay-${crypto.randomUUID().slice(0, 8)}`, started + 270_000));
  return NextResponse.json({ accepted: true }, { status: 202 });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "interdit" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json({ error: "non_configure" }, { status: 503 });
  // Envois interrompus et sources jamais utilisées (24 h) : seuls contenus encore temporaires.
  const purged = await purgeDueOriginals().catch(() => -1);
  const unused = await purgeUnusedSources().catch(() => -1);
  // Commandes Chariow restées en attente (webhook perdu, onglet fermé) : relecture des ventes.
  const reconciled = await reconcilePending().catch(() => -1);
  const processed = await drainQueue("cron", Date.now() + 270_000);
  return NextResponse.json({ processed, purged, unused, reconciled });
}
