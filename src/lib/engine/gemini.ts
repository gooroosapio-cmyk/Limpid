/**
 * Adaptateur Google Gemini (fournisseur actif choisi au cadrage, Q3).
 * STATUT : essayé contre l'API réelle le 4 octobre 2026 (scripts/live-engine.test.ts).
 * Les identifiants de modèles viennent de la configuration, jamais du code.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import {
  ProviderError,
  UNTRUSTED_PREAMBLE,
  wrapUntrusted,
  type AIProvider,
  type StructuredRequest,
  type StructuredResponse,
} from "./provider";

export interface GeminiConfig {
  apiKey: string;
  modelFast: string;
  modelQuality: string;
}

export function geminiConfigFromEnv(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelFast = process.env.LIMPID_MODEL_FAST;
  const modelQuality = process.env.LIMPID_MODEL_QUALITY;
  if (!apiKey || !modelFast || !modelQuality) {
    throw new ProviderError("not_configured", "Gemini n'est pas configuré (clé ou modèles manquants).");
  }
  return { apiKey, modelFast, modelQuality };
}

/** Mots-clés de bornes refusés en nombre par l'API (400 INVALID_ARGUMENT constaté le 4 octobre 2026). */
const SIZE_KEYWORDS = new Set([
  "$schema", "minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
]);

/**
 * Schéma transmis au fournisseur : la structure, les types, les énumérations et les motifs
 * sont conservés ; les bornes de taille sont retirées. Elles restent appliquées par la
 * validation Zod côté serveur sur chaque réponse.
 */
export function toProviderSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toProviderSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (SIZE_KEYWORDS.has(k)) continue;
    if (k === "properties" && v && typeof v === "object") {
      // Les noms de propriétés ne sont pas des mots-clés : ne rien filtrer à ce niveau.
      out[k] = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toProviderSchema(pv)]));
    } else {
      out[k] = toProviderSchema(v);
    }
  }
  return out;
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly isDemo = false;
  private readonly client: GoogleGenAI;

  constructor(private readonly config: GeminiConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResponse<z.infer<T>>> {
    const model = req.budget.tier === "fast" ? this.config.modelFast : this.config.modelQuality;
    const nonce = randomBytes(12).toString("hex");
    const started = Date.now();
    const timeout = AbortSignal.timeout(req.budget.timeoutMs);
    const signal = AbortSignal.any([req.signal, timeout]);

    let res;
    try {
      res = await this.client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: wrapUntrusted(req.untrustedData, nonce) }] }],
        config: {
          systemInstruction: `${req.trustedInstructions}\n\n${UNTRUSTED_PREAMBLE(nonce)}`,
          responseMimeType: "application/json",
          responseJsonSchema: toProviderSchema(z.toJSONSchema(req.schema, { target: "draft-2020-12", io: "output" })),
          maxOutputTokens: req.budget.maxOutputTokens,
          temperature: 0.2,
          abortSignal: signal,
        },
      });
    } catch (e) {
      const durationMs = Date.now() - started;
      const usage = { provider: this.name, model, inputTokens: null, outputTokens: null, durationMs, requestId: null };
      if (req.signal.aborted) throw new ProviderError("cancelled", "Opération annulée.", usage);
      if (timeout.aborted) throw new ProviderError("timeout_ambiguous", "Délai dépassé ; facturation incertaine.", usage);
      const status = (e as { status?: number }).status;
      if (status === 429) throw new ProviderError("rate_limited", "Limite du fournisseur atteinte.", usage);
      if (status === 400 && /token|context|too long/i.test(String((e as Error).message))) {
        throw new ProviderError("context_overflow", "Contenu trop long pour le modèle.", usage);
      }
      throw new ProviderError("unavailable", "Fournisseur indisponible.", usage);
    }

    const usage = {
      provider: this.name,
      model: res.modelVersion ?? model,
      inputTokens: res.usageMetadata?.promptTokenCount ?? null,
      outputTokens: res.usageMetadata?.candidatesTokenCount ?? null,
      durationMs: Date.now() - started,
      requestId: res.responseId ?? null,
    };
    const candidate = res.candidates?.[0];
    if (res.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY") {
      throw new ProviderError("refused", "Le fournisseur a refusé de traiter ce contenu.", usage);
    }
    if (candidate?.finishReason === "MAX_TOKENS") {
      throw new ProviderError("truncated", "Réponse tronquée.", usage);
    }
    const text = res.text;
    if (!text || !text.trim()) throw new ProviderError("empty", "Réponse vide.", usage);

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ProviderError("invalid_json", "JSON invalide.", usage);
    }
    // Validation serveur systématique, même avec les sorties structurées du fournisseur.
    const parsed = req.schema.safeParse(json);
    if (!parsed.success) throw new ProviderError("schema_mismatch", "Réponse hors schéma.", usage);
    return { value: parsed.data, usage };
  }
}
