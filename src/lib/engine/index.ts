/** Fournisseur actif (un seul, aucune bascule silencieuse). */
import "server-only";
import { activeProvider } from "@/lib/config";
import { GeminiProvider, geminiConfigFromEnv } from "./gemini";
import { ProviderError, type AIProvider } from "./provider";

export function getProvider(): AIProvider {
  const name = activeProvider();
  if (name === "gemini") return new GeminiProvider(geminiConfigFromEnv());
  throw new ProviderError("not_configured", "Aucun fournisseur IA configuré.");
}
