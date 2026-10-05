/** Motifs de « Essayer une autre formulation » (partagés par le lecteur et le moteur). */
export const REFORMULATE_REASONS = ["trop_complique", "trop_court", "trop_long", "pas_concret", "incorrect", "autre"] as const;
export type ReformulateReason = (typeof REFORMULATE_REASONS)[number];
