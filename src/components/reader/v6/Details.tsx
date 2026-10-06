/** Détail secondaire repliable (kit V6) : élément natif, développé dans le PDF. */
export function Details({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="v6-details">
      <summary>{summary}</summary>
      <div className="v6-details-body">{children}</div>
    </details>
  );
}
