import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { signupOpen } from "@/lib/auth/password";
import { LoginForm } from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: "Connexion" };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erreur?: string; compte?: string }> }) {
  const t = await getT();
  if (await currentUser()) redirect("/");
  const { erreur, compte } = await searchParams;
  const open = await signupOpen();
  return (
    <div className="page page-enter login-page stagger">
      <div className="login-brand"><Logo /></div>
      <h1>{t.login.title}</h1>
      <p className="lede">{t.login.subtitle}</p>
      {!open && <p className="muted">{t.login.alpha}</p>}
      {compte === "supprime" && <p className="notice" role="status">{t.account.deleted}</p>}
      {erreur && (
        <p className="notice notice-warn" role="alert">
          {t.login.linkInvalid}
        </p>
      )}
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
