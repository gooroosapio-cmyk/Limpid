import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { fr } from "@/lib/i18n/fr";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = { title: fr.login.newTitle };

export default async function SetPasswordPage() {
  const user = await requireUser();
  return (
    <>
      <h1>{fr.login.newTitle}</h1>
      <p className="muted">{fr.login.newIntro}</p>
      <PasswordForm email={user.email ?? ""} />
    </>
  );
}
