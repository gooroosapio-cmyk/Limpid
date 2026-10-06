"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { useT } from "@/lib/i18n/client";
import { parseInstallState, shouldAskInstall, type InstallState } from "@/lib/install-prompt";

const KEY = "limpid-install";
const VISIT = "limpid-visit";

function standalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/**
 * Invitation à installer l'application web : dès la première ouverture, puis selon la règle
 * de fréquence (refus → 3e visite, puis toutes les 2 visites). Navigateurs compatibles : le
 * bouton déclenche l'installation ; iPhone et iPad : la marche à suivre (Partager → Sur
 * l'écran d'accueil). Rien n'est proposé dans l'application déjà installée.
 */
export function InstallPrompt() {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"prompt" | "ios" | null>(null);
  const state = useRef<InstallState | null>(null);

  useEffect(() => {
    let s: InstallState;
    try {
      s = parseInstallState(localStorage.getItem(KEY));
      if (standalone()) s = { ...s, installed: true };
      // Nouvelle visite : première page de la session du navigateur.
      if (!sessionStorage.getItem(VISIT)) {
        sessionStorage.setItem(VISIT, "1");
        s = { ...s, visits: s.visits + 1 };
      }
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      return;
    }
    state.current = s;
    const installed = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...state.current!, installed: true }));
      } catch {}
      dialog.current?.close();
    };
    window.addEventListener("appinstalled", installed);
    if (!shouldAskInstall(s) || sessionStorage.getItem("limpid-install-asked")) return () => window.removeEventListener("appinstalled", installed);
    const show = (m: "prompt" | "ios") => {
      sessionStorage.setItem("limpid-install-asked", "1");
      setMode(m);
      // Laisse la page s'afficher avant d'ouvrir la fenêtre.
      setTimeout(() => dialog.current?.showModal(), 600);
    };
    const onReady = () => show("prompt");
    if (window.__limpidInstall) onReady();
    else if (isIos()) show("ios");
    else window.addEventListener("limpid-installable", onReady, { once: true });
    return () => {
      window.removeEventListener("limpid-installable", onReady);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  function dismiss() {
    const s = state.current;
    if (s) {
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...s, dismissedAt: s.visits }));
      } catch {}
    }
    dialog.current?.close();
  }

  async function install() {
    const evt = window.__limpidInstall;
    if (!evt) return dismiss();
    await evt.prompt().catch(() => undefined);
    const choice = await (evt as unknown as { userChoice?: Promise<{ outcome: string }> }).userChoice?.catch(() => null);
    window.__limpidInstall = undefined;
    if (choice?.outcome === "accepted") {
      try {
        localStorage.setItem(KEY, JSON.stringify({ ...state.current!, installed: true }));
      } catch {}
      dialog.current?.close();
    } else dismiss();
  }

  if (!mode) return null;
  return (
    <dialog ref={dialog} className="sheet center install-sheet" aria-labelledby="install-h" onCancel={dismiss}>
      <div className="sheet-grip" aria-hidden="true" />
      <div className="install-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/limpid-192.png" alt="" width={56} height={56} className="install-icon" />
        <div>
          <h2 id="install-h">{t.pwa.installTitle}</h2>
          <p className="muted small">{t.pwa.installSub}</p>
        </div>
      </div>
      {mode === "ios" ? (
        <ol className="install-steps">
          <li>{t.pwa.iosStep1} <Icon name="share" size={16} /></li>
          <li>{t.pwa.iosStep2}</li>
        </ol>
      ) : (
        <button type="button" className="btn btn-primary btn-block" onClick={install}>{t.pwa.installBtn}</button>
      )}
      <button type="button" className="btn btn-block" onClick={dismiss}>{mode === "ios" ? t.pwa.understood : t.pwa.later}</button>
    </dialog>
  );
}
