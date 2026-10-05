"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * État d'un exercice non validé, conservé pour l'onglet (sessionStorage) : consulter une
 * annexe puis revenir retrouve la réponse en cours. Lu après le montage (pas d'écart
 * d'hydratation) ; stockage indisponible = état local seulement.
 */
export function useDraft<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {}
  }, [key]);
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        try {
          sessionStorage.setItem(key, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [key],
  );
  return [value, set];
}

/** Réponse validée : le brouillon n'a plus lieu d'être. */
export function clearDrafts(prefix: string) {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(prefix)) sessionStorage.removeItem(k);
    }
  } catch {}
}
