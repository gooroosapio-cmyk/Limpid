/**
 * Adaptateur OpenRouter (Atlas de conception) : une seule clé pour les modèles Gemini, routés
 * par Limpid selon le travail — Flash-Lite classe et prépare, Flash explique et vérifie, Pro
 * traite les passages difficiles. Sorties JSON structurées, validées côté serveur ; lecture
 * d'images et de PDF ; couverture et planches en image. Le coût réel renvoyé par OpenRouter
 * est journalisé. Les identifiants de modèles viennent de la configuration, jamais du code.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { siteUrl } from "@/lib/site";
import { toProviderSchema } from "./gemini";
import {
  ProviderError,
  UNTRUSTED_PREAMBLE,
  wrapUntrusted,
  type AIProvider,
  type ImageAspect,
  type ImageProvider,
  type ModelTier,
  type StructuredRequest,
  type StructuredResponse,
  type UsageReport,
} from "./provider";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MODEL_RE = /^[a-z0-9][a-z0-9._\-]*\/[a-z0-9][a-z0-9.:_\-]{1,100}$/;

export interface OpenRouterConfig {
  apiKey: string;
  models: Record<"lite" | "editor" | "complex", string>;
  /** Replis déclarés, essayés dans l'ordre si le modèle principal est indisponible. */
  fallbackModels: string[];
  /** Adresse publique du site (en-tête HTTP-Referer, recommandé par OpenRouter). */
  siteUrl: string;
}

function model(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const v = env[name]?.trim();
  return v && MODEL_RE.test(v) ? v : fallback;
}

/** Configuration lue dans l'environnement ; défauts = modèles de l'Atlas (vérifiés le 6 octobre 2026). */
export function openRouterConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OpenRouterConfig {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new ProviderError("not_configured", "OpenRouter n'est pas configuré (clé manquante).");
  return {
    apiKey,
    models: {
      lite: model(env, "LIMPID_MODEL_LITE", "google/gemini-3.1-flash-lite"),
      editor: model(env, "LIMPID_MODEL_EDITOR", "google/gemini-3.8-flash"),
      complex: model(env, "LIMPID_MODEL_COMPLEX", "google/gemini-3.1-pro-preview"),
    },
    fallbackModels: (env.LIMPID_MODEL_FALLBACKS ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter((m) => MODEL_RE.test(m))
      .slice(0, 3),
    siteUrl: siteUrl(env),
  };
}

/** Modèle d'un niveau : lite → Flash-Lite, fast/quality → Flash, complex → Pro. */
export function modelForTier(config: OpenRouterConfig, tier: ModelTier): string {
  if (tier === "lite") return config.models.lite;
  if (tier === "complex") return config.models.complex;
  return config.models.editor;
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

/** Données non fiables délimitées, puis fichiers joints annoncés par une étiquette. */
export function userContent(req: StructuredRequest<z.ZodType>, nonce: string): ContentPart[] {
  const parts: ContentPart[] = [];
  if (req.untrustedData.length) parts.push({ type: "text", text: wrapUntrusted(req.untrustedData, nonce) });
  for (const m of req.media ?? []) {
    const label = m.label.replace(/[^\w .-]/g, "").slice(0, 60);
    parts.push({ type: "text", text: `<<<FICHIER_${nonce} label="${label}">>>` });
    const data = `data:${m.mimeType};base64,${Buffer.from(m.data).toString("base64")}`;
    parts.push(m.mimeType === "application/pdf" ? { type: "file", file: { filename: `${label || "document"}.pdf`, file_data: data } } : { type: "image_url", image_url: { url: data } });
  }
  if (parts.length === 0) parts.push({ type: "text", text: "Exécute la consigne." });
  return parts;
}

interface Completion {
  id?: string;
  model?: string;
  choices?: { finish_reason?: string | null; native_finish_reason?: string | null; message?: { content?: string | null; images?: { image_url?: { url?: string } }[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { code?: number | string; message?: string };
}

/** Code d'erreur Limpid d'une réponse HTTP d'OpenRouter (jamais le contenu du document). */
export function errorCodeFor(status: number, message: string): ProviderError["code"] {
  if (status === 402) return "quota_exhausted"; // crédit OpenRouter épuisé
  if (status === 429) return "rate_limited";
  if (status === 400 && /token|context|too long|maximum context/i.test(message)) return "context_overflow";
  if (status === 403 && /moderat|flag|safety/i.test(message)) return "refused";
  if (status === 408) return "timeout_ambiguous";
  return "unavailable";
}

export class OpenRouterProvider implements AIProvider, ImageProvider {
  readonly name = "openrouter";
  readonly isDemo = false;

  constructor(private readonly config: OpenRouterConfig) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": this.config.siteUrl,
      "X-Title": "Limpid",
    };
  }

  private async post(body: Record<string, unknown>, signal: AbortSignal, timeout: AbortSignal, base: Omit<UsageReport, "durationMs">, started: number): Promise<Completion> {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, { method: "POST", headers: this.headers(), body: JSON.stringify(body), signal });
    } catch {
      const usage = { ...base, durationMs: Date.now() - started };
      if (timeout.aborted) throw new ProviderError("timeout_ambiguous", "Délai dépassé ; facturation incertaine.", usage);
      if (signal.aborted) throw new ProviderError("cancelled", "Opération annulée.", usage);
      throw new ProviderError("unavailable", "OpenRouter injoignable.", usage);
    }
    const json = (await res.json().catch(() => ({}))) as Completion;
    if (!res.ok || json.error) {
      const status = res.ok ? Number(json.error?.code) || 500 : res.status;
      const message = String(json.error?.message ?? "");
      const usage = { ...base, durationMs: Date.now() - started };
      throw new ProviderError(errorCodeFor(status, message), `OpenRouter : erreur HTTP ${status}.`, usage);
    }
    return json;
  }

  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResponse<z.infer<T>>> {
    const primary = modelForTier(this.config, req.budget.tier);
    // Dernière correction de schéma : le modèle plus capable (Pro) reprend la main.
    const escalate = req.preferFallback && primary !== this.config.models.complex ? [this.config.models.complex] : [];
    const models = [...new Set([...escalate, primary, ...this.config.fallbackModels])];
    for (let i = 0; ; i++) {
      try {
        return await this.generateWith(models[i]!, req);
      } catch (e) {
        const switchable = e instanceof ProviderError && (e.code === "unavailable" || e.code === "rate_limited");
        if (!switchable || i >= models.length - 1) throw e;
      }
    }
  }

  protected async generateWith<T extends z.ZodType>(model: string, req: StructuredRequest<T>): Promise<StructuredResponse<z.infer<T>>> {
    const nonce = randomBytes(12).toString("hex");
    const started = Date.now();
    const timeout = AbortSignal.timeout(req.budget.timeoutMs);
    const signal = AbortSignal.any([req.signal, timeout]);
    const base = { provider: this.name, model, inputTokens: null, outputTokens: null, requestId: null };
    const res = await this.post(
      {
        model,
        messages: [
          { role: "system", content: `${req.trustedInstructions}\n\n${UNTRUSTED_PREAMBLE(nonce)}` },
          { role: "user", content: userContent(req, nonce) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "reponse", strict: false, schema: toProviderSchema(z.toJSONSchema(req.schema, { target: "draft-2020-12", io: "output" })) },
        },
        // Un fournisseur qui ignorerait le format structuré n'est jamais choisi.
        provider: { require_parameters: true },
        max_tokens: req.budget.maxOutputTokens,
        temperature: 0.2,
        // Réflexion bornée : la vitesse vient surtout de là (les jetons de réflexion sont séquentiels).
        ...(req.budget.reasoning ? { reasoning: { effort: req.budget.reasoning } } : {}),
        usage: { include: true },
      },
      signal,
      timeout,
      base,
      started,
    );
    const usage: UsageReport = {
      provider: this.name,
      model: res.model ?? model,
      inputTokens: res.usage?.prompt_tokens ?? null,
      outputTokens: res.usage?.completion_tokens ?? null,
      durationMs: Date.now() - started,
      requestId: res.id ?? null,
      costUsd: typeof res.usage?.cost === "number" ? res.usage.cost : null,
    };
    const choice = res.choices?.[0];
    const finish = `${choice?.finish_reason ?? ""} ${choice?.native_finish_reason ?? ""}`.toLowerCase();
    if (/content_filter|safety|prohibited|blocklist/.test(finish)) throw new ProviderError("refused", "Le fournisseur a refusé de traiter ce contenu.", usage);
    if (/length|max_tokens/.test(finish)) throw new ProviderError("truncated", "Réponse tronquée.", usage);
    const text = choice?.message?.content ?? "";
    if (!text.trim()) throw new ProviderError("empty", "Réponse vide.", usage);
    let json: unknown;
    try {
      json = JSON.parse(stripFence(text));
    } catch {
      throw new ProviderError("invalid_json", "JSON invalide.", usage);
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 30).map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`);
      throw new ProviderError("schema_mismatch", "Réponse hors schéma.", usage, issues);
    }
    return { value: parsed.data, usage };
  }

  /** Couverture ou planche : une image, aucun texte incorporé (modèle image configuré à part). */
  async generateIllustration(req: { model: string; prompt: string; aspectRatio: ImageAspect; signal: AbortSignal; timeoutMs: number }): Promise<{ bytes: Buffer; mime: string; usage: UsageReport }> {
    const started = Date.now();
    const timeout = AbortSignal.timeout(req.timeoutMs);
    const signal = AbortSignal.any([req.signal, timeout]);
    const base = { provider: this.name, model: req.model, inputTokens: null, outputTokens: null, requestId: null };
    const res = await this.post(
      {
        model: req.model,
        messages: [{ role: "user", content: req.prompt }],
        modalities: ["image", "text"],
        image_config: { aspect_ratio: req.aspectRatio },
        usage: { include: true },
      },
      signal,
      timeout,
      base,
      started,
    );
    const usage: UsageReport = {
      ...base,
      model: res.model ?? req.model,
      inputTokens: res.usage?.prompt_tokens ?? null,
      outputTokens: res.usage?.completion_tokens ?? null,
      durationMs: Date.now() - started,
      requestId: res.id ?? null,
      costUsd: typeof res.usage?.cost === "number" ? res.usage.cost : null,
    };
    const finish = String(res.choices?.[0]?.finish_reason ?? "").toLowerCase();
    if (/content_filter|safety/.test(finish)) throw new ProviderError("refused", "Le fournisseur a refusé cette illustration.", usage);
    const url = res.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(url);
    if (!m) throw new ProviderError("empty", "Aucune image renvoyée.", usage);
    return { bytes: Buffer.from(m[2]!, "base64"), mime: m[1]!, usage };
  }
}

/** Certains modèles entourent le JSON de ```json … ``` malgré le format demandé. */
export function stripFence(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  return m ? m[1]! : t;
}
