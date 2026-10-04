/**
 * Données des visuels, validées par type avant rendu (payload 2, § 6).
 * Le modèle ne produit jamais de SVG : le moteur dessine à partir de ces données.
 */
import { z } from "zod";

export const FlowData = z.strictObject({
  steps: z
    .array(z.strictObject({ label: z.string().trim().min(1).max(40), claim_id: z.string().max(80) }))
    .min(2)
    .max(8),
  cyclic: z.boolean(),
});
export type FlowData = z.infer<typeof FlowData>;
