"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { markNavigationEnd, reportMetric } from "@/lib/perf/client";

/** Web Vitals réels (LCP, INP, CLS, FCP, TTFB) et fin des navigations internes. */
const seen = new Set<string>();

export function WebVitals() {
  const pathname = usePathname();
  useReportWebVitals((m) => {
    // Une valeur par mesure (le rappel peut être enregistré deux fois en développement).
    const key = `${m.name}:${m.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    const name = m.name.toLowerCase();
    if (!["lcp", "inp", "cls", "fcp", "ttfb"].includes(name)) return;
    // CLS est un score sans unité : stocké × 1000 (0,1 → 100).
    reportMetric(`vital.${name}`, name === "cls" ? m.value * 1000 : m.value);
  });
  useEffect(() => {
    markNavigationEnd(pathname);
  }, [pathname]);
  return null;
}
