import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { fr } from "@/lib/i18n/fr";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erreur?: string; compte?: string }> }) {
  if (await currentUser()) redirect("/");
  const { erreur, compte } = await searchParams;
  return (
    <div className="page page-enter login-page stagger">
      <div className="login-brand"><Logo /></div>
      <h1>{fr.login.title}</h1>
      <p className="lede">{fr.login.subtitle}</p>
      <p className="muted">{fr.login.alpha}</p>
      {compte === "supprime" && <p className="notice" role="status">{fr.account.deleted}</p>}
      {erreur && (
        <p className="notice notice-warn" role="alert">
          Ce lien n'est plus valable. Demandez-en un nouveau.
        </p>
      )}
      <LoginForm />
    </div>
  );
}
