"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { budget } from "@/lib/config";
import { adminClient } from "@/lib/supabase/admin";

/** Chaque action d'administration est journalisée (sans contenu privé), puis la page est rechargée. */
async function audit(actorId: string, action: string, target: string | null, meta: Record<string, unknown> = {}) {
  await adminClient().from("audit_log").insert({ actor_id: actorId, action, target_kind: "admin", target_id: target, meta });
}

function done(message: string): never {
  revalidatePath("/admin");
  redirect(`/admin?message=${encodeURIComponent(message)}`);
}

export async function setGeneration(form: FormData) {
  const user = await requireAdmin();
  const enabled = form.get("enabled") === "on";
  const { error } = await adminClient().from("app_settings").update({ generation_enabled: enabled, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) done("La modification n'a pas été enregistrée.");
  await audit(user.id, enabled ? "generation.enable" : "generation.disable", null);
  done(enabled ? "Génération réactivée." : "Génération suspendue : aucun nouvel appel IA ne sera fait.");
}

export async function setMonthlyCap(form: FormData) {
  const user = await requireAdmin();
  const euros = z.coerce.number().min(0).max(budget.monthlyCapCents / 100).safeParse(form.get("euros"));
  if (!euros.success) done(`Plafond invalide (entre 0 et ${budget.monthlyCapCents / 100} €).`);
  const cents = Math.round(euros.data * 100);
  const { error } = await adminClient().from("app_settings").update({ monthly_cap_cents: cents, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) done("La modification n'a pas été enregistrée.");
  await audit(user.id, "budget.monthly_cap", null, { cents });
  done(`Plafond mensuel fixé à ${(cents / 100).toLocaleString("fr-FR")} €.`);
}

const Email = z.string().trim().toLowerCase().email().max(254);

export async function addAllowedEmail(form: FormData) {
  const user = await requireAdmin();
  const email = Email.safeParse(form.get("email"));
  const role = z.enum(["user", "admin"]).safeParse(form.get("role"));
  if (!email.success || !role.success) done("Adresse ou rôle invalide.");
  const { error } = await adminClient().from("allowed_emails").upsert({ email: email.data, role: role.data });
  if (error) done("L'adresse n'a pas été ajoutée.");
  await audit(user.id, "allowlist.add", null, { role: role.data });
  done(`${email.data} peut désormais se connecter.`);
}

export async function removeAllowedEmail(form: FormData) {
  const user = await requireAdmin();
  const email = Email.safeParse(form.get("email"));
  if (!email.success) done("Adresse invalide.");
  if (email.data === user.email?.toLowerCase()) done("Vous ne pouvez pas retirer votre propre adresse.");
  const db = adminClient();
  const { data: admins } = await db.from("allowed_emails").select("email").eq("role", "admin");
  if ((admins ?? []).length <= 1 && admins?.[0]?.email === email.data) done("Impossible de retirer le dernier administrateur.");
  const { error } = await db.from("allowed_emails").delete().eq("email", email.data);
  if (error) done("L'adresse n'a pas été retirée.");
  await audit(user.id, "allowlist.remove", null);
  done(`${email.data} ne peut plus se connecter.`);
}
