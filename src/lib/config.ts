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
  urlTimeoutMs: int("LIMPID_URL_TIMEOUT_MS", 10_000),
  urlMaxRedirects: int("LIMPID_URL_MAX_REDIRECTS", 3),
};

/** Import par lien : désactivable si la protection SSRF n'est pas garantie sur l'hébergeur (cadrage Q14). */
export function isUrlImportEnabled(): boolean {
  return (process.env.LIMPID_URL_IMPORT ?? "on").toLowerCase() !== "off";
}

export const retention = {
  /** Purge du fichier original après extraction (payload 1 § 6 ; cadrage Q18). */
  originalHours: int("LIMPID_RETENTION_ORIGINAL_HOURS", 24),
  /** 0 = rapports conservés jusqu'à suppression manuelle (cadrage Q18). */
  reportDays: int("LIMPID_RETENTION_REPORT_DAYS", 0),
};

export const budget = {
  /** Coupe-circuit global, en centimes d'euro par mois (cadrage Q17). */
  monthlyCapCents: int("LIMPID_MONTHLY_CAP_CENTS", 1_000),
  perReportCapCents: int("LIMPID_REPORT_CAP_CENTS", 50),
  perAccountDailyCapCents: int("LIMPID_ACCOUNT_DAILY_CAP_CENTS", 200),
};

export type ProviderName = "gemini" | "openai" | "demo";

export function activeProvider(): ProviderName {
  const p = (process.env.LIMPID_AI_PROVIDER ?? "gemini").toLowerCase();
  if (p !== "gemini" && p !== "openai" && p !== "demo") throw new Error("LIMPID_AI_PROVIDER invalide");
  // Sans clé, le seul mode possible est la démo, affichée comme telle.
  if (p === "gemini" && !process.env.GEMINI_API_KEY) return "demo";
  if (p === "openai" && !process.env.OPENAI_API_KEY) return "demo";
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
