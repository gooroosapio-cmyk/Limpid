"use client";

import { createContext, useContext } from "react";

export interface ReaderApi {
  reportId: string | null;
  versionId: string | null;
  /** Suspend le carrousel (quiz en cours : aucun geste ne change de page). */
  suspend: (on: boolean) => void;
  /** Va à la vue qui suit une pièce (fin d'un point de contrôle). */
  continueAfter: (pieceId: string) => void;
  /** Va à une pièce (sommaire, notion à revoir). */
  goTo: (pieceId: string) => void;
  openBilan: () => void;
  openReformulate: () => void;
}

export const ReaderCtx = createContext<ReaderApi>({
  reportId: null,
  versionId: null,
  suspend: () => {},
  continueAfter: () => {},
  goTo: () => {},
  openBilan: () => {},
  openReformulate: () => {},
});

export function useReader(): ReaderApi {
  return useContext(ReaderCtx);
}
