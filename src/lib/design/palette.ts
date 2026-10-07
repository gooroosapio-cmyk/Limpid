/** Palette Limpid (miroir de src/app/styles/tokens.css, vérifié par palette.test.ts) et contrastes WCAG. */

export type Pair = { light: string; dark: string };

export const SURFACES = {
  bg: { light: "#f7f6ef", dark: "#101813" },
  surface: { light: "#ffffff", dark: "#1b2720" },
  elevated: { light: "#eceee8", dark: "#25342a" },
} satisfies Record<string, Pair>;

export const TEXT = {
  ink: { light: "#18231d", dark: "#f5f3e9" },
  muted: { light: "#506057", dark: "#b9c7bc" },
} satisfies Record<string, Pair>;

export type RoleId = "notion" | "alert" | "success" | "example";

export const ROLES: Record<RoleId, Pair> = {
  notion: { light: "#2b5b88", dark: "#9cc3ea" },
  alert: { light: "#a3303a", dark: "#ffafb3" },
  success: { light: "#23633e", dark: "#8fd1a6" },
  example: { light: "#5f4a86", dark: "#d3bdec" },
};

/** Opacité des teintes de rôle et du marqueur jaune, par thème. */
export const TINT = { light: 0.1, dark: 0.16 };
export const MARK = { color: "#f2d94e", light: 0.42, dark: 0.26 };

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
};
const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const blend = ([r, g, b]: Rgb, [ur, ug, ub]: Rgb, a: number): Rgb => [r * a + ur * (1 - a), g * a + ug * (1 - a), b * a + ub * (1 - a)];

function ratio(a: Rgb, b: Rgb): number {
  const x = Math.max(luminance(a), luminance(b));
  const y = Math.min(luminance(a), luminance(b));
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

/** Contraste WCAG entre deux couleurs hexadécimales (1 à 21). */
export function contrast(fg: string, bg: string): number {
  return ratio(rgb(fg), rgb(bg));
}

/** Fond d'une teinte de rôle (ou du marqueur) posée sur le fond de page. */
export function tintBackground(color: string, mode: keyof Pair, alpha: number): string {
  const c = blend(rgb(color), rgb(SURFACES.bg[mode]), alpha);
  return `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

export type ContrastRow = { label: string; mode: keyof Pair; ratio: number };

/** Tous les couples texte/fond de la charte, à vérifier ≥ 4,5:1. */
export function contrastMatrix(): ContrastRow[] {
  const rows: ContrastRow[] = [];
  for (const mode of ["light", "dark"] as const) {
    for (const [sName, s] of Object.entries(SURFACES)) {
      for (const [tName, t] of Object.entries({ ...TEXT, ...ROLES })) {
        rows.push({ label: `${tName} / ${sName}`, mode, ratio: contrast(t[mode], s[mode]) });
      }
    }
    for (const [rName, r] of Object.entries(ROLES)) {
      const bg = tintBackground(r[mode], mode, TINT[mode]);
      rows.push({ label: `ink / tint-${rName}`, mode, ratio: contrast(TEXT.ink[mode], bg) });
      rows.push({ label: `${rName} / tint-${rName}`, mode, ratio: contrast(r[mode], bg) });
    }
    rows.push({ label: "ink / mark", mode, ratio: contrast(TEXT.ink[mode], tintBackground(MARK.color, mode, MARK[mode])) });
  }
  return rows;
}
