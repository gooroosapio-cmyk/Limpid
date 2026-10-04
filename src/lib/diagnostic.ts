/**
 * Diagnostic de l'environnement (cahier V2, lot B) : vérifie côté serveur ce qu'il faut
 * pour qu'une génération réelle aboutisse — configuration, base, stockage privé, et, sur
 * demande, un appel Gemini minimal (une requête du quota). Aucun secret n'est renvoyé.
 */
import "server-only";
import { z } from "zod";
import { activeProvider, isUrlImportEnabled } from "@/lib/config";
import { getProvider } from "@/lib/engine";
import { ProviderError } from "@/lib/engine/provider";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";

export interface DiagnosticCheck {
  name: string;
  ok: boolean;
  detail: string;
}

const present = (name: string) => !!process.env[name] && process.env[name] !== "";

export async function runDiagnostic(opts: { gemini: boolean }): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  add("Fournisseur IA", activeProvider() === "gemini", activeProvider() === "gemini" ? "Gemini (clé présente)" : "Mode démonstration : GEMINI_API_KEY absente");
  add(
    "Modèles Gemini",
    present("LIMPID_MODEL_FAST") && present("LIMPID_MODEL_QUALITY"),
    `rapide : ${process.env.LIMPID_MODEL_FAST || "absent"} · qualité : ${process.env.LIMPID_MODEL_QUALITY || "absent"} · repli : ${process.env.LIMPID_MODEL_FALLBACKS?.trim() || "aucun"}`,
  );
  add("Clé serveur Supabase", isAdminConfigured(), isAdminConfigured() ? "présente" : "SUPABASE_SERVICE_ROLE_KEY absente");
  add("Secret du cron", present("CRON_SECRET"), present("CRON_SECRET") ? "présent" : "CRON_SECRET absent : la reprise quotidienne est refusée");
  add("Adresse du site", present("LIMPID_SITE_URL"), process.env.LIMPID_SITE_URL || "absente : déduite de la requête");
  add("Import par lien", true, isUrlImportEnabled() ? "activé" : "désactivé");

  if (isAdminConfigured()) {
    const db = adminClient();
    const t0 = Date.now();
    const settings = await db.from("app_settings").select("generation_enabled").single();
    add(
      "Base de données",
      !settings.error,
      settings.error ? "lecture impossible" : `lecture OK en ${Date.now() - t0} ms · génération ${settings.data.generation_enabled ? "active" : "suspendue"}`,
    );

    // Aller-retour complet dans le bucket privé, puis effacement.
    const path = `diagnostic/${crypto.randomUUID()}.txt`;
    const t1 = Date.now();
    const up = await db.storage.from("sources").upload(path, new Blob(["limpid"], { type: "text/plain" }), { upsert: false });
    const down = up.error ? null : await db.storage.from("sources").download(path);
    const body = down?.data ? await down.data.text() : null;
    const rm = await db.storage.from("sources").remove([path]);
    add(
      "Stockage privé",
      !up.error && body === "limpid" && !rm.error,
      up.error ? "envoi impossible" : body !== "limpid" ? "relecture impossible" : rm.error ? "effacement impossible" : `envoi, relecture et effacement OK en ${Date.now() - t1} ms`,
    );
    const signed = await db.storage.from("sources").createSignedUploadUrl(`diagnostic/${crypto.randomUUID()}`);
    add("URL d'envoi signée", !signed.error, signed.error ? "création impossible" : "création OK");
  }

  if (opts.gemini && activeProvider() === "gemini") {
    const t2 = Date.now();
    try {
      const res = await getProvider().generateStructured({
        stage: "diagnostic",
        schema: z.strictObject({ ok: z.boolean() }),
        trustedInstructions: "Réponds avec {\"ok\": true}.",
        untrustedData: [],
        budget: { tier: "fast", maxInputTokens: 100, maxOutputTokens: 50, timeoutMs: 30_000 },
        signal: AbortSignal.timeout(35_000),
      });
      add("Appel Gemini", res.value.ok, `${res.usage.model} · ${Date.now() - t2} ms · sortie structurée valide`);
    } catch (e) {
      const code = e instanceof ProviderError ? e.code : "erreur";
      add("Appel Gemini", false, `${code}${e instanceof ProviderError ? ` : ${e.message}` : ""}`);
    }
  }
  return checks;
}

/** Percentile (méthode du rang le plus proche) d'une liste de valeurs. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
}

/** Durées et coûts observés sur 30 jours : par étape (appels) et par rapport (tâches). */
export async function performance() {
  const db = adminClient();
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const [{ data: calls }, { data: jobs }] = await Promise.all([
    db.from("usage_ledger").select("stage, duration_ms, actual_cents, reserved_cents").gte("created_at", since).limit(5_000),
    db.from("jobs").select("kind, status, started_at, finished_at").gte("created_at", since).limit(2_000),
  ]);
  const byStage = new Map<string, { ms: number[]; cents: number }>();
  for (const c of calls ?? []) {
    const s = byStage.get(c.stage) ?? { ms: [], cents: 0 };
    if (c.duration_ms !== null) s.ms.push(c.duration_ms);
    s.cents += c.actual_cents ?? c.reserved_cents ?? 0;
    byStage.set(c.stage, s);
  }
  const done = (jobs ?? []).filter((j) => j.kind === "generate_report" && j.started_at && j.finished_at);
  const durations = done.map((j) => new Date(j.finished_at!).getTime() - new Date(j.started_at!).getTime());
  const finished = (jobs ?? []).filter((j) => j.kind === "generate_report" && ["succeeded", "incomplete_check", "failed"].includes(j.status));
  return {
    stages: [...byStage.entries()].map(([stage, s]) => ({
      stage,
      calls: s.ms.length,
      p50: percentile(s.ms, 50),
      p95: percentile(s.ms, 95),
      avgCents: s.ms.length ? s.cents / s.ms.length : 0,
    })),
    reports: {
      count: done.length,
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      successRate: finished.length ? finished.filter((j) => j.status !== "failed").length / finished.length : null,
    },
  };
}
