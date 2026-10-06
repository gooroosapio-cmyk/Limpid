import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { getT } from "@/lib/i18n/server";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Icon } from "@/components/Icon";
import { LoginForm } from "./LoginForm";
import { Illustration } from "@/components/Illustration";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.login.title };
}

/**
 * Connexion (V4, § 5) : écran compact qui tient sans défiler à 360 × 740. Ordre : logo,
 * Connexion, Google, « ou », e-mail, mot de passe, Se connecter, Créer un compte, lien,
 * confidentialité, pied de page. Petite illustration décorative, masquée si l'écran est bas.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erreur?: string; compte?: string; session?: string }> }) {
  const t = await getT();
  if (await currentUser()) redirect("/");
  const { erreur, compte, session } = await searchParams;
  return (
    <div className="auth">
      <div className="auth-top">
        <Logo height={26} />
        <Illustration name="connexion" fallback="lumiere" className="auth-illustration" eager />
      </div>
      <h1>{t.v4.login.title}</h1>
      {compte === "supprime" && <p className="notice" role="status">{t.account.deleted}</p>}
      {session && session in t.devices.expired && (
        <p className="notice" role="status">{t.devices.expired[session as keyof typeof t.devices.expired]}</p>
      )}
      {erreur && (
        <p className="notice notice-warn" role="alert">
          {erreur === "oauth" ? t.login.oauth.error : erreur === "oauth_ferme" ? t.login.oauth.closed : t.login.linkInvalid}
        </p>
      )}
      <OAuthButtons t={t} />
      <LoginForm signupHref="/inscription" />
      <p className="auth-private"><Icon name="shield" size={18} /> {t.v4.login.private}</p>
      <footer className="footer">{t.brand.poweredBy}</footer>
    </div>
  );
}
