"use client";

import { useEffect } from "react";

/** Hauteur perdue au-delà de laquelle on considère le clavier virtuel ouvert (CSS px). */
const KEYBOARD_MIN = 120;

/**
 * Clavier ouvert = l'écran visible a perdu une hauteur notable ET un champ éditable a le focus,
 * sans zoom (un zoom réduit aussi la hauteur visible). Un champ resté actif après fermeture du
 * clavier ne masque donc plus les barres. Pure, pour les tests.
 */
export function keyboardOpen(input: { layoutHeight: number; viewportHeight: number; scale: number; editableFocused: boolean }): boolean {
  if (!input.editableFocused) return false;
  if (Math.abs(input.scale - 1) > 0.01) return false;
  return input.layoutHeight - input.viewportHeight > KEYBOARD_MIN;
}

function editable(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    const nonText = ["button", "checkbox", "radio", "submit", "reset", "range", "color", "file", "image", "hidden"];
    return !nonText.includes(el.type) && !el.readOnly && !el.disabled;
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * Pose data-keyboard="open" sur <html> quand le clavier virtuel est ouvert (visualViewport),
 * et le retire à sa fermeture, rotation ou retour dans l'application. Sans visualViewport :
 * jamais masqué (les barres restent visibles plutôt que de disparaître à tort).
 */
export function useKeyboardState() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    if (!vv) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const open = keyboardOpen({
          layoutHeight: window.innerHeight,
          viewportHeight: vv.height,
          scale: vv.scale,
          editableFocused: editable(document.activeElement),
        });
        if (open) root.dataset.keyboard = "open";
        else delete root.dataset.keyboard;
      });
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", update);
      document.removeEventListener("visibilitychange", update);
      delete root.dataset.keyboard;
    };
  }, []);
}
