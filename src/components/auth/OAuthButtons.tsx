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
        <a key={p} href={`/auth/oauth/${p}`} className={`btn btn-block oauth-${p}`} rel="nofollow">
          {p === "google" ? <GoogleMark /> : <AppleMark />}
          {t.login.oauth[p]}
        </a>
      ))}
      <p className="divider">{t.login.or}</p>
    </div>
  );
}

/** Logo « G » officiel de Google (ressources de marque Google Identity), couleurs inchangées. */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/** Logo Apple (monochrome, selon les règles de marque « Sign in with Apple »). */
function AppleMark() {
  return (
    <svg width="18" height="20" viewBox="0 0 814 1000" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 202-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-165-40c-77 0-104 41-166 41s-106-57-156-127C44 791 0 669 0 553c0-186 121-285 240-285 63 0 116 42 156 42 38 0 97-44 169-44 27 0 126 2 192 76zM554 158c30-35 51-84 51-133 0-7-1-14-2-19-49 2-107 33-142 73-28 31-53 80-53 130 0 8 1 15 2 18 3 1 9 1 14 1 44 0 99-29 130-70z" />
    </svg>
  );
}
