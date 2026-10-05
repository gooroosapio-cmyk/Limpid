/** Livre animé (kit V3) : signe de vie pendant la préparation, sans pourcentage inventé. */
export function LoaderBook() {
  return (
    <div className="loader-book" aria-hidden="true">
      <svg viewBox="0 0 40 32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        <rect className="hl" x="4" y="13" width="14" height="4" rx="1" fill="var(--yellow)" stroke="none" />
        <path d="M20 7c-4-3-9-3-16-2v22c7-1 12-1 16 2 4-3 9-3 16-2V5c-7-1-12-1-16 2Z" />
        <path d="M20 7v22" />
        <path className="leaf" d="M20 7c3-2 7-2.5 12-2v20c-5-.5-9 0-12 2" />
      </svg>
    </div>
  );
}
