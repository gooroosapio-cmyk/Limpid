"use client";

import { useEffect } from "react";

/**
 * Feuilles du bas glissables (retour lecteur) : sur mobile, toute fenêtre `dialog.sheet` se
 * ferme aussi d'un glissement vers le bas, depuis sa poignée, son en-tête, ou n'importe où
 * quand son contenu est déjà en haut. Le bouton Fermer reste disponible. Un seul écouteur
 * pour toute l'application ; animations réduites respectées.
 */
export function SheetSwipe() {
  useEffect(() => {
    const CLOSE_AT = 90;
    let drag: { sheet: HTMLDialogElement; y0: number; t0: number; dy: number; id: number } | null = null;
    const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const start = (e: PointerEvent) => {
      if (e.pointerType === "mouse" || !e.isPrimary) return;
      const target = e.target as HTMLElement;
      const sheet = target.closest<HTMLDialogElement>("dialog.sheet[open]");
      if (!sheet) return;
      // Pas de glissement depuis un champ ou une zone qui défile horizontalement.
      if (target.closest("input, textarea, select, [data-no-swipe], .table-scroll, .carousel")) return;
      const fromHandle = !!target.closest(".sheet-grip, .sheet-head");
      if (!fromHandle && sheet.scrollTop > 0) return;
      drag = { sheet, y0: e.clientY, t0: performance.now(), dy: 0, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dy = Math.max(0, e.clientY - drag.y0);
      if (drag.dy > 4) {
        drag.sheet.style.transition = "none";
        drag.sheet.style.transform = `translateY(${drag.dy}px)`;
      }
    };
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { sheet, dy, t0 } = drag;
      drag = null;
      const fast = dy > 40 && dy / Math.max(1, performance.now() - t0) > 0.6;
      if (dy > CLOSE_AT || fast) {
        if (reduced()) {
          sheet.style.transform = "";
          sheet.close();
          return;
        }
        sheet.style.transition = "transform 160ms ease-in";
        sheet.style.transform = "translateY(100%)";
        window.setTimeout(() => {
          sheet.close();
          sheet.style.transition = "";
          sheet.style.transform = "";
        }, 160);
      } else if (dy > 0) {
        sheet.style.transition = reduced() ? "" : "transform 160ms ease-out";
        sheet.style.transform = "";
      }
    };
    document.addEventListener("pointerdown", start, { passive: true });
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    return () => {
      document.removeEventListener("pointerdown", start);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
    };
  }, []);
  return null;
}
