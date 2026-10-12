import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";

/**
 * Mesures navigateur (prompt « Fluidité », § 1) : lot de 20 au plus, compte connecté, même
 * origine. Seuls des noms connus et des durées sont acceptés ; jamais de contenu.
 */
const Metric = z.strictObject({
  name: z.string().regex(/^(vital\.(lcp|inp|cls|fcp|ttfb)|nav\.internal|ui\.[a-z_]{2,30}|chat\.[a-z_]{2,30}|upload\.[a-z_]{2,30})$/),
  value_ms: z.number().int().min(0).max(600_000),
  route: z.string().max(80).regex(/^\/[\w:/.-]*$/).nullable(),
  device: z.enum(["mobile", "tablet", "desktop"]),
  network: z.string().max(12).regex(/^[\w-]*$/).nullable(),
  trace_id: z.string().max(40).regex(/^[\w-]*$/).nullable().optional(),
  ok: z.boolean().optional(),
});
const Body = z.strictObject({ metrics: z.array(Metric).min(1).max(20) });

export async function POST(req: NextRequest) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new NextResponse(null, { status: 403 });
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  if (isAdminConfigured()) {
    const rows = parsed.data.metrics.map((m) => ({ ...m, trace_id: m.trace_id ?? null, ok: m.ok ?? true, source: "client" }));
    const { error } = await adminClient().from("perf_events").insert(rows);
    if (error) console.error("metrics", error.code);
  }
  return new NextResponse(null, { status: 204 });
}
