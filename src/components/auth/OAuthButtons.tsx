import { enabledProviders } from "@/lib/auth/oauth";
import type { Dict } from "@/lib/i18n";

/**
 * Boutons Google / Apple : affichés seulement pour les fournisseurs configurés.
 * Simples liens (pas de préchargement) vers /auth/oauth/<fournisseur>.
 */
export function OAuthButtons({ t }: { t: Dict }) {
  const providers = enabledProviders();
  if (providers.length === 0) return null;
  return (
    <div className="oauth-buttons">
      {providers.map((p) => (
        <a key={p} href={`/auth/oauth/${p}`} className="btn btn-block" rel="nofollow">
          {t.login.oauth[p]}
        </a>
      ))}
      <p className="center muted">{t.login.or}</p>
    </div>
  );
}
