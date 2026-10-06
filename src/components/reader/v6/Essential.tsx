/** « L'essentiel » du chapitre (kit V6) : quelques puces en tête du corps du chapitre. */
export function Essential({ title, items }: { title: string; items: React.ReactNode[] }) {
  return (
    <>
      <p className="v6-essential-title">{title}</p>
      <ul>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </>
  );
}
