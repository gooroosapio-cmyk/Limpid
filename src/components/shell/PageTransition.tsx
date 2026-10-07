"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

/**
 * Changement d'écran : l'ancien s'efface, le nouveau monte (transition native du navigateur,
 * sans effet si elle n'est pas prise en charge). Indexé sur le chemin : un réglage enregistré
 * ou un rafraîchissement sur le même écran n'anime rien.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition key={pathname} enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
