"use client";

import { toast } from "@/components/shell/Toasts";
import type { Dict } from "@/lib/i18n";

const inFlight = new Set<string>();

function fileName(disposition: string | null): string {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? "");
  if (star) return decodeURIComponent(star[1]!);
  const plain = /filename="?([^";]+)"?/i.exec(disposition ?? "");
  return plain?.[1] ?? "limpid.pdf";
}

/**
 * Téléchargement d'un PDF (V4, § 8) : « Préparation du PDF… » tout de suite, puis
 * « Téléchargement lancé » une fois le fichier reçu et remis au navigateur (jamais
 * « enregistré »). Erreur : message persistant avec Réessayer. Un second clic pendant la
 * préparation ne relance rien.
 */
export async function downloadPdf(href: string, t: Dict): Promise<void> {
  const p = t.v4.pdf;
  if (inFlight.has(href)) return;
  inFlight.add(href);
  const key = `pdf:${href}`;
  toast(p.preparing, "pending", undefined, { key, duration: 0 });
  try {
    const res = await fetch(href, { credentials: "same-origin" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName(res.headers.get("content-disposition"));
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast(p.started, "ok", undefined, { key, duration: 3000 });
  } catch {
    toast(p.failed, "error", { label: p.retry, run: () => void downloadPdf(href, t) }, { key, duration: 0 });
  } finally {
    inFlight.delete(href);
  }
}
