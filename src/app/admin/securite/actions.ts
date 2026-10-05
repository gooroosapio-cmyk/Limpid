"use server";

import { redirect } from "next/navigation";
import { adminMfaStep, requireAdminRole } from "@/lib/admin";
import { qrDataUrl, totpCode } from "@/lib/auth/mfa";
import { getT } from "@/lib/i18n/server";
import { adminClient } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

export interface MfaState {
  status: "idle" | "enrolling" | "error";
  message: string;
  factorId?: string;
  qr?: string;
  secret?: string;
}

async function audit(actorId: string, action: string) {
  await adminClient().from("audit_log").insert({ actor_id: actorId, action, target_kind: "admin", target_id: null });
}

/** Crée un facteur TOTP (les essais non terminés sont retirés d'abord) et renvoie son QR code. */
export async function startEnroll(_prev: MfaState): Promise<MfaState> {
  const t = (await getT()).admin;
  await requireAdminRole();
  // Un facteur déjà vérifié se valide par un code, jamais par une nouvelle inscription.
  if ((await adminMfaStep()) !== "enroll") redirect("/admin/securite");
  const supabase = await createUserClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Limpid admin ${Date.now()}` });
  if (error || !data) {
    console.error("mfa.enroll", error?.status, error?.code);
    return { status: "error", message: t.mfaUnavailable };
  }
  return { status: "enrolling", message: "", factorId: data.id, qr: qrDataUrl(data.totp.qr_code), secret: data.totp.secret };
}

/** Vérifie le code : la session passe en aal2 (cookies mis à jour), puis retour à l'administration. */
export async function verifyCode(_prev: MfaState, form: FormData): Promise<MfaState> {
  const t = (await getT()).admin;
  const user = await requireAdminRole();
  const code = totpCode(form.get("code"));
  if (!code) return { status: "error", message: t.mfaInvalid };
  const supabase = await createUserClient();
  let factorId = String(form.get("factor_id") ?? "");
  const { data: factors } = await supabase.auth.mfa.listFactors();
  // Le facteur doit appartenir à ce compte (liste lue avec sa propre session).
  const own = (factors?.all ?? []).filter((f) => f.factor_type === "totp");
  if (!own.some((f) => f.id === factorId)) factorId = own.find((f) => f.status === "verified")?.id ?? "";
  if (!factorId) return { status: "error", message: t.mfaFailed };
  const enrolling = own.find((f) => f.id === factorId)?.status === "unverified";
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    console.error("mfa.verify", error.status, error.code);
    return { status: "error", message: error.status === 429 ? t.mfaTooMany : t.mfaInvalid };
  }
  await audit(user.id, enrolling ? "admin.mfa_enroll" : "admin.mfa_verify");
  redirect("/admin");
}
