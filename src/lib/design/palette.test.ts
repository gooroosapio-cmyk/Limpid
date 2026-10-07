import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, contrastMatrix, MARK, ROLES, SURFACES, TEXT, TINT } from "./palette";

const css = readFileSync(join(process.cwd(), "src/app/styles/tokens.css"), "utf8");
const pair = (name: string) => {
  const m = css.match(new RegExp(`--${name}: light-dark\\((#[0-9a-f]{6}), (#[0-9a-f]{6})\\);`));
  return m ? { light: m[1], dark: m[2] } : null;
};

describe("palette", () => {
  it("contraste WCAG connu", () => {
    expect(contrast("#000000", "#ffffff")).toBe(21);
    expect(contrast("#ffffff", "#ffffff")).toBe(1);
  });

  it("tokens.css et palette.ts portent les mêmes valeurs", () => {
    for (const [k, v] of Object.entries(SURFACES)) expect(pair(k), k).toEqual(v);
    for (const [k, v] of Object.entries(TEXT)) expect(pair(k), k).toEqual(v);
    for (const [k, v] of Object.entries(ROLES)) expect(pair(`role-${k}`), k).toEqual(v);
    expect(css).toContain(`color-mix(in srgb, ${ROLES.notion.light} ${TINT.light * 100}%`);
    expect(css).toContain(`color-mix(in srgb, ${ROLES.notion.dark} ${TINT.dark * 100}%`);
    expect(css).toContain(`--mark: light-dark(rgb(242 217 78 / ${MARK.light * 100}%), rgb(242 217 78 / ${MARK.dark * 100}%))`);
  });

  it("tout texte de la charte atteint 4,5:1 en clair et en sombre", () => {
    const weak = contrastMatrix().filter((r) => r.ratio < 4.5);
    expect(weak).toEqual([]);
  });
});
