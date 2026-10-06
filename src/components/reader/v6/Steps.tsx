/** Étapes d'une procédure (kit V6) : liste numérotée, ordre obligatoire conservé. */
export interface StepView {
  title: string;
  body: React.ReactNode;
  refs: React.ReactNode;
}

export function Steps({ label, intro, refs, items }: { label: string; intro: React.ReactNode; refs: React.ReactNode; items: StepView[] }) {
  return (
    <>
      <span className="block-label">{label}</span>
      <p className="v6-intro">{intro} {refs}</p>
      <ol className="v6-steps">
        {items.map((it, i) => (
          <li key={i} className="v6-step">
            <span className="v6-step-n" aria-hidden="true">{i + 1}</span>
            <div className="v6-step-body">
              <h3 className="v6-step-title">{it.title}</h3>
              <p>{it.body} {it.refs}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
