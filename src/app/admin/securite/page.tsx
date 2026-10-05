import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Screen } from "@/components/shell/Screen";
import { adminMfaStep, requireAdminRole } from "@/lib/admin";
import { getT } from "@/lib/i18n/server";
import { MfaEnroll, MfaVerify } from "./MfaForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.admin.mfaTitle };
}

/** Second facteur exigé avant l'administration : configuration (première fois) ou code. */
export default async function AdminSecurityPage() {
  await requireAdminRole();
  const step = await adminMfaStep();
  if (step === "ok") redirect("/admin");
  const t = (await getT()).admin;
  return (
    <Screen>
      <h1>{t.mfaTitle}</h1>
      <p className="lede">{step === "verify" ? t.mfaIntroVerify : t.mfaIntroEnroll}</p>
      <div className="card">{step === "verify" ? <MfaVerify /> : <MfaEnroll />}</div>
      <p className="muted small">{t.mfaRecovery}</p>
    </Screen>
  );
}
