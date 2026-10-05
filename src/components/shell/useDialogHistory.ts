"use client";

import { useEffect } from "react";

/**
 * Le bouton Retour du téléphone ou du navigateur ferme d'abord le panneau ouvert, avant de
 * quitter la page. Une entrée d'historique est ajoutée à l'ouverture et retirée à la fermeture.
 */
export function useDialogHistory(ref: React.RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    let pushed = false;
    const mo = new MutationObserver(() => {
      if (d.open && !pushed) {
        history.pushState({ ...(history.state ?? {}), limpidPanel: true }, "");
        pushed = true;
      }
    });
    mo.observe(d, { attributes: true, attributeFilter: ["open"] });
    const onPop = () => {
      if (pushed && d.open) {
        pushed = false;
        d.close();
      } else pushed = false;
    };
    const onClose = () => {
      if (pushed) {
        pushed = false;
        history.back();
      }
    };
    window.addEventListener("popstate", onPop);
    d.addEventListener("close", onClose);
    return () => {
      mo.disconnect();
      window.removeEventListener("popstate", onPop);
      d.removeEventListener("close", onClose);
    };
  }, [ref]);
}
