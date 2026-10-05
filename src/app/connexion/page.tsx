import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { signupOpen } from "@/lib/auth/password";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Icon } from "@/components/Icon";
import { LoginForm } from "./LoginForm";
import { Illustration } from "@/components/Illustration";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.login.title };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erreur?: string; compte?: string; session?: string }> }) {
  const t = await getT();
  if (await currentUser()) redirect("/");
  const { erreur, compte, session } = await searchParams;
  const open = await signupOpen();
  return (
    <div className="page page-enter login-page">
      <div className="login-hero">
        <Illustration name="connexion" fallback="lumiere" className="login-art" eager />
        <div className="login-brand"><Logo /></div>
      </div>
      <div className="page-title login-title">
        <h1>{t.login.v2Title}</h1>
        <p>{t.login.v2Subtitle}</p>
      </div>
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
      <LoginForm />
      <p className="login-signup-line">
        {t.login.noAccount} <Link href="/inscription">{t.signup.create}</Link>
        {!open && <span className="muted"> · {t.signup.closed}</span>}
      </p>
      <p className="login-private"><Icon name="lock" size={22} /> {t.login.private}</p>
    </div>
  );
}
