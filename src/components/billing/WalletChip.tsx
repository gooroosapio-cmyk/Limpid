"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { refreshWallet, subscribeWallet, type WalletView } from "./wallet-store";

/** Solde dans l'en-tête : crédits disponibles et offre, lien vers « Mes crédits ». */
export function WalletChip() {
  const t = useT();
  const pathname = usePathname();
  const [w, setW] = useState<WalletView | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(
    () =>
      subscribeWallet((v, off) => {
        setW(v);
        setOffline(off);
      }),
    [],
  );
  useEffect(() => {
    void refreshWallet();
  }, [pathname]);
  useEffect(() => {
    const on = () => void refreshWallet();
    const vis = () => document.visibilityState === "visible" && on();
    window.addEventListener("limpid:wallet", on);
    window.addEventListener("online", on);
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("limpid:wallet", on);
      window.removeEventListener("online", on);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  if (!w) {
    return offline ? (
      <span className="wallet-chip pending" role="status">
        {t.billing.syncPending}
      </span>
    ) : null;
  }
  const plan = w.mode === "topup" ? t.billing.topupMode : (t.billing.plans[w.plan] ?? w.plan);
  return (
    <Link href="/compte/credits" className={`wallet-chip${offline ? " pending" : ""}`} aria-label={t.billing.chipLabel(w.available, plan)}>
      <span className="wallet-n">{w.available.toLocaleString()}</span>
      <span className="wallet-plan" aria-hidden="true">{plan}</span>
    </Link>
  );
}
