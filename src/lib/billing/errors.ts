/**
 * Réponse des routes quand une action est bloquée par l'offre (§ 11) : la raison exacte,
 * traduite, et la bonne suite (offres ou recharge seulement si elle résout la limite).
 */
import "server-only";
import { NextResponse } from "next/server";
import type { Dict } from "@/lib/i18n";

export type BillingBlock = "credits" | "weekly" | "plan_reports" | "plan_sources";
export interface BlockDetail {
  needed?: number;
  available?: number;
  nextAt?: string | null;
  limit?: number;
}

export const BILLING_STATUS: Record<BillingBlock, number> = { credits: 402, weekly: 429, plan_reports: 403, plan_sources: 403 };

export function billingMessage(t: Dict, code: BillingBlock, d: BlockDetail, lang: "fr" | "en"): string {
  const b = t.billing.blocks;
  const date = d.nextAt
    ? new Date(d.nextAt).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Abidjan" })
    : null;
  switch (code) {
    case "credits":
      return b.credits(d.needed ?? 0, d.available ?? 0);
    case "weekly":
      return b.weekly(d.limit ?? 2, date);
    case "plan_reports":
      return b.planReports(d.limit ?? 0);
    case "plan_sources":
      return b.planSources(d.limit ?? 1);
  }
}

export function billingResponse(t: Dict, lang: "fr" | "en", code: BillingBlock, detail: BlockDetail) {
  return NextResponse.json(
    {
      error: code,
      message: billingMessage(t, code, detail, lang),
      billing: { code, ...detail, offers: "/offres", topup: code === "credits" ? "/offres#recharges" : null },
    },
    { status: BILLING_STATUS[code] },
  );
}

export function isBillingBlock(code: string): code is BillingBlock {
  return code in BILLING_STATUS;
}
