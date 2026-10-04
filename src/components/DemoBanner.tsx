import { isDemoMode } from "@/lib/config";
import { fr } from "@/lib/i18n/fr";

/** Bandeau affiché tant qu'aucun fournisseur IA n'est configuré (aucune fausse génération). */
export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <p className="notice notice-warn" role="status">
      <span className="badge badge-demo">{fr.demo.badge}</span> {fr.demo.banner}
    </p>
  );
}
