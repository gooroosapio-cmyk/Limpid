/**
 * Appels IA ponctuels du lecteur (QCM, questions au document) : contrôle du budget, débit
 * par heure, journal de consommation et messages d'erreur lisibles. Partagé par les routes.
 */
import "server-only";
import { estimateCents, PRICE_BASIS } from "@/lib/budget";
import { ProviderError, type UsageReport } from "@/lib/engine/provider";
import { assertBudget, BudgetError } from "@/lib/jobs/budget-guard";
import { adminClient } from "@/lib/supabase/admin";

export class ReaderAIError extends Error {
  constructor(
    public readonly code: "not_found" | "not_ready" | "rate" | "budget" | "provider" | "invalid",
    message: string,
  ) {
    super(message);
  }
}

export const READER_AI_STATUS: Record<ReaderAIError["code"], number> = {
  not_found: 404,
  not_ready: 409,
  rate: 429,
  budget: 402,
  provider: 502,
  invalid: 422,
};

const BUDGET_MESSAGES: Record<string, string> = {
  generation_disabled: "La génération est suspendue par l'administrateur.",
  budget_monthly: "Le plafond mensuel de dépense IA est atteint.",
  budget_daily: "Le plafond quotidien de ce compte est atteint. Réessayez demain.",
  budget_unreadable: "Le budget n'a pas pu être vérifié. Réessayez.",
};

/** Débit par heure et budget, vérifiés avant tout appel. */
export async function guardReaderCall(userId: string, stage: string, perHour: number, reserveCents: number) {
  const { count } = await adminClient()
    .from("usage_ledger")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .eq("stage", stage)
    .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= perHour) throw new ReaderAIError("rate", "Beaucoup de demandes en peu de temps : réessayez dans une heure.");
  try {
    await assertBudget(userId, reserveCents);
  } catch (e) {
    if (e instanceof BudgetError) throw new ReaderAIError("budget", BUDGET_MESSAGES[e.code] ?? "Budget indisponible.");
    throw e;
  }
}

export async function recordReaderUsage(userId: string, stage: string, u: UsageReport) {
  const cents = estimateCents(u.inputTokens, u.outputTokens);
  await adminClient().from("usage_ledger").insert({
    owner_id: userId,
    job_id: null,
    stage,
    attempt: 0,
    provider: u.provider,
    model: u.model,
    status: u.inputTokens === null ? "uncertain" : "settled",
    reserved_cents: cents,
    actual_cents: u.inputTokens === null ? null : cents,
    input_tokens: u.inputTokens,
    output_tokens: u.outputTokens,
    duration_ms: u.durationMs,
    provider_request_id: u.requestId,
    price_basis: PRICE_BASIS,
  });
}

/** Erreur du fournisseur → message pour le lecteur (consommation journalisée si connue). */
export async function providerFailure(userId: string, stage: string, e: unknown, fallback: string): Promise<never> {
  if (e instanceof ProviderError && e.usage) await recordReaderUsage(userId, stage, e.usage);
  const msg =
    e instanceof ProviderError && e.code === "quota_exhausted"
      ? "Le quota quotidien gratuit de Gemini est atteint. Réessayez demain."
      : e instanceof ProviderError && e.code === "rate_limited"
        ? "Le fournisseur IA limite les demandes. Réessayez dans une minute."
        : fallback;
  throw new ReaderAIError("provider", msg);
}
