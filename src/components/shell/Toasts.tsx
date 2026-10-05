"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

const EVENT = "limpid-toast";
type Toast = { id: number; text: string; tone: "ok" | "error" };

/** Notification flottante, annoncée aux lecteurs d'écran, sans bloquer l'écran (V4, § 15). */
export function toast(text: string, tone: Toast["tone"] = "ok") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { text, tone } }));
}

export function Toaster({ closeLabel }: { closeLabel: string }) {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    let n = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const on = (e: Event) => {
      const { text, tone } = (e as CustomEvent<{ text: string; tone: Toast["tone"] }>).detail;
      const id = ++n;
      setItems((x) => [...x.slice(-2), { id, text, tone }]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setItems((x) => x.filter((i) => i.id !== id));
      }, tone === "error" ? 7000 : 4500);
      timers.add(timer);
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
          <Icon name={i.tone === "ok" ? "check" : "alert"} size={18} />
          <span>{i.text}</span>
          <button type="button" className="ib" aria-label={closeLabel} onClick={() => setItems((x) => x.filter((y) => y.id !== i.id))}>
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
