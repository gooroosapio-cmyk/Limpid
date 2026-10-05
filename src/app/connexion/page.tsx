import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { signupOpen } from "@/lib/auth/password";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { LoginForm } from "./LoginForm";

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
    <div className="page page-enter login-page stagger">
      <div className="login-brand"><Logo /></div>
      <h1>{t.login.title}</h1>
      <p className="lede">{t.login.subtitle}</p>
      {!open && <p className="muted">{t.login.alpha}</p>}
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
      {open && (
        <p className="center">
          <Link href="/inscription" className="btn btn-block">{t.signup.create}</Link>
        </p>
      )}
      <p className="center"><Link href="/offres" className="btn-link">{t.billing.seeOffers}</Link></p>
    </div>
  );
}
