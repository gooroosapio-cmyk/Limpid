/**
 * Conservation des Limpid (V4, § 7) : gardés jusqu'à leur suppression par l'utilisateur. La
 * purge automatique à 30 jours (décision du 4 octobre 2026) est retirée ; la suppression
 * manuelle reste disponible à tout moment (reports/delete.ts).
 */
import { retention } from "@/lib/config";

const DAY_MS = 86_400_000;

/** Date de suppression automatique, ou null si la conservation est illimitée (0 jour, cas V4). */
export function reportExpiresAt(createdAt: Date, days: number = retention.reportDays): Date | null {
  return days > 0 ? new Date(createdAt.getTime() + days * DAY_MS) : null;
}
