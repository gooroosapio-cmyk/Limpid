import type { Metadata } from "next";
import { Screen } from "@/components/shell/Screen";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";
import { PasswordForm } from "./PasswordForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.login.newTitle };
}

export default async function SetPasswordPage() {
  const t = await getT();
  const user = await requireUser();
  return (
    <Screen>
      <h1>{t.login.newTitle}</h1>
      <p className="lede">{t.login.newIntro}</p>
      <PasswordForm email={user.email ?? ""} />
    </Screen>
  );
}
