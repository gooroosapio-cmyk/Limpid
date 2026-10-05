"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { walletChanged } from "./wallet-store";

/**
 * Retour de paiement : tant que la commande attend sa confirmation, la page se revérifie
 * (toutes les 5 s pendant 2 minutes) ; à l'état final, le solde de l'en-tête se met à jour.
 */
export function ReturnWatcher({ pending }: { pending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) {
      walletChanged();
      return;
    }
    let n = 0;
    const id = setInterval(() => {
      if (++n > 24) return clearInterval(id);
      router.refresh();
    }, 5_000);
    return () => clearInterval(id);
  }, [pending, router]);
  return null;
}
