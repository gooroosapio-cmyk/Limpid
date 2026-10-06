/** Fournisseur actif (un seul, aucune bascule silencieuse). */
import "server-only";
import { activeProvider } from "@/lib/config";
import { GeminiProvider, geminiConfigFromEnv } from "./gemini";
import { OpenRouterProvider, openRouterConfigFromEnv } from "./openrouter";
import { ProviderError, type AIProvider, type ImageProvider } from "./provider";

export function getProvider(): AIProvider {
  const name = activeProvider();
  if (name === "openrouter") return new OpenRouterProvider(openRouterConfigFromEnv());
  if (name === "gemini") return new GeminiProvider(geminiConfigFromEnv());
  throw new ProviderError("not_configured", "Aucun fournisseur IA configuré.");
}

/** Fournisseur d'images (couverture, planches) : le même compte que le texte. */
export function getImageProvider(): ImageProvider {
  const name = activeProvider();
  if (name === "openrouter") return new OpenRouterProvider(openRouterConfigFromEnv());
  if (name === "gemini") return new GeminiProvider(geminiConfigFromEnv());
  throw new ProviderError("not_configured", "Aucun fournisseur d'images configuré.");
}
