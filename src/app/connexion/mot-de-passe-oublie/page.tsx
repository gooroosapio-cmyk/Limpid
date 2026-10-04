import type { Metadata } from "next";
import Link from "next/link";
import { fr } from "@/lib/i18n/fr";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = { title: fr.login.forgotTitle };

export default function ForgotPage() {
  return (
    <>
      <h1>{fr.login.forgotTitle}</h1>
      <p className="muted">{fr.login.forgotIntro}</p>
      <ForgotForm />
      <p><Link href="/connexion">{fr.login.back}</Link></p>
    </>
  );
}
