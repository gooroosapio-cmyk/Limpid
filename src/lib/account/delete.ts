/**
 * Suppression d'un compte et de toutes ses données (payload 1, § 6) : rapports marqués
 * supprimés d'abord (aucune écriture tardive du worker), tâches annulées, fichiers privés
 * effacés, puis lignes, puis l'utilisateur d'authentification (les tables restantes
 * suivent par cascade). Seul un compte rendu sans contenu est conservé.
 */
import "server-only";
import { adminClient } from "@/lib/supabase/admin";

const BUCKETS = ["sources", "exports"] as const;

/** Efface tous les objets d'un préfixe de bucket (par pages). */
async function removePrefix(bucket: string, prefix: string): Promise<boolean> {
  const storage = adminClient().storage.from(bucket);
  for (let round = 0; round < 50; round++) {
    const { data, error } = await storage.list(prefix, { limit: 100 });
    if (error) return false;
    if (!data?.length) return true;
    const removed = await storage.remove(data.map((o) => `${prefix}/${o.name}`));
    if (removed.error) return false;
  }
  return false;
}

export async function deleteAccount(userId: string): Promise<{ ok: boolean; steps: Record<string, boolean> }> {
  const db = adminClient();
  const now = new Date().toISOString();
  const steps: Record<string, boolean> = {};

  steps.reports_marked = !(await db.from("reports").update({ deleted_at: now }).eq("owner_id", userId).is("deleted_at", null)).error;
  steps.jobs_cancelled = !(await db.from("jobs").update({ cancel_requested: true }).eq("owner_id", userId)).error;

  // Fichiers : chemins connus en base, puis tout ce qui reste sous le préfixe du compte.
  const { data: files } = await db.from("sources").select("storage_path").eq("owner_id", userId).not("storage_path", "is", null);
  const known = (files ?? []).map((f) => f.storage_path as string);
  steps.files_known = known.length === 0 || !(await db.storage.from("sources").remove(known)).error;
  for (const b of BUCKETS) steps[`files_${b}`] = await removePrefix(b, userId);

  for (const table of ["comprehension_answers", "report_quizzes", "exports", "reports", "sources", "reader_preferences"] as const) {
    steps[`rows_${table}`] = !(await db.from(table).delete().eq("owner_id", userId)).error;
  }
  // Profil, journal de consommation et demandes restantes : supprimés en cascade avec l'utilisateur.
  steps.auth_user = !(await db.auth.admin.deleteUser(userId)).error;

  const ok = Object.values(steps).every(Boolean);
  await db.from("audit_log").insert({ actor_id: userId, action: "account.delete", target_kind: "account", target_id: null, meta: steps });
  return { ok, steps };
}
