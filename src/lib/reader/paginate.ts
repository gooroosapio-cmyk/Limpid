/**
 * Composition des vues du lecteur (V4, § 7) à partir des hauteurs RÉELLEMENT mesurées des
 * pièces (blocs sémantiques rendus avec leurs polices et dimensions définitives) :
 * - une vue tient dans la hauteur utile ;
 * - un titre reste avec le début de son contenu (pas de titre isolé en bas de vue) ;
 * - les coupures forcées sont respectées (couverture, point de contrôle, annexes) ;
 * - une pièce plus haute que l'écran forme sa propre vue, qui défile : jamais coupée,
 *   jamais masquée, jamais rétrécie.
 */
export interface PieceMetrics {
  /** Hauteur occupée (marges comprises), en pixels CSS. */
  height: number;
  /** Titre : doit rester avec la pièce suivante. */
  keepWithNext?: boolean;
  /** Commence une nouvelle vue. */
  breakBefore?: boolean;
  /** Termine la vue courante. */
  breakAfter?: boolean;
}

export interface View {
  /** Index de la première pièce de la vue. */
  start: number;
  /** Index de la dernière pièce (incluse). */
  end: number;
  /** Hauteur totale des pièces de la vue. */
  height: number;
  /** Vue plus haute que l'écran (une pièce indivisible) : elle défile. */
  oversized: boolean;
}

export function paginate(pieces: PieceMetrics[], available: number): View[] {
  const views: View[] = [];
  if (pieces.length === 0 || available <= 0) return views;
  let start = 0;
  let height = 0;
  const close = (end: number) => {
    const h = pieces.slice(start, end + 1).reduce((n, p) => n + p.height, 0);
    views.push({ start, end, height: h, oversized: h > available + 0.5 });
    start = end + 1;
    height = 0;
  };
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    if (i > start && p.breakBefore) close(i - 1);
    if (i > start && height + p.height > available + 0.5) {
      // Ne pas laisser de titres orphelins en bas de vue : ils passent à la vue suivante.
      let end = i - 1;
      while (end > start && pieces[end]!.keepWithNext) end--;
      close(end);
      // Les titres reportés recommencent la vue suivante.
      i = start;
      height = pieces[i]!.height;
      if (pieces[i]!.breakAfter) close(i);
      continue;
    }
    height += p.height;
    if (p.breakAfter) close(i);
  }
  if (start < pieces.length) close(pieces.length - 1);
  return views;
}

/** Vue qui contient une pièce donnée (reprise de lecture à une ancre). */
export function viewOf(views: View[], pieceIndex: number): number {
  const i = views.findIndex((v) => pieceIndex >= v.start && pieceIndex <= v.end);
  return i < 0 ? 0 : i;
}
