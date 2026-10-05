import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({}) }));

import { productCodeFor } from "./chariow";
import { normalizeEmail } from "./store";

describe("achats faits sur la boutique", () => {
  const env = { CHARIOW_PRODUCTS: JSON.stringify({ topup_70: "prd_a", pro_yearly: "prd_b" }) };
  it("retrouve le code Limpid d'un produit Chariow, rien pour un produit hors catalogue", () => {
    expect(productCodeFor("prd_a", env)).toBe("topup_70");
    expect(productCodeFor("prd_b", env)).toBe("pro_yearly");
    expect(productCodeFor("prd_inconnu", env)).toBeNull();
    expect(productCodeFor("prd_a", {})).toBeNull();
  });
  it("adresse comparée sans casse ni espaces", () => {
    expect(normalizeEmail("  Awa.Diallo@Example.COM ")).toBe("awa.diallo@example.com");
  });
});
