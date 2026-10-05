import type { Mode } from "@/lib/contracts/schemas";

/**
 * Icônes illustrées des quatre approches (locales, aucun appel IA) : un aplat doux et un
 * tracé à l'encre, en couches légèrement décalées pour un relief discret.
 */
export function ModeIcon({ mode }: { mode: Mode }) {
  return (
    <svg className="mode-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {mode === "tres_simple" && (
        <>
          <path className="mi-soft" d="M24 7c-7.4 0-12.5 5.6-12.5 12.2 0 4.3 2.2 7.2 4.6 9.6 1.4 1.4 2.4 3 2.4 5V36h11v-2.2c0-2 1-3.6 2.4-5 2.4-2.4 4.6-5.3 4.6-9.6C36.5 12.6 31.4 7 24 7Z" />
          <path className="mi-ink" d="M24 8.5c-6.6 0-11 5-11 10.8 0 3.8 1.9 6.3 4.1 8.5 1.6 1.6 2.9 3.6 2.9 6V35h8v-1.2c0-2.4 1.3-4.4 2.9-6 2.2-2.2 4.1-4.7 4.1-8.5 0-5.8-4.4-10.8-11-10.8Z M20 39h8 M21.5 42.5h5 M24 15v5 M21 18h6" />
          <path className="mi-accent" d="M33.5 9.5l2.5-2.5 M37 15h3 M14.5 9.5L12 7 M11 15H8" />
        </>
      )}
      {mode === "claire" && (
        <>
          <path className="mi-soft" d="M6 13c6-2 12-1.5 18 2 6-3.5 12-4 18-2v24c-6-2-12-1.5-18 2-6-3.5-12-4-18-2Z" />
          <path className="mi-ink" d="M7 12.5c5.5-1.8 11.3-1.3 17 2v24c-5.7-3.3-11.5-3.8-17-2Z M41 12.5c-5.5-1.8-11.3-1.3-17 2v24c5.7-3.3 11.5-3.8 17-2Z" />
          <path className="mi-accent" d="M11.5 19.5c3-.6 6-.3 9 1 M11.5 25c3-.6 6-.3 9 1 M27.5 20.5c3-1.3 6-1.6 9-1" />
        </>
      )}
      {mode === "resume" && (
        <>
          <path className="mi-soft" d="M12 6h17l9 9v27H12Z" />
          <path className="mi-ink" d="M11 5h17.5L37 13.5V43H11Z M28 5v9h9 M16 21h16 M16 27h16 M16 33h10" />
          <path className="mi-accent" d="M15.5 20.5h17v1.5h-17Z" />
        </>
      )}
      {mode === "revision" && (
        <>
          <rect className="mi-soft" x="9" y="13" width="24" height="29" rx="3" transform="rotate(-8 21 27.5)" />
          <rect className="mi-ink" x="15" y="8" width="24" height="30" rx="3" />
          <path className="mi-ink" d="M19.5 15h10 M19.5 20h15" />
          <path className="mi-accent" d="M20 28.5l4 4 8.5-9" />
        </>
      )}
    </svg>
  );
}
