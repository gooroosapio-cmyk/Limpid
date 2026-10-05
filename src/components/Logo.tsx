/** Logo d'origine (assets/limpid-logo-original.svg) : livre ouvert et surlignage jaune. Le trait suit le texte (variante nuit). */
export function LogoMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg width={Math.round(size * 1.25)} height={size} viewBox="0 0 40 32" aria-hidden="true" focusable="false" className={className}>
      <rect x="4" y="12" width="22" height="6" rx="1" fill="#F2D94E" />
      <path
        d="M20 7C16 4 10 3.5 3 4.5V27c7-1 13-.5 17 2.5 4-3 10-3.5 17-2.5V4.5C30 3.5 24 4 20 7Zm0 0v22.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="brand">
      <LogoMark />
      <b>limpid</b>
    </span>
  );
}
