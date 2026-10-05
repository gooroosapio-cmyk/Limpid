"use client";

/**
 * État du solde partagé par l'en-tête et les écrans (§ 8) : une seule source, le serveur.
 * Rafraîchi au montage, au retour sur l'onglet, après une action (événement
 * « limpid:wallet ») et, tant que des crédits sont réservés, à intervalle court.
 */
export interface WalletView {
  available: number;
  reserved: number;
  plan: string;
  mode: "free" | "topup" | "subscription";
  next_grant: { at: string; credits: number } | null;
  quotas: { day: { used: number; limit: number; resetAt: string }; week: { used: number; limit: number; resetAt: string } } | null;
  at: string;
}

type Listener = (w: WalletView | null, offline: boolean) => void;
let current: WalletView | null = null;
let offline = false;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;

function emit() {
  for (const l of listeners) l(current, offline);
}

export function refreshWallet(): Promise<void> {
  inflight ??= fetch("/api/wallet", { cache: "no-store" })
    .then(async (r) => {
      if (r.status === 401) {
        current = null;
        offline = false;
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const w = (await r.json()) as WalletView;
      // Une réponse plus ancienne que l'état affiché est ignorée.
      if (!current || w.at >= current.at) current = w;
      offline = false;
    })
    .catch(() => {
      offline = true;
    })
    .finally(() => {
      inflight = null;
      emit();
      schedule();
    });
  return inflight;
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  // Suivi rapproché seulement pendant une opération en attente ; arrêt à l'état terminal.
  if (current && current.reserved > 0 && listeners.size > 0 && document.visibilityState === "visible") {
    timer = setTimeout(() => void refreshWallet(), 4_000);
  }
}

export function subscribeWallet(l: Listener): () => void {
  listeners.add(l);
  l(current, offline);
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && timer) clearTimeout(timer);
  };
}

/** À appeler après une action qui réserve ou rend des crédits. */
export function walletChanged() {
  window.dispatchEvent(new Event("limpid:wallet"));
}

/** Déconnexion : rien de l'ancien compte ne reste affiché. */
export function clearWallet() {
  current = null;
  emit();
}
