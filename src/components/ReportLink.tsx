"use client";

import Link from "next/link";

/**
 * Lien vers une présentation : sur téléphone et tablette, la lecture s'ouvre en plein écran
 * (le geste du lecteur autorise la demande ; refus silencieux si le navigateur ne le permet pas).
 */
export function ReportLink({ href, className, immersive = false, children }: { href: string; className?: string; immersive?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        if (!immersive || !document.fullscreenEnabled || document.fullscreenElement) return;
        if (!window.matchMedia("(pointer: coarse)").matches) return;
        document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined);
      }}
    >
      {children}
    </Link>
  );
}
