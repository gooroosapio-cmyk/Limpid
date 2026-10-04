"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { isEmailAllowed } from "@/lib/config";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { createUserClient } from "@/lib/supabase/server";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message: string;
}

const Email = z.string().trim().toLowerCase().email().max(254);

async function isAllowed(email: string): Promise<boolean> {
  if (isEmailAllowed(email)) return true;
  if (!isAdminConfigured()) return false;
  const { data } = await adminClient().from("allowed_emails").select("email").eq("email", email).maybeSingle();
  return !!data;
}

async function siteUrl(): Promise<string> {
  if (process.env.LIMPID_SITE_URL) return process.env.LIMPID_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Envoie un lien magique. Réponse identique que l'adresse soit autorisée ou non (pas d'énumération). */
export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = Email.safeParse(form.get("email"));
  if (!parsed.success) return { status: "error", message: "Adresse email invalide." };
  const email = parsed.data;
  const sent: LoginState = {
    status: "sent",
    message: "Si cette adresse est autorisée, un lien de connexion vient de lui être envoyé. Il est valable une heure.",
  };
  if (!(await isAllowed(email))) return sent;

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await siteUrl()}/auth/callback`, shouldCreateUser: true },
  });
  if (error) {
    console.error("auth.signInWithOtp", error.status, error.code);
    return { status: "error", message: "L'envoi du lien a échoué. Réessayez dans une minute." };
  }
  return sent;
}
