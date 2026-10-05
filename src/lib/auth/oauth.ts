/**
 * Connexion Google et Apple (spécification V2, § 3) via Supabase Auth (OAuth + PKCE).
 * Un bouton n'apparaît que si le fournisseur est déclaré configuré : jamais de bouton fictif.
 */
export const OAUTH_PROVIDERS = ["google", "apple"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** LIMPID_AUTH_GOOGLE=on / LIMPID_AUTH_APPLE=on une fois le fournisseur réglé dans Supabase. */
export function enabledProviders(env: Record<string, string | undefined> = process.env): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter((p) => env[`LIMPID_AUTH_${p.toUpperCase()}`] === "on");
}

export function isOAuthProvider(v: string): v is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(v);
}

/** Portées minimales : identité et adresse seulement (ni Gmail, ni Drive, ni Contacts). */
export const OAUTH_SCOPES: Record<OAuthProvider, string> = { google: "openid email profile", apple: "name email" };
