import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Depuis la V5, `reports` et `sources` sont reliés deux fois (reports.source_id et la table
 * report_sources) : une jointure PostgREST non qualifiée échoue (PGRST201) et la page
 * renvoyait 404. Toute jointure entre ces deux tables doit nommer sa relation.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !f.endsWith(".test.ts") ? [p] : [];
  });
}

describe("jointures PostgREST entre reports et sources", () => {
  it("sont toujours qualifiées (sources!… / reports!…)", () => {
    const bad: string[] = [];
    for (const f of files(join(process.cwd(), "src"))) {
      const text = readFileSync(f, "utf8");
      // Requêtes partant de reports ou de sources (les autres tables n'ont qu'un chemin).
      for (const m of text.matchAll(/\.from\(\s*"(reports|sources)"\s*\)\s*\.select\(\s*(["'`])([\s\S]*?)\2/g)) {
        const sel = m[3]!;
        if (/(?<![\w!])(sources|reports)\(/.test(sel)) bad.push(`${f.replace(process.cwd(), "")} : ${sel.slice(0, 80)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
