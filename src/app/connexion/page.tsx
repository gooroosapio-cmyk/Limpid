import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { fr } from "@/lib/i18n/fr";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erreur?: string; compte?: string }> }) {
  if (await currentUser()) redirect("/");
  const { erreur, compte } = await searchParams;
  return (
    <>
      <h1>{fr.login.title}</h1>
      <p className="lead">{fr.login.subtitle}</p>
      <p className="muted">{fr.login.alpha}</p>
      {compte === "supprime" && <p className="notice" role="status">{fr.account.deleted}</p>}
      {erreur && (
        <p className="notice notice-warn" role="alert">
          Ce lien n'est plus valable. Demandez-en un nouveau.
        </p>
      )}
      <LoginForm />
    </>
  );
}
