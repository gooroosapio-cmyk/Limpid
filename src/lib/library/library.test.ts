import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createUserClient: async () => ({}) }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({}) }));

const { whenLabel } = await import("./load");
const { pushRecent } = await import("./folders");

describe("date et heure de la bibliothèque", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  it("aujourd'hui et hier avec l'heure de Paris", () => {
    expect(whenLabel("2026-10-05T12:32:00Z", "fr", "Aujourd'hui", "Hier", now)).toBe("Aujourd'hui · 14:32");
    expect(whenLabel("2026-10-04T07:05:00Z", "fr", "Aujourd'hui", "Hier", now)).toBe("Hier · 09:05");
  });
  it("date courte sinon, année si différente", () => {
    expect(whenLabel("2026-10-01T16:10:00Z", "fr", "A", "H", now)).toMatch(/^1 oct\.? · 18:10$/);
    expect(whenLabel("2025-12-24T09:00:00Z", "en", "Today", "Yesterday", now)).toMatch(/2025 · 10:00$/);
  });
});

describe("recherches récentes", () => {
  it("place la plus récente en tête, sans doublon, 5 au plus", () => {
    expect(pushRecent(["a", "b", "c", "d", "e"], "f")).toEqual(["f", "a", "b", "c", "d"]);
    expect(pushRecent(["Eau", "b"], "eau")).toEqual(["eau", "b"]);
    expect(pushRecent(null, "x")).toEqual(["x"]);
    expect(pushRecent([1, "y"], "x")).toEqual(["x", "y"]);
  });
});
