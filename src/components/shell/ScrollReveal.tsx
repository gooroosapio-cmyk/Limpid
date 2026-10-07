"use client";

import { useEffect } from "react";

/** Blocs révélés à l'entrée dans l'écran (jamais dans le lecteur : on n'anime pas la lecture). */
const TARGETS = [
  "[data-reveal]",
  ".limpid-grid > li",
  ".limpid-list > li",
  ".folder-tiles > li",
  ".lib-section",
  ".home-resume",
  ".plan-current",
  ".plan-further",
  ".plan-details",
].join(",");

function reduced() {
  return document.documentElement.dataset.motion === "reduit" || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Révélation au défilement : fondu et montée de 12 px, une fois par élément. Sans JavaScript
 * ou en mouvement réduit, tout reste visible (la classe html.reveal-on n'est jamais posée).
 */
export function ScrollReveal() {
  useEffect(() => {
    if (reduced() || !("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    root.classList.add("reveal-on");
    const seen = new WeakSet<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        let i = 0;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          // Cascade courte : 40 ms d'écart, quatre éléments au plus par lot.
          el.style.setProperty("--reveal-delay", `${Math.min(i++, 4) * 40}ms`);
          el.classList.add("is-revealed");
          io.unobserve(el);
          // Ensuite, plus aucune trace : ni transform ni transition propres à la révélation.
          window.setTimeout(() => {
            el.classList.remove("reveal", "is-revealed");
            el.style.removeProperty("--reveal-delay");
          }, 700);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    const scan = () => {
      document.querySelectorAll(TARGETS).forEach((el) => {
        if (seen.has(el) || el.closest(".reader, .limpid-reader, [data-piece]")) return;
        seen.add(el);
        el.classList.add("reveal");
        io.observe(el);
      });
    };
    scan();
    // Nouveaux blocs (navigation, chargement progressif) : observés à leur arrivée.
    let frame = 0;
    const mo = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(scan);
    });
    mo.observe(document.getElementById("contenu") ?? document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      io.disconnect();
      root.classList.remove("reveal-on");
    };
  }, []);
  return null;
}
