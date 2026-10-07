import "server-only";
import { cache } from "react";
import { adminClient, isAdminConfigured } from "@/lib/supabase/admin";

/**
 * Interrupteur administrateur du lecteur V3 (projections). Faux tant que la migration n'est
 * pas appliquée ou en cas d'erreur : le lecteur actuel reste la référence.
 */
export const readerV3Enabled = cache(async (): Promise<boolean> => {
  if (!isAdminConfigured()) return false;
  try {
    const { data, error } = await adminClient().from("app_settings").select("reader_v3_enabled").single();
    if (error) return false;
    return (data as { reader_v3_enabled?: unknown } | null)?.reader_v3_enabled === true;
  } catch {
    return false;
  }
});
