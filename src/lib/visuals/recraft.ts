/**
 * Connecteur Recraft (Atlas de conception) : illustrations conceptuelles vectorielles (SVG) avec
 * Recraft V4.1 Vector. Jamais de nombres critiques ni d'axes inventés : les graphiques exacts
 * sont tracés par le code. Le SVG est assaini avant stockage (cf. svg.ts).
 */
import "server-only";
import { ProviderError, type UsageReport } from "@/lib/engine/provider";
import { sanitizeSvg } from "./svg";

const API = "https://external.api.recraft.ai/v1";
/** Prix public d'une image vectorielle V4.1 (6 octobre 2026), utilisé si l'API ne renvoie pas d'unités. */
const USD_PER_VECTOR = 0.08;

export interface RecraftConfig {
  apiKey: string;
  model: string;
}

export function recraftConfigFromEnv(env: NodeJS.ProcessEnv = process.env): RecraftConfig | null {
  const apiKey = env.RECRAFT_API_KEY?.trim();
  if (!apiKey || env.LIMPID_ILLUSTRATIONS_RECRAFT === "off") return null;
  const model = env.LIMPID_RECRAFT_MODEL?.trim() || "recraftv4_1_vector";
  return { apiKey, model: /^[a-z0-9_]{3,40}_vector$/.test(model) ? model : "recraftv4_1_vector" };
}

/** Consigne vectorielle : concept, sans texte, chiffres ni axes ; palette Limpid. */
export function vectorPrompt(subject: string, purpose: string, altText: string): string {
  return [
    `Flat vector editorial illustration of ${subject}, to show ${purpose}.`,
    `Only these validated elements: ${altText}.`,
    "Calm composition, generous negative space, soft ivory, ink green and warm yellow palette.",
    "No text, no letters, no numbers, no axes, no charts, no logos, no recognisable faces.",
  ].join(" ").slice(0, 1_000);
}

export async function generateVector(
  config: RecraftConfig,
  req: { prompt: string; size: "4:3" | "1:1" | "3:2"; signal: AbortSignal; timeoutMs: number },
): Promise<{ svg: string; usage: UsageReport }> {
  const started = Date.now();
  const timeout = AbortSignal.timeout(req.timeoutMs);
  const signal = AbortSignal.any([req.signal, timeout]);
  const base = { provider: "recraft", model: config.model, inputTokens: null, outputTokens: null, requestId: null };
  const fail = (code: ProviderError["code"], msg: string, cost: number | null = null) =>
    new ProviderError(code, msg, { ...base, durationMs: Date.now() - started, costUsd: cost });
  let res: Response;
  try {
    res = await fetch(`${API}/images/generations/vector`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: req.prompt, model: config.model, size: req.size, n: 1, response_format: "url" }),
      signal,
    });
  } catch {
    if (timeout.aborted) throw fail("timeout_ambiguous", "Délai dépassé ; facturation incertaine.");
    if (req.signal.aborted) throw fail("cancelled", "Opération annulée.");
    throw fail("unavailable", "Recraft injoignable.");
  }
  if (!res.ok) {
    if (res.status === 402) throw fail("quota_exhausted", "Solde Recraft épuisé.");
    if (res.status === 429) throw fail("rate_limited", "Limite Recraft atteinte.");
    throw fail("unavailable", `Recraft : erreur HTTP ${res.status}.`);
  }
  const json = (await res.json().catch(() => ({}))) as { data?: { url?: string; image_id?: string }[]; credits?: number };
  // Unités Recraft : 1 USD = 1 000 unités.
  const cost = typeof json.credits === "number" ? json.credits / 1000 : USD_PER_VECTOR;
  const url = json.data?.[0]?.url;
  if (!url || !/^https:\/\//.test(url)) throw fail("empty", "Aucune image renvoyée.", cost);
  const file = await fetch(url, { signal }).catch(() => null);
  const text = file?.ok ? await file.text() : "";
  let svg: string;
  try {
    svg = sanitizeSvg(text);
  } catch {
    throw fail("invalid_json", "SVG inexploitable.", cost);
  }
  return { svg, usage: { ...base, durationMs: Date.now() - started, requestId: json.data?.[0]?.image_id ?? null, costUsd: cost } };
}
