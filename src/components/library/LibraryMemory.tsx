"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Mémorise l'état de la bibliothèque (dossier, filtre, recherche) : « Fermer » y revient. */
export function LibraryMemory() {
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    try {
      const s = search.toString();
      sessionStorage.setItem("limpid-library-url", s ? `${pathname}?${s}` : pathname);
    } catch {}
  }, [pathname, search]);
  return null;
}
