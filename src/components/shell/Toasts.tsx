"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

const EVENT = "limpid-toast";
type ToastAction = { label: string; run: () => void };
type Toast = { id: number; text: string; tone: "ok" | "error" | "pending"; action?: ToastAction; key?: string };
/** key : remplace le message de même clé (un seul état visible) ; duration 0 : reste affiché. */
type ToastOptions = { key?: string; duration?: number };

/** Notification flottante, annoncée aux lecteurs d'écran, sans bloquer l'écran (V4, § 15). */
export function toast(text: string, tone: Toast["tone"] = "ok", action?: ToastAction, options: ToastOptions = {}) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { text, tone, action, ...options } }));
}

export function Toaster({ closeLabel }: { closeLabel: string }) {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const on = (e: Event) => {
      const { text, tone, action, key, duration } = (e as CustomEvent<{ text: string; tone: Toast["tone"]; action?: ToastAction } & ToastOptions>).detail;
      const id = ++n;
      setItems((x) => [...x.filter((i) => !key || i.key !== key).slice(-2), { id, text, tone, action, key }]);
      const ms = duration ?? (tone === "error" || action ? 8000 : 4500);
      if (ms > 0) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          setItems((x) => x.filter((i) => i.id !== id));
        }, ms);
        timers.add(timer);
      }
    };
    window.addEventListener(EVENT, on);
    return () => {
      window.removeEventListener(EVENT, on);
      timers.forEach(clearTimeout);
    };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className={`toast toast-${i.tone}`}>
          <Icon name={i.tone === "ok" ? "check" : i.tone === "pending" ? "hourglass" : "alert"} size={18} />
          <span>{i.text}</span>
          {i.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                setItems((x) => x.filter((y) => y.id !== i.id));
                i.action!.run();
              }}
            >
              {i.action.label}
            </button>
          )}
          <button type="button" className="ib" aria-label={closeLabel} onClick={() => setItems((x) => x.filter((y) => y.id !== i.id))}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
