/**
 * Suppression complète d'un rapport et de sa source (payload 1 § 6) : marquage d'abord
 * (bloque toute écriture tardive du worker), annulation des tâches, puis effacement.
 */
import "server-only";
import { adminClient } from "@/lib/supabase/admin";

export async function deleteReport(ownerId: string, reportId: string): Promise<"done" | "partial" | "not_found"> {
  const db = adminClient();
  const { data: report } = await db
    .from("reports")
    .select("id, source_id")
    .eq("id", reportId)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!report) return "not_found";

  const request = await db
    .from("deletion_requests")
    .insert({ owner_id: ownerId, target_kind: "report", target_id: reportId })
    .select("id")
    .single();

  await db.from("reports").update({ deleted_at: new Date().toISOString() }).eq("id", reportId);
  await db.from("jobs").update({ cancel_requested: true }).eq("report_id", reportId);

  const steps: Record<string, boolean> = {};
  // Fichiers privés éventuels (exports, original) : effacés avant les lignes qui les référencent.
  const { data: exports } = await db.from("exports").select("storage_path").not("storage_path", "is", null)
    .in("report_version_id", (await db.from("report_versions").select("id").eq("report_id", reportId)).data?.map((v) => v.id) ?? []);
  const exportPaths = (exports ?? []).map((e) => e.storage_path as string);
  steps.exports_files = exportPaths.length === 0 || !(await db.storage.from("exports").remove(exportPaths)).error;
  // Illustrations stockées (crédits et fichiers) : effacées avec le rapport.
  const { data: assets } = await db.from("visual_assets").select("storage_path").eq("report_id", reportId).not("storage_path", "is", null);
  const assetPaths = (assets ?? []).map((x) => x.storage_path as string);
  steps.asset_files = assetPaths.length === 0 || !(await db.storage.from("exports").remove(assetPaths)).error;

  // Documents du Limpid (un ou plusieurs) : effacés, sauf s'ils servent encore un autre Limpid.
  const { data: set } = await db.from("report_sources").select("source_id").eq("report_id", reportId);
  const sourceIds = [...new Set([...(set ?? []).map((r) => r.source_id as string), ...(report.source_id ? [report.source_id] : [])])];
  for (const sourceId of sourceIds) {
    const [{ data: other }, { data: otherLegacy }] = await Promise.all([
      db.from("report_sources").select("report_id, reports!inner(deleted_at)").eq("source_id", sourceId).neq("report_id", reportId).is("reports.deleted_at", null).limit(1).maybeSingle(),
      db.from("reports").select("id").eq("source_id", sourceId).neq("id", reportId).is("deleted_at", null).limit(1).maybeSingle(),
    ]);
    if (other || otherLegacy) continue;
    const { data: src } = await db.from("sources").select("storage_path").eq("id", sourceId).maybeSingle();
    const fileOk = !src?.storage_path || !(await db.storage.from("sources").remove([src.storage_path])).error;
    // Cascade : segments, preuves, objets de connaissance.
    const rowsOk = !(await db.from("sources").delete().eq("id", sourceId).eq("owner_id", ownerId)).error;
    steps.source_file = (steps.source_file ?? true) && fileOk;
    steps.source_rows = (steps.source_rows ?? true) && rowsOk;
  }
  // Cascade : versions, tâches, exports.
  steps.report_rows = !(await db.from("reports").delete().eq("id", reportId).eq("owner_id", ownerId)).error;

  const ok = Object.values(steps).every(Boolean);
  if (request.data) {
    await db
      .from("deletion_requests")
      .update({ status: ok ? "done" : "partial", result: steps, completed_at: new Date().toISOString() })
      .eq("id", request.data.id);
  }
  await db.from("audit_log").insert({ actor_id: ownerId, action: "report.delete", target_kind: "report", target_id: reportId, meta: steps });
  return ok ? "done" : "partial";
}
