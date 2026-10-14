/**
 * Administration (cadrage Q8) : rôle vérifié côté serveur à chaque requête, via la base
 * (jamais via le navigateur). Une page d'administration est introuvable pour les autres
 * comptes. Aucun contenu de document n'est exposé : seulement des compteurs et des codes.
 */
import "server-only";
import { accountEnvelope } from "@/lib/billing/envelope";
import { imageSettingsFrom } from "@/lib/visuals/image-models";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { adminMfaRequired, mfaStep } from "@/lib/auth/mfa";
import { budget } from "@/lib/config";
import { registeredModels } from "@/lib/engine/openrouter";
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

/** Rôle admin vérifié en base ; code TOTP seulement si LIMPID_ADMIN_MFA=on. */
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

  const [readerV3, settings, monthRows, dayRows, quotaRows, emails, jobs, audit, reports] = await Promise.all([
    // Colonne absente tant que la migration du lecteur V3 n'est pas appliquée : null.
    db.from("app_settings").select("reader_v3_enabled").single().then((r) => (r.error ? null : (r.data as { reader_v3_enabled?: boolean }).reader_v3_enabled === true)),
    db.from("app_settings").select("generation_enabled, monthly_cap_cents, marketing_budget_xof, writer_model, account_cap_mode, welcome_cost_xof, updated_at, images_enabled, image_vector_provider, image_vector_model, image_realistic_provider, image_realistic_model, image_diagram_provider, image_diagram_model, image_illustration_provider, image_illustration_model").single(),
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
    readerV3,
    images: imageSettingsFrom(settings.data as Record<string, unknown> | null),
    // Recraft, Seedream et Nano Banana passent tous par OpenRouter : une seule clé.
    imageProviders: { nanobanana: !!process.env.OPENROUTER_API_KEY?.trim(), gptimage: !!process.env.OPENROUTER_API_KEY?.trim() },
    monthlyCapCents: Math.min(settings.data?.monthly_cap_cents ?? budget.monthlyCapCents, budget.monthlyCapCents),
    envCapCents: budget.monthlyCapCents,
    /** Budget marketing mensuel des bonus de bienvenue (FCFA) et coût interne d'un bonus. */
    marketingBudgetXof: (settings.data as { marketing_budget_xof?: number } | null)?.marketing_budget_xof ?? 50_000,
    welcomeCostXof: (settings.data as { welcome_cost_xof?: number } | null)?.welcome_cost_xof ?? 240,
    dailyAccountCapCents: budget.perAccountDailyCapCents,
    spentMonthCents: sum(monthRows.data ?? []),
    spent24hCents: sum(dayRows.data ?? []),
    byStage: [...byStage.entries()].sort((a, b) => b[1] - a[1]),
    quota: {
      since: quotaStart,
      limit: FREE_TIER_DAILY_REQUESTS,
      models: [...byModel.entries()].sort((a, b) => b[1] - a[1]),
      configured: registeredModels(),
    },
    emails: emails.data ?? [],
    jobs: jobs.data ?? [],
    audit: audit.data ?? [],
    reportCount: reports.count ?? 0,
    writer: (settings.data as { writer_model?: string } | null)?.writer_model === "standard" ? ("standard" as const) : ("pro" as const),
    writers: await writerComparison(),
    accountCapMode: (settings.data as { account_cap_mode?: string } | null)?.account_cap_mode === "enforce" ? ("enforce" as const) : ("observe" as const),
    accounts: await accountCosts(),
    calls: await recentCalls(),
  };
}

export interface AccountCostRow {
  email: string;
  revenueXof: number;
  creditsUsed: number;
  budgetXof: number;
  spentXof: number;
  exempt: boolean;
}

/** Comptes les plus coûteux du mois, face à leur enveloppe de 30 % (spécification, § 7). */
export async function accountCosts(limit = 20): Promise<AccountCostRow[]> {
  const db = adminClient();
  const now = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data } = await db.from("usage_ledger").select("owner_id, actual_cents, reserved_cents").gte("created_at", month).limit(20_000);
  const byOwner = new Map<string, number>();
  for (const r of data ?? []) if (r.owner_id) byOwner.set(r.owner_id as string, (byOwner.get(r.owner_id as string) ?? 0) + ((r.actual_cents as number | null) ?? (r.reserved_cents as number | null) ?? 0));
  const top = [...byOwner.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  return Promise.all(
    top.map(async (id) => {
      const [env, { data: user }] = await Promise.all([accountEnvelope(id, now), db.auth.admin.getUserById(id)]);
      return { email: user?.user?.email ?? id.slice(0, 8), revenueXof: env.revenueXof, creditsUsed: env.creditsUsed, budgetXof: env.budgetXof, spentXof: env.spentXof, exempt: env.exempt };
    }),
  );
}

/** Journal des derniers appels facturés (coût réel ou estimé, sans contenu). */
export async function recentCalls(limit = 30) {
  const { data } = await adminClient()
    .from("usage_ledger")
    .select("created_at, stage, model, input_tokens, output_tokens, actual_cents, reserved_cents, status")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as { created_at: string; stage: string; model: string | null; input_tokens: number | null; output_tokens: number | null; actual_cents: number | null; reserved_cents: number | null; status: string }[];
}

export interface WriterStats {
  writer: "standard" | "pro";
  courses: number;
  /** Cours livrés « à vérifier » (incomplets). */
  incomplete: number;
  avgCents: number;
  /** Coût moyen pour 10 pages de contenu (prix continu). */
  per10PagesCents: number | null;
  avgMinutes: number;
}

/**
 * Test comparatif de la rédaction (spécification, § 8.1) : cours livrés sur 30 jours, par
 * rédacteur figé à la création, avec leur coût réel (toutes étapes) et leur durée.
 */
export async function writerComparison(now = new Date()): Promise<WriterStats[]> {
  const db = adminClient();
  const since = new Date(now.getTime() - 30 * 24 * 3600_000).toISOString();
  const { data: jobs } = await db
    .from("jobs")
    .select("id, status, params, created_at, finished_at")
    .eq("kind", "generate_report")
    .in("status", ["succeeded", "incomplete_check"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (jobs ?? []) as { id: string; status: string; params: { writer?: string; credits?: { pages?: number } } | null; created_at: string; finished_at: string | null }[];
  if (!rows.length) return [];
  const { data: usage } = await db.from("usage_ledger").select("job_id, actual_cents, reserved_cents").in("job_id", rows.map((r) => r.id));
  const cost = new Map<string, number>();
  for (const u of usage ?? []) cost.set(u.job_id as string, (cost.get(u.job_id as string) ?? 0) + ((u.actual_cents as number | null) ?? (u.reserved_cents as number | null) ?? 0));
  return (["standard", "pro"] as const)
    .map((writer) => {
      const mine = rows.filter((r) => (r.params?.writer === "standard" ? "standard" : "pro") === writer);
      const cents = mine.map((r) => cost.get(r.id) ?? 0);
      const paged = mine.filter((r) => (r.params?.credits?.pages ?? 0) > 0);
      const pages = paged.reduce((n, r) => n + r.params!.credits!.pages!, 0);
      const minutes = mine.filter((r) => r.finished_at).map((r) => (Date.parse(r.finished_at!) - Date.parse(r.created_at)) / 60_000);
      return {
        writer,
        courses: mine.length,
        incomplete: mine.filter((r) => r.status === "incomplete_check").length,
        avgCents: mine.length ? cents.reduce((a, b) => a + b, 0) / mine.length : 0,
        per10PagesCents: pages ? (paged.reduce((n, r) => n + (cost.get(r.id) ?? 0), 0) / pages) * 10 : null,
        avgMinutes: minutes.length ? minutes.reduce((a, b) => a + b, 0) / minutes.length : 0,
      };
    })
    .filter((w) => w.courses > 0);
}

export type AdminOverview = Awaited<ReturnType<typeof adminOverview>>;
