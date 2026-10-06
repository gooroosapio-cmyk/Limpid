/** Valeur manquante : tiret visible, texte lu par les lecteurs d'écran (jamais « 0 »). */
export function Missing({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </>
  );
}
