import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Screen } from "@/components/shell/Screen";
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
    <Screen>
      <h1>{t.signup.title}</h1>
      <p className="lede">{t.signup.lede}</p>
      {open ? (
        <>
          <OAuthButtons t={t} />
          <SignupForm />
        </>
      ) : (
        <>
          <p className="notice">{t.signup.closed}</p>
          <Link href="/connexion" className="btn">{t.signup.already}</Link>
        </>
      )}
    </Screen>
  );
}
