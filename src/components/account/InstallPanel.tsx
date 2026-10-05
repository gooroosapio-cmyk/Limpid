"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { fr } from "@/lib/i18n/fr";

/** Installation : bouton natif seulement s'il est proposé ; sinon, les étapes du navigateur. */
export function InstallPanel() {
  const [state, setState] = useState<"checking" | "installed" | "prompt" | "ios" | "other" | "done">("checking");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return setState("installed");
    if (window.__limpidInstall) return setState("prompt");
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setState(ios ? "ios" : "other");
    const on = () => setState("prompt");
    window.addEventListener("limpid-installable", on);
    return () => window.removeEventListener("limpid-installable", on);
  }, []);

  if (state === "checking") return <div className="skeleton skeleton-row" aria-hidden="true" />;
  if (state === "installed" || state === "done")
    return <p className="notice notice-ok" role="status">{state === "done" ? fr.pwa.installDone : fr.pwa.installed}</p>;
  if (state === "prompt")
    return (
      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={async () => {
          const p = window.__limpidInstall;
          window.__limpidInstall = undefined;
          await p?.prompt().catch(() => undefined);
          setState("done");
        }}
      >
        <Icon name="download" /> {fr.pwa.installButton}
      </button>
    );
  if (state === "ios")
    return (
      <section className="card" aria-labelledby="ios-h">
        <h2 id="ios-h" className="small">{fr.pwa.iosTitle}</h2>
        <ol className="install-steps">{fr.pwa.iosSteps.map((s) => <li key={s}>{s}</li>)}</ol>
      </section>
    );
  return (
    <section className="card" aria-labelledby="other-h">
      <h2 id="other-h" className="small">{fr.pwa.otherTitle}</h2>
      <p>{fr.pwa.otherText}</p>
    </section>
  );
}
