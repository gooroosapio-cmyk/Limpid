/**
 * Banque de couvertures décoratives (V2) : papier, matière minérale, verre, botanique… Elles
 * habillent la bibliothèque et ne remplacent jamais une illustration pédagogique. Sans image
 * fournie, un dégradé de la même famille est affiché (aucune requête vers un fichier absent).
 */
export const COVERS = ["papier", "mineral", "verre", "botanique", "lumiere", "eau", "pierre", "encre", "sable", "feuille", "brume", "ambre"] as const;
export type CoverId = (typeof COVERS)[number];

/** Couvertures dont l'image est présente dans public/covers/<id>.webp (à compléter à la livraison). */
export const COVER_IMAGES: ReadonlySet<CoverId> = new Set<CoverId>([]);

/** Dégradé de secours (couleurs de la famille, lisibles sous le texte clair). */
export const COVER_TONES: Record<CoverId, [string, string, string]> = {
  papier: ["#2c3a31", "#1a221d", "#c9c3a8"],
  mineral: ["#3b3125", "#1d1915", "#d8b77a"],
  verre: ["#2a3d36", "#151d1a", "#a9c9b7"],
  botanique: ["#26402c", "#141d16", "#9fc58a"],
  lumiere: ["#4a3f1c", "#1d1a10", "#f1d94e"],
  eau: ["#22383c", "#121b1d", "#8fc3c9"],
  pierre: ["#383632", "#1a1917", "#bdb6a6"],
  encre: ["#25283a", "#13141c", "#a8acd6"],
  sable: ["#4a3b27", "#1f1a12", "#e2c48f"],
  feuille: ["#2f4126", "#161f12", "#b9d48a"],
  brume: ["#323a37", "#181c1a", "#cfd8d2"],
  ambre: ["#4d3216", "#20160b", "#f0b45c"],
};

export function isCoverId(v: unknown): v is CoverId {
  return typeof v === "string" && (COVERS as readonly string[]).includes(v);
}

/** Couverture d'un Limpid : celle choisie, sinon une couverture stable tirée de son identifiant. */
export function coverFor(reportId: string, chosen: string | null | undefined): CoverId {
  if (isCoverId(chosen)) return chosen;
  let h = 0;
  for (let i = 0; i < reportId.length; i++) h = (h * 31 + reportId.charCodeAt(i)) >>> 0;
  return COVERS[h % COVERS.length]!;
}

export interface CoverView {
  id: CoverId;
  image: string | null;
  tones: [string, string, string];
}

export function coverView(id: CoverId): CoverView {
  return { id, image: COVER_IMAGES.has(id) ? `/covers/${id}.webp` : null, tones: COVER_TONES[id] };
}
