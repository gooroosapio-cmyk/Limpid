/**
 * Administration (cadrage Q8) : rôle vérifié côté serveur à chaque requête, via la base
 * (jamais via le navigateur). Une page d'administration est introuvable pour les autres
 * comptes. Aucun contenu de document n'est exposé : seulement des compteurs et des codes.
 */
import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { adminMfaRequired, mfaStep } from "@/lib/auth/mfa";
import { budget } from "@/lib/config";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

export async function isAdmin(userId: string): Promise<boolean> {
  if (!isAdminConfigured()) return false;
  const { data } = await adminClient().from("profiles").select("role").eq("id", userId).maybeSingle();
  return data?.role === "admin";
}

/** Rôle admin seulement (sans exiger le second facteur) : écran de double authentification. */
export async function requireAdminRole() {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) notFound();
  return user;
}

/** Étape de double authentification de la session courante. */
export async function adminMfaStep() {
  const required = adminMfaRequired();
  if (!required) return "ok" as const;
  const { data } = await (await createUserClient()).auth.mfa.getAuthenticatorAssuranceLevel();
  return mfaStep(data, required);
}

/** Rôle admin vérifié en base, puis session aal2 (code TOTP) exigée. */
export async function requireAdmin() {
  const user = await requireAdminRole();
  if ((await adminMfaStep()) !== "ok") redirect("/admin/securite");
  return user;
}

/** Quota gratuit Gemini : requêtes par jour et par modèle (constaté : 20). */
export const FREE_TIER_DAILY_REQUESTS = (() => {
  const n = Number(process.env.LIMPID_FREE_TIER_RPD);
  return Number.isInteger(n) && n > 0 ? n : 20;
})();

/** Minuit, heure du Pacifique (remise à zéro des quotas Gemini), en UTC. */
export function pacificMidnight(now = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const wall = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  const offset = wall - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(parts.year!, parts.month! - 1, parts.day!) - offset);
}

const sum = (rows: { actual_cents: number | null; reserved_cents: number | null }[]) =>
  rows.reduce((n, r) => n + (r.actual_cents ?? r.reserved_cents ?? 0), 0);

export async function adminOverview() {
  const db = adminClient();
  const now = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const day = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const quotaStart = pacificMidnight(now);

  const [settings, monthRows, dayRows, quotaRows, emails, jobs, audit, reports] = await Promise.all([
    db.from("app_settings").select("generation_enabled, monthly_cap_cents, updated_at").single(),
    db.from("usage_ledger").select("stage, actual_cents, reserved_cents").gte("created_at", month),
    db.from("usage_ledger").select("actual_cents, reserved_cents").gte("created_at", day),
    db.from("usage_ledger").select("model").gte("created_at", quotaStart.toISOString()),
    db.from("allowed_emails").select("email, role, created_at").order("created_at"),
    db.from("jobs").select("id, kind, status, stage, error_code, created_at").order("created_at", { ascending: false }).limit(15),
    db.from("audit_log").select("action, target_kind, created_at").order("created_at", { ascending: false }).limit(15),
    db.from("reports").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);

  const byStage = new Map<string, number>();
  for (const r of monthRows.data ?? []) byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + (r.actual_cents ?? r.reserved_cents ?? 0));
  const byModel = new Map<string, number>();
  for (const r of quotaRows.data ?? []) byModel.set(r.model, (byModel.get(r.model) ?? 0) + 1);

  return {
    generationEnabled: settings.data?.generation_enabled ?? false,
    monthlyCapCents: Math.min(settings.data?.monthly_cap_cents ?? budget.monthlyCapCents, budget.monthlyCapCents),
    envCapCents: budget.monthlyCapCents,
    dailyAccountCapCents: budget.perAccountDailyCapCents,
    spentMonthCents: sum(monthRows.data ?? []),
    spent24hCents: sum(dayRows.data ?? []),
    byStage: [...byStage.entries()].sort((a, b) => b[1] - a[1]),
    quota: {
      since: quotaStart,
      limit: FREE_TIER_DAILY_REQUESTS,
      models: [...byModel.entries()].sort((a, b) => b[1] - a[1]),
      configured: [process.env.LIMPID_MODEL_FAST, process.env.LIMPID_MODEL_QUALITY, ...(process.env.LIMPID_MODEL_FALLBACKS ?? "").split(",").map((m) => m.trim())].filter((m): m is string => !!m),
    },
    emails: emails.data ?? [],
    jobs: jobs.data ?? [],
    audit: audit.data ?? [],
    reportCount: reports.count ?? 0,
  };
}

export type AdminOverview = Awaited<ReturnType<typeof adminOverview>>;
