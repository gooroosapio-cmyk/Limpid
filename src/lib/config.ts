/**
 * Configuration serveur. Les valeurs proviennent de l'environnement, avec des défauts
 * conformes au payload 1. Aucun secret n'est exposé au client : ce module ne doit
 * être importé que côté serveur (les variables NEXT_PUBLIC_* sont les seules publiques).
 */
import "server-only";

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Variable ${name} invalide`);
  return n;
}

export const limits = {
  maxFileBytes: int("LIMPID_MAX_FILE_MB", 20) * 1024 * 1024,
  maxPages: int("LIMPID_MAX_PAGES", 100),
  maxImageMegapixels: int("LIMPID_MAX_IMAGE_MP", 20),
  maxPastedChars: int("LIMPID_MAX_PASTED_CHARS", 50_000),
  maxExtractedTokens: int("LIMPID_MAX_EXTRACTED_TOKENS", 120_000),
  /** Texte retenu d'un fichier ou d'une page web (≈ 3 caractères par jeton, marge comprise). */
  maxSourceChars: int("LIMPID_MAX_SOURCE_CHARS", 300_000),
  /** Lecture OCR (vision Gemini) : pages lues au plus et taille maximale du fichier joint. */
  maxOcrPages: int("LIMPID_MAX_OCR_PAGES", 30),
  maxOcrBytes: int("LIMPID_MAX_OCR_MB", 14) * 1024 * 1024,
  urlTimeoutMs: int("LIMPID_URL_TIMEOUT_MS", 10_000),
  urlMaxRedirects: int("LIMPID_URL_MAX_REDIRECTS", 3),
};

/** Import par lien : désactivable si la protection SSRF n'est pas garantie sur l'hébergeur (cadrage Q14). */
export function isUrlImportEnabled(): boolean {
  return (process.env.LIMPID_URL_IMPORT ?? "on").toLowerCase() !== "off";
}

/**
 * Conservation (V4, § 7) : les Limpid et leurs documents originaux sont gardés jusqu'à leur
 * suppression par l'utilisateur. Aucune variable d'environnement ne réintroduit d'échéance.
 * Seuls restent temporaires : un envoi jamais utilisé dans un Limpid (24 h) et un envoi
 * interrompu avant la fin du téléversement (cf. sources/uploads.ts).
 */
export const retention = {
  /** 0 : aucune purge automatique des Limpid. */
  reportDays: 0,
  /** 0 : original gardé tant que le Limpid (ou la source) existe. */
  originalHours: 0,
  /** Envoi préparé mais jamais utilisé dans un Limpid : effacé après ce délai. */
  unusedHours: 24,
};

export const budget = {
  /** Coupe-circuit global, en centimes d'euro par mois (cadrage Q17). */
  // Simulation du 6 octobre 2026 : un long complexe coûte ~0,73 USD (≈ 67 c€) ; plafonds par défaut ajustés.
  monthlyCapCents: int("LIMPID_MONTHLY_CAP_CENTS", 5_000),
  perReportCapCents: int("LIMPID_REPORT_CAP_CENTS", 120),
  perAccountDailyCapCents: int("LIMPID_ACCOUNT_DAILY_CAP_CENTS", 600),
};

export type ProviderName = "openrouter" | "gemini" | "demo";

/**
 * Fournisseur IA actif (un seul, aucune bascule silencieuse). Par défaut : OpenRouter si sa clé
 * est présente, sinon Gemini direct. Sans clé, le seul mode possible est la démo, affichée comme telle.
 */
export function activeProvider(env: NodeJS.ProcessEnv = process.env): ProviderName {
  const p = (env.LIMPID_AI_PROVIDER ?? (env.OPENROUTER_API_KEY ? "openrouter" : "gemini")).toLowerCase();
  if (p !== "openrouter" && p !== "gemini" && p !== "demo") throw new Error("LIMPID_AI_PROVIDER invalide");
  if (p === "openrouter" && !env.OPENROUTER_API_KEY) return "demo";
  if (p === "gemini" && !env.GEMINI_API_KEY) return "demo";
  return p;
}

export function isDemoMode(): boolean {
  return activeProvider() === "demo";
}

/** Emails autorisés à se connecter (alpha privée, inscriptions fermées). */
export function allowedEmails(): string[] {
  return (process.env.LIMPID_ALLOWED_EMAILS ?? process.env.OWNER_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string): boolean {
  return allowedEmails().includes(email.trim().toLowerCase());
}
