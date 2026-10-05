/**
 * Traitements pour l'administration (V5, § 17) : état, phase, âge, nombre de documents,
 * pages natives / lues par OCR, durées, tentatives, erreur publique et coût estimé. Aucune
 * donnée privée : ni titre, ni texte, ni adresse ; des nombres et des codes.
 */
import "server-only";
import { adminClient } from "@/lib/supabase/admin";

export interface AdminJob {
  id: string;
  kind: string;
  status: string;
  stage: string | null;
  attempt: number;
  errorCode: string | null;
  cancelRequested: boolean;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  sources: number;
  nativePages: number;
  ocrPages: number;
  calls: number;
  costCents: number;
  aiMs: number;
}

const ACTIVE = ["queued", "running", "awaiting_confirmation", "uncertain"];
export const RETRYABLE = ["failed", "uncertain"];
export const CANCELLABLE = ACTIVE;

interface Coverage {
  ocr_pages?: unknown;
  ocr_all?: unknown;
  pending_ocr?: unknown;
}

/** Pages natives et pages lues par OCR d'une source, d'après sa couverture enregistrée. */
export function pageSplit(pageCount: number | null, kind: string, coverage: Coverage | null): { native: number; ocr: number } {
  const total = pageCount ?? (kind === "pdf" ? 0 : 1);
  if (coverage?.ocr_all === true || coverage?.pending_ocr === true || ["png", "jpeg", "webp"].includes(kind)) return { native: 0, ocr: total };
  const ocr = Array.isArray(coverage?.ocr_pages) ? coverage.ocr_pages.length : 0;
  return { native: Math.max(0, total - ocr), ocr };
}

export async function adminJobs(limit = 30): Promise<AdminJob[]> {
  const db = adminClient();
  const { data: jobs } = await db
    .from("jobs")
    .select("id, kind, status, stage, stage_attempt, error_code, cancel_requested, created_at, started_at, finished_at, updated_at, report_id, source_id, params")
    .order("created_at", { ascending: false })
    .limit(limit);
  const list = jobs ?? [];
  if (!list.length) return [];
  const reportIds = [...new Set(list.map((j) => j.report_id).filter((x): x is string => !!x))];
  const [links, ledger] = await Promise.all([
    reportIds.length ? db.from("report_sources").select("report_id, source_id").in("report_id", reportIds) : Promise.resolve({ data: [] }),
    db.from("usage_ledger").select("job_id, actual_cents, reserved_cents, duration_ms").in("job_id", list.map((j) => j.id)),
  ]);
  const byReport = new Map<string, string[]>();
  for (const l of links.data ?? []) byReport.set(l.report_id, [...(byReport.get(l.report_id) ?? []), l.source_id]);
  const sourceIdsOf = (j: (typeof list)[number]) => {
    const p = (j.params ?? {}) as { source_ids?: unknown };
    if (Array.isArray(p.source_ids) && p.source_ids.length) return p.source_ids.map(String);
    const linked = j.report_id ? byReport.get(j.report_id) : undefined;
    if (linked?.length) return linked;
    return j.source_id ? [j.source_id] : [];
  };
  const allSources = [...new Set(list.flatMap(sourceIdsOf))];
  const { data: sources } = allSources.length
    ? await db.from("sources").select("id, kind, page_count, coverage").in("id", allSources)
    : { data: [] };
  const split = new Map((sources ?? []).map((s) => [s.id, pageSplit(s.page_count, s.kind, s.coverage as Coverage | null)]));
  const cost = new Map<string, { calls: number; cents: number; ms: number }>();
  for (const r of ledger.data ?? []) {
    if (!r.job_id) continue;
    const c = cost.get(r.job_id) ?? { calls: 0, cents: 0, ms: 0 };
    c.calls += 1;
    c.cents += r.actual_cents ?? r.reserved_cents ?? 0;
    c.ms += r.duration_ms ?? 0;
    cost.set(r.job_id, c);
  }
  return list.map((j) => {
    const ids = sourceIdsOf(j);
    const pages = ids.reduce((acc, id) => {
      const s = split.get(id);
      return s ? { native: acc.native + s.native, ocr: acc.ocr + s.ocr } : acc;
    }, { native: 0, ocr: 0 });
    const c = cost.get(j.id) ?? { calls: 0, cents: 0, ms: 0 };
    return {
      id: j.id,
      kind: j.kind,
      status: j.status,
      stage: j.stage,
      attempt: j.stage_attempt ?? 0,
      errorCode: j.error_code,
      cancelRequested: !!j.cancel_requested,
      createdAt: j.created_at,
      startedAt: j.started_at,
      finishedAt: j.finished_at,
      updatedAt: j.updated_at,
      sources: ids.length,
      nativePages: pages.native,
      ocrPages: pages.ocr,
      calls: c.calls,
      costCents: c.cents,
      aiMs: c.ms,
    };
  });
}

/** Reprise ciblée : une tâche en échec repart de son dernier point de reprise. */
export async function requeueJob(jobId: string): Promise<boolean> {
  const db = adminClient();
  const { data } = await db
    .from("jobs")
    .update({ status: "queued", error_code: null, stage_attempt: 0, cancel_requested: false, finished_at: null, lease_owner: null, lease_expires_at: null })
    .eq("id", jobId)
    .in("status", RETRYABLE)
    .select("id")
    .maybeSingle();
  return !!data;
}

/** Annulation ciblée : immédiate hors exécution, sinon demandée au worker (point de contrôle suivant). */
export async function cancelJob(jobId: string): Promise<"cancelled" | "requested" | "none"> {
  const db = adminClient();
  const { data: now } = await db
    .from("jobs")
    .update({ status: "cancelled", cancel_requested: true, finished_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("status", ["queued", "awaiting_confirmation", "uncertain"])
    .select("id")
    .maybeSingle();
  if (now) return "cancelled";
  const { data: later } = await db.from("jobs").update({ cancel_requested: true }).eq("id", jobId).eq("status", "running").select("id").maybeSingle();
  return later ? "requested" : "none";
}
