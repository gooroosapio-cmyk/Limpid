/**
 * Réinitialisation d'un espace de test (console admin, compte de l'administrateur seulement) :
 * rapports et documents supprimés par les chemins habituels (fichiers stockés compris), puis
 * crédits consommés par ces rapports rendus au compte (lot de compensation, 12 mois).
 */
import "server-only";
import { purgeOriginal } from "@/lib/sources/uploads";
import { adminClient } from "@/lib/supabase/admin";
import { deleteReport } from "@/lib/reports/delete";

export async function resetTestSpace(userId: string): Promise<{ reports: number; sources: number; refunded: number }> {
  const db = adminClient();
  const { data: reports } = await db.from("reports").select("id").eq("owner_id", userId).is("deleted_at", null);
  const ids = (reports ?? []).map((r) => r.id as string);
  // Crédits consommés par ces rapports, calculés avant la suppression (le lien est ensuite effacé).
  const { data: spent } = ids.length
    ? await db.from("credit_reservations").select("amount").eq("owner_id", userId).eq("status", "consumed").in("report_id", ids)
    : { data: [] as { amount: number }[] };
  const refunded = (spent ?? []).reduce((n, r) => n + (r.amount as number), 0);
  let deleted = 0;
  for (const id of ids) if ((await deleteReport(userId, id)) !== "not_found") deleted++;
  const { data: sources } = await db.from("sources").select("id, storage_path").eq("owner_id", userId).is("deleted_at", null);
  for (const s of sources ?? []) {
    await db.from("sources").update({ deleted_at: new Date().toISOString() }).eq("id", s.id).eq("owner_id", userId);
    await purgeOriginal(s.id as string, (s.storage_path as string | null) ?? null).catch(() => undefined);
  }
  if (refunded > 0) {
    await db.rpc("grant_credits", {
      p_owner: userId,
      p_origin: "compensation",
      p_ref: `reset:${userId}:${new Date().toISOString().slice(0, 19)}`,
      p_qty: refunded,
      p_expires: new Date(Date.now() + 365 * 24 * 3600_000).toISOString(),
      p_note: "Remboursement des rapports de test supprimés",
    });
  }
  return { reports: deleted, sources: (sources ?? []).length, refunded };
}
