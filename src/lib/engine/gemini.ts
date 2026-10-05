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
  type UsageReport,
} from "./provider";

export interface GeminiConfig {
  apiKey: string;
  modelFast: string;
  modelQuality: string;
  /**
   * Modèles de repli déclarés (même fournisseur), essayés dans l'ordre quand le quota du
   * modèle principal est épuisé. Le modèle réellement utilisé est journalisé à chaque appel.
   */
  fallbackModels?: string[];
}

export function geminiConfigFromEnv(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY;
  // Rôles (V4) : AI_REPORT_MODEL rédige les rapports, AI_CHAT_MODEL (plus léger) répond aux
  // discussions et corrections courtes ; les anciens réglages restent pris en compte.
  const modelFast = process.env.AI_CHAT_MODEL || process.env.LIMPID_MODEL_FAST;
  const modelQuality = process.env.AI_REPORT_MODEL || process.env.LIMPID_MODEL_QUALITY;
  if (!apiKey || !modelFast || !modelQuality) {
    throw new ProviderError("not_configured", "Gemini n'est pas configuré (clé ou modèles manquants).");
  }
  const fallbackModels = (process.env.LIMPID_MODEL_FALLBACKS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => /^[a-z0-9][a-z0-9.\-]{2,80}$/.test(m))
    .slice(0, 3);
  return { apiKey, modelFast, modelQuality, fallbackModels };
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

/** Délai de reprise annoncé par l'API (« retryDelay": "27672s" »), en secondes ; 0 si absent. */
export function retryDelaySeconds(e: unknown): number {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(String((e as Error)?.message ?? ""));
  return m ? Number(m[1]) : 0;
}

/** Données non fiables délimitées, puis fichiers joints annoncés par une étiquette. */
export function requestParts(req: StructuredRequest<z.ZodType>, nonce: string) {
  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
  if (req.untrustedData.length) parts.push({ text: wrapUntrusted(req.untrustedData, nonce) });
  for (const m of req.media ?? []) {
    parts.push({ text: `<<<FICHIER_${nonce} label="${m.label.replace(/[^\w .-]/g, "").slice(0, 60)}">>>` });
    parts.push({ inlineData: { mimeType: m.mimeType, data: Buffer.from(m.data).toString("base64") } });
  }
  // Une requête sans aucune donnée (consigne seule, ex. diagnostic) est refusée par l'API : parts vide.
  if (parts.length === 0) parts.push({ text: "Exécute la consigne." });
  return parts;
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  readonly isDemo = false;
  private readonly client: GoogleGenAI;

  constructor(private readonly config: GeminiConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  async generateStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResponse<z.infer<T>>> {
    const primary = req.budget.tier === "fast" ? this.config.modelFast : this.config.modelQuality;
    const models = [primary, ...(this.config.fallbackModels ?? []).filter((m) => m !== primary)];
    for (let i = 0; ; i++) {
      try {
        return await this.generateWith(models[i]!, req);
      } catch (e) {
        // Quota du jour épuisé ou modèle surchargé : le modèle de repli déclaré prend le relais.
        const switchable = e instanceof ProviderError && (e.code === "quota_exhausted" || e.code === "unavailable");
        if (!switchable || i >= models.length - 1) throw e;
      }
    }
  }

  protected async generateWith<T extends z.ZodType>(model: string, req: StructuredRequest<T>): Promise<StructuredResponse<z.infer<T>>> {
    const nonce = randomBytes(12).toString("hex");
    const started = Date.now();
    const timeout = AbortSignal.timeout(req.budget.timeoutMs);
    const signal = AbortSignal.any([req.signal, timeout]);

    let res;
    try {
      res = await this.client.models.generateContent({
        model,
        contents: [{ role: "user", parts: requestParts(req, nonce) }],
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
      if (status === 429) {
        // Quota journalier épuisé (délai de reprise de plusieurs minutes ou plus) : pas de nouvel essai.
        if (retryDelaySeconds(e) > 120) throw new ProviderError("quota_exhausted", "Quota du fournisseur épuisé pour la journée.", usage);
        throw new ProviderError("rate_limited", "Limite du fournisseur atteinte.", usage);
      }
      if (status === 400 && /token|context|too long/i.test(String((e as Error).message))) {
        throw new ProviderError("context_overflow", "Contenu trop long pour le modèle.", usage);
      }
      // Code HTTP seulement (jamais le contenu de la réponse) : utile au diagnostic.
      throw new ProviderError("unavailable", `Fournisseur indisponible${status ? ` (HTTP ${status})` : ""}.`, usage);
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
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 30).map((i) => `${i.path.join(".") || "(racine)"} : ${i.message}`);
      throw new ProviderError("schema_mismatch", "Réponse hors schéma.", usage, issues);
    }
    return { value: parsed.data, usage };
  }

  /**
   * Illustration générée (cahier V2, § 10) : appel image séparé, une variante, aucun texte
   * incorporé. Le modèle image est configuré à part ; l'actif est vérifié par l'appelant.
   */
  async generateIllustration(req: {
    model: string;
    prompt: string;
    aspectRatio: "4:3" | "16:9";
    signal: AbortSignal;
    timeoutMs: number;
  }): Promise<{ bytes: Buffer; mime: string; usage: UsageReport }> {
    const started = Date.now();
    const timeout = AbortSignal.timeout(req.timeoutMs);
    const base = { provider: this.name, model: req.model, inputTokens: null, outputTokens: null, requestId: null };
    let res;
    try {
      res = await this.client.models.generateContent({
        model: req.model,
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: req.aspectRatio }, abortSignal: AbortSignal.any([req.signal, timeout]) },
      });
    } catch (e) {
      const usage = { ...base, durationMs: Date.now() - started };
      if (req.signal.aborted) throw new ProviderError("cancelled", "Opération annulée.", usage);
      if (timeout.aborted) throw new ProviderError("timeout_ambiguous", "Délai dépassé ; facturation incertaine.", usage);
      const status = (e as { status?: number }).status;
      if (status === 429) throw new ProviderError("quota_exhausted", "Quota image du fournisseur épuisé.", usage);
      throw new ProviderError("unavailable", `Génération d'image indisponible${status ? ` (HTTP ${status})` : ""}.`, usage);
    }
    const usage: UsageReport = {
      ...base,
      model: res.modelVersion ?? req.model,
      inputTokens: res.usageMetadata?.promptTokenCount ?? null,
      outputTokens: res.usageMetadata?.candidatesTokenCount ?? null,
      durationMs: Date.now() - started,
      requestId: res.responseId ?? null,
    };
    if (res.promptFeedback?.blockReason || res.candidates?.[0]?.finishReason === "SAFETY") {
      throw new ProviderError("refused", "Le fournisseur a refusé cette illustration.", usage);
    }
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) throw new ProviderError("empty", "Aucune image renvoyée.", usage);
    return { bytes: Buffer.from(part.inlineData.data, "base64"), mime: part.inlineData.mimeType ?? "", usage };
  }
}
