// Mesure de la navigation interne (prompt « Fluidité », § 1) : début d'une transition de route.
import { markNavigationStart } from "@/lib/perf/client";

export function onRouterTransitionStart(url: string) {
  markNavigationStart(url);
}
