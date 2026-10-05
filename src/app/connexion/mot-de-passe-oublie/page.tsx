import type { Metadata } from "next";
import Link from "next/link";
import { Screen } from "@/components/shell/Screen";
import { getT } from "@/lib/i18n/server";
import { ForgotForm } from "./ForgotForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.login.forgotTitle };
}

export default async function ForgotPage() {
  const t = await getT();
  return (
    <Screen className="login-page">
      <h1>{t.login.forgotTitle}</h1>
      <p className="lede">{t.login.forgotIntro}</p>
      <ForgotForm />
      <p><Link href="/connexion">{t.login.back}</Link></p>
    </Screen>
  );
}
