import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { signupOpen } from "@/lib/auth/password";
import { getT } from "@/lib/i18n/server";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { SignupForm } from "./SignupForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.signup.title };
}

/** Créez votre compte Limpid (§ 11) : offre gratuite, sans carte bancaire. */
export default async function SignupPage() {
  if (await currentUser()) redirect("/");
  const t = await getT();
  const open = await signupOpen();
  return (
    <div className="auth">
      <div className="auth-top"><Logo height={26} /></div>
      <h1>{t.signup.title}</h1>
      <p className="auth-lede">{t.signup.lede}</p>
      {open ? (
        <>
          <OAuthButtons t={t} />
          <SignupForm />
        </>
      ) : (
        <>
          <p className="notice">{t.signup.closed}</p>
          <Link href="/connexion" className="btn btn-block">{t.signup.already}</Link>
        </>
      )}
      <footer className="footer">{t.brand.poweredBy}</footer>
    </div>
  );
}
