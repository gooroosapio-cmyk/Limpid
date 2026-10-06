import { Missing } from "./Missing";

/**
 * Tableau comparatif (kit V6) : vrai tableau avec en-têtes, défilement horizontal dans son
 * propre cadre sur mobile ; cellule vide = valeur manquante (« — »), jamais zéro.
 */
export function Comparison({
  label,
  scrollLabel,
  missing,
  intro,
  refs,
  columns,
  rows,
}: {
  label: string;
  scrollLabel: string;
  missing: string;
  intro: React.ReactNode;
  refs: React.ReactNode;
  columns: string[];
  rows: { cells: string[]; refs: React.ReactNode }[];
}) {
  return (
    <>
      <span className="block-label">{label}</span>
      <p className="v6-intro">{intro} {refs}</p>
      {/* Région focalisable : le tableau défile au clavier sans faire défiler la page. */}
      <div className="v6-table-wrap" role="region" aria-label={`${label} · ${scrollLabel}`} tabIndex={0}>
        <table className="v6-table">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} scope="col">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {columns.map((_, ci) => {
                  const v = r.cells[ci]?.trim() ?? "";
                  const content = v ? v : <Missing label={missing} />;
                  const last = ci === columns.length - 1;
                  return ci === 0 ? (
                    <th key={ci} scope="row">{content}{last && <> {r.refs}</>}</th>
                  ) : (
                    <td key={ci}>{content}{last && <> {r.refs}</>}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
