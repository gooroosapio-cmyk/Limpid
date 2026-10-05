/**
 * Notifications réelles (V2.1) : préparation terminée ou interrompue, crédits ajoutés, offre
 * démarrée ; « offre bientôt expirée » est calculée à la lecture (rien de stocké). Une seule
 * notification par fait (référence unique : tâche, vente).
 */
import "server-only";
import { adminClient } from "@/lib/supabase/admin";

export type NotificationKind = "report_ready" | "report_failed" | "credits_added" | "plan_started";

export async function notify(ownerId: string, kind: NotificationKind, ref: string, extra: { reportId?: string | null; data?: Record<string, unknown> } = {}) {
  const { error } = await adminClient()
    .from("notifications")
    .upsert(
      { owner_id: ownerId, kind, ref: ref.slice(0, 140), report_id: extra.reportId ?? null, data: extra.data ?? {} },
      { onConflict: "owner_id,ref", ignoreDuplicates: true },
    );
  if (error) console.error("notify", error.code);
}

export interface NotificationView {
  id: string;
  kind: NotificationKind | "plan_expiring";
  reportId: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  unread: boolean;
}

export async function unreadCount(ownerId: string): Promise<number> {
  const { count } = await adminClient().from("notifications").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).is("read_at", null);
  return count ?? 0;
}

export async function listNotifications(ownerId: string, limit = 50): Promise<NotificationView[]> {
  const { data } = await adminClient()
    .from("notifications")
    .select("id, kind, report_id, data, created_at, read_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((n) => ({
    id: n.id as string,
    kind: n.kind as NotificationKind,
    reportId: (n.report_id as string | null) ?? null,
    data: (n.data as Record<string, unknown>) ?? {},
    createdAt: n.created_at as string,
    unread: !n.read_at,
  }));
}

export async function markAllRead(ownerId: string) {
  await adminClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("owner_id", ownerId).is("read_at", null);
}
