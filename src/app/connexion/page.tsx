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
      <h1>Connexion</h1>
      <p className="muted">Alpha privée : seules les adresses invitées peuvent se connecter. Aucun mot de passe.</p>
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
