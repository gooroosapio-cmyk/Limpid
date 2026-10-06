/** Frise (kit V6) : ordre annoncé (chronologique ou du récit), un événement par entrée. */
export interface EventView {
  date: string;
  title: string;
  body: React.ReactNode;
  refs: React.ReactNode;
}

export function Timeline({ label, orderLabel, intro, refs, events }: { label: string; orderLabel: string; intro: React.ReactNode; refs: React.ReactNode; events: EventView[] }) {
  return (
    <>
      <span className="block-label">{label}</span>
      <p className="v6-intro">{intro} {refs}</p>
      <p className="v6-pill v6-order">{orderLabel}</p>
      <ol className="v6-timeline" aria-label={`${label} · ${orderLabel}`}>
        {events.map((ev, i) => (
          <li key={i} className="v6-event">
            <span className="v6-event-date">{ev.date}</span>
            <h3 className="v6-event-title">{ev.title}</h3>
            <p>{ev.body} {ev.refs}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
