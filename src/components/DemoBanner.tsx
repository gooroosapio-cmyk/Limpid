import { isDemoMode } from "@/lib/config";
import { getT } from "@/lib/i18n/server";

/** Bandeau affiché tant qu'aucun fournisseur IA n'est configuré (aucune fausse génération). */
export async function DemoBanner() {
  const t = await getT();
  if (!isDemoMode()) return null;
  return (
    <p className="notice notice-warn" role="status">
      <span className="badge badge-demo">{t.demo.badge}</span> {t.demo.banner}
    </p>
  );
}
