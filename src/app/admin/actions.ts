"use server";

import { revalidatePath } from "next/cache";
import { cleanRoute, modelInfo, type ImageStyle } from "@/lib/visuals/image-models";
import { after } from "next/server";
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

/** Fournisseur et modèle par type de visuel : valeur « fournisseur|modèle » du catalogue fermé. */
export async function setImageSettings(form: FormData) {
  const user = await requireAdmin();
  const route = (key: string, style: ImageStyle) => {
    const [provider, model] = String(form.get(key) ?? "").split("|");
    const m = modelInfo(model ?? "");
    return m && m.provider === provider ? cleanRoute(provider, model, style) : null;
  };
  const vector = route("vector", "vector");
  const realistic = route("realistic", "realistic");
  if (!vector || !realistic) done("Modèle d'image invalide.");
  const { error } = await adminClient()
    .from("app_settings")
    .update({
      images_enabled: form.get("images_enabled") === "on",
      image_vector_provider: vector!.provider,
      image_vector_model: vector!.model,
      image_realistic_provider: realistic!.provider,
      image_realistic_model: realistic!.model,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) done("La modification n'a pas été enregistrée.");
  await audit(user.id, "images.settings", null, { vector: vector!.model, realistic: realistic!.model });
  done("Réglages des images enregistrés.");
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

export interface DiagnosticState {
  checks: import("@/lib/diagnostic").DiagnosticCheck[] | null;
  at: string | null;
}

/** Diagnostic serveur à la demande ; le test Gemini consomme une requête du quota. */
export async function runDiagnosticAction(_prev: DiagnosticState, form: FormData): Promise<DiagnosticState> {
  const user = await requireAdmin();
  const { runDiagnostic } = await import("@/lib/diagnostic");
  const gemini = form.get("gemini") === "on";
  const checks = await runDiagnostic({ gemini });
  await audit(user.id, "admin.diagnostic", null, { gemini, ok: checks.every((c) => c.ok) });
  return { checks, at: new Date().toISOString() };
}

const JobId = z.string().uuid();

/** Reprise ciblée d'une tâche en échec (aucune donnée privée journalisée). */
export async function retryJobAction(form: FormData) {
  const user = await requireAdmin();
  const id = JobId.safeParse(form.get("job_id"));
  if (!id.success) done("Tâche invalide.");
  const { data: settings } = await adminClient().from("app_settings").select("generation_enabled").single();
  if (!settings?.generation_enabled) done("La génération est suspendue : réactivez-la avant de reprendre une tâche.");
  const { requeueJob } = await import("@/lib/admin-jobs");
  const r = await requeueJob(id.data);
  if (r === "not_retryable") done("Cette tâche ne peut pas être reprise (elle n'est plus en échec).");
  if (r === "credits") done("Le compte n'a plus assez de crédits pour relancer cette tâche (ajoutez-en d'abord, motif journalisé).");
  if (r === "quota") done("Le compte a atteint son plafond de rapports : réessayez après sa remise à zéro.");
  await audit(user.id, "job.retry", id.data);
  const { drainQueue } = await import("@/lib/jobs/worker");
  const started = Date.now();
  after(() => drainQueue(`admin-${crypto.randomUUID().slice(0, 8)}`, started + 270_000));
  done("Tâche relancée : elle reprend à sa dernière étape réussie.");
}

/** Annulation ciblée d'une tâche en cours ou en attente. */
export async function cancelJobAction(form: FormData) {
  const user = await requireAdmin();
  const id = JobId.safeParse(form.get("job_id"));
  if (!id.success) done("Tâche invalide.");
  const { cancelJob } = await import("@/lib/admin-jobs");
  const r = await cancelJob(id.data);
  if (r === "none") done("Cette tâche est déjà terminée.");
  await audit(user.id, "job.cancel", id.data, { immediate: r === "cancelled" });
  done(r === "cancelled" ? "Tâche annulée." : "Annulation demandée : la tâche s'arrêtera à sa prochaine étape.");
}

/** Inscriptions publiques (offre gratuite) : ouverture ou fermeture, journalisée. */
export async function setSignupOpen(form: FormData) {
  const user = await requireAdmin();
  const open = form.get("open") === "on";
  const { error } = await adminClient().from("app_settings").update({ signup_open: open, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) done("La modification n'a pas été enregistrée.");
  await audit(user.id, open ? "signup.open" : "signup.close", null);
  done(open ? "Inscriptions ouvertes : chaque nouveau compte reçoit l'offre gratuite." : "Inscriptions fermées : seules les adresses autorisées peuvent se connecter.");
}

/**
 * Crédits ajoutés à la main (§ 20) : motif obligatoire, plafond, lot « compensation » de
 * 12 mois, journal avec opérateur et référence. Jamais une modification directe du solde.
 */
export async function grantCreditsAction(form: FormData) {
  const user = await requireAdmin();
  const email = Email.safeParse(form.get("email"));
  const credits = z.coerce.number().int().min(1).max(2_000).safeParse(form.get("credits"));
  const reason = z.string().trim().min(5).max(200).safeParse(form.get("reason"));
  if (!email.success || !credits.success || !reason.success) done("Adresse, nombre de crédits (1 à 2 000) ou motif (5 caractères au moins) invalide.");
  const db = adminClient();
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const target = list?.users.find((u) => u.email?.toLowerCase() === email.data);
  if (!target) done("Aucun compte avec cette adresse.");
  const ref = `admin:${crypto.randomUUID()}`;
  const expires = new Date(Date.now() + 365 * 24 * 3600_000).toISOString();
  const { error } = await db.rpc("grant_credits", { p_owner: target.id, p_origin: "compensation", p_ref: ref, p_qty: credits.data, p_expires: expires, p_note: reason.data });
  if (error) done("Les crédits n'ont pas été ajoutés.");
  await audit(user.id, "credits.grant", target.id, { credits: credits.data, reason: reason.data, ref });
  done(`${credits.data} crédits ajoutés à ${email.data} (valables 12 mois).`);
}

/** Rapprochement immédiat des commandes en attente (sans attendre le cron). */
export async function reconcileOrdersAction() {
  const user = await requireAdmin();
  const { reconcilePending } = await import("@/lib/billing/purchase");
  const n = await reconcilePending(50).catch(() => -1);
  await audit(user.id, "billing.reconcile", null, { changed: n });
  done(n < 0 ? "Le rapprochement a échoué." : `Rapprochement terminé : ${n} commande(s) mise(s) à jour.`);
}

/** Commande « à vérifier » : validée (si la vente est payée chez Chariow) ou refusée. Journalisé. */
export async function decideOrderAction(form: FormData) {
  const user = await requireAdmin();
  const ref = z.string().regex(/^lmp_[a-z0-9]{20,40}$/).safeParse(form.get("order_ref"));
  const approve = form.get("decision") === "approve";
  if (!ref.success) done("Commande invalide.");
  const { adminDecideIntent } = await import("@/lib/billing/purchase");
  const r = await adminDecideIntent(ref.data, approve);
  await audit(user.id, approve ? "billing.order_approve" : "billing.order_reject", ref.data, { outcome: r });
  done({ approved: "Commande validée : l'avantage est attribué.", rejected: "Commande refusée.", not_paid: "La vente n'est pas payée chez Chariow : rien n'est attribué.", not_found: "Commande introuvable ou déjà traitée." }[r]);
}

/** Achat boutique non rattaché ou à vérifier : rattaché à un compte confirmé, ou refusé. Journalisé. */
export async function decideStorePurchaseAction(form: FormData) {
  const user = await requireAdmin();
  const sale = z.string().regex(/^[A-Za-z0-9_-]{3,100}$/).safeParse(form.get("sale_id"));
  if (!sale.success) done("Vente invalide.");
  const reject = form.get("decision") === "reject";
  const email = reject ? null : Email.safeParse(form.get("email"));
  if (email && !email.success) done("Adresse du compte invalide.");
  const { adminDecideStorePurchase } = await import("@/lib/billing/store");
  const r = await adminDecideStorePurchase(sale.data, email?.success ? email.data : null);
  await audit(user.id, reject ? "billing.store_reject" : "billing.store_attach", sale.data, { outcome: r });
  done({
    approved: "Achat rattaché : l'avantage est attribué.",
    rejected: "Achat refusé.",
    no_account: "Aucun compte confirmé avec cette adresse.",
    not_paid: "La vente n'est pas payée chez Chariow : rien n'est attribué.",
    not_found: "Achat introuvable ou déjà traité.",
  }[r]);
}
