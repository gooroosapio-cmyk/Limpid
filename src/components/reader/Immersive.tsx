"use client";

import { useEffect } from "react";

/**
 * Lecture plein écran : la coquille de l'application est masquée (CSS) tant que ce
 * composant est affiché ; en quittant la présentation, on sort du plein écran du navigateur.
 */
export function Immersive({ children }: { children: React.ReactNode }) {
  useEffect(
    () => () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    },
    [],
  );
  return <div className="reader-immersive">{children}</div>;
}
