"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";

/** Ancre de pièce acceptée dans une adresse (`from`, `a`). */
export const ANCHOR_RE = /^[A-Za-z0-9_-]{1,80}$/;

export const progressKey = (id: string) => `limpid-progress-${id}`;

interface AnnexApi {
  /** Adresse de la page Annexes à une ancre (`glossaire`, `sources`, `src-3`…). */
  href: (hash: string, from?: string | null) => string;
  /** Ouvre la page Annexes ; `from` : pièce de lecture à retrouver au retour. */
  open: (hash: string, from?: string | null) => void;
}

const Ctx = createContext<AnnexApi | null>(null);

/**
 * Accès aux annexes (V5, § 14) : une page continue du même rapport et de la même version,
 * hors du carrousel. L'ancre de lecture part dans l'adresse et dans la progression locale :
 * « Retour au rapport » comme le retour du navigateur retrouvent la même vue. Aucun appel IA.
 */
export function AnnexProvider({
  base,
  progressId,
  children,
}: {
  /** `/rapports/<id>/annexes` (avec `?version=n` pour une ancienne version). */
  base: string;
  progressId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const href = useCallback(
    (hash: string, from?: string | null) => {
      const sep = base.includes("?") ? "&" : "?";
      const f = from && ANCHOR_RE.test(from) ? `${sep}from=${encodeURIComponent(from)}` : "";
      return `${base}${f}#${hash}`;
    },
    [base],
  );
  const open = useCallback(
    (hash: string, from?: string | null) => {
      let anchor = from ?? null;
      try {
        if (anchor && ANCHOR_RE.test(anchor)) localStorage.setItem(progressKey(progressId), anchor);
        else anchor = localStorage.getItem(progressKey(progressId));
      } catch {}
      router.push(href(hash, anchor));
    },
    [href, progressId, router],
  );
  const api = useMemo(() => ({ href, open }), [href, open]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAnnex(): AnnexApi | null {
  return useContext(Ctx);
}

/** Pièce de lecture qui contient un élément (repère de retour). */
export function pieceOf(el: Element | null): string | null {
  return el?.closest<HTMLElement>("[data-piece]")?.id || null;
}
