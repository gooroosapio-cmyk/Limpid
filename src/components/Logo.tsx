/**
 * Logo officiel (public/brand/limpid-logo-*.svg) : livre ouvert, surlignage jaune et
 * mot-symbole vectorisé. Le trait et le mot suivent la couleur du texte (clair ou sombre).
 */
const BOOK = "M5 8c7-2 13-1 19 3 6-4 12-5 19-3v30c-7-2-13-1-19 3-6-4-12-5-19-3V8Z";

function Book() {
  return (
    <>
      <path d={BOOK} fill="none" stroke="currentColor" strokeWidth="3.1" strokeLinejoin="round" />
      <path d="M24 11v30" fill="none" stroke="currentColor" strokeWidth="2.8" />
      <path d="M7 23h14m6 0h8" stroke="#F1D94E" strokeWidth="5" />
    </>
  );
}

/** Emblème seul (livre ouvert). */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false" className={className}>
      <Book />
    </svg>
  );
}

/** Logo complet : emblème et mot-symbole « limpid ». */
export function Wordmark({ height = 30, className }: { height?: number; className?: string }) {
  return (
    <svg width={Math.round((height * 343.6) / 100)} height={height} viewBox="0 0 343.6 100" aria-hidden="true" focusable="false" className={className ? `wordmark ${className}` : "wordmark"}>
      <g transform="translate(0 6) scale(1.8)"><Book /></g>
      <g fill="currentColor">
      <path d="M120.56 17.68H109.36V76H120.56Z" />
      <path d="M142.8 32.8H131.6V76H142.8ZM142.8 17.68H131.6V27.68H142.8Z" />
      <path d="M153.28 32.8V76H164.48V50.08C164.48 44.72 167.36 41.6 172.16 41.6C175.92 41.6 178.24 43.76 178.24 47.2V76H189.44V50.08C189.44 44.8 192.32 41.6 197.12 41.6C200.88 41.6 203.2 43.76 203.2 47.2V76H214.4V45.44C214.4 37.04 209.28 32.08 200.64 32.08C195.12 32.08 191.36 34 188 38.48C185.92 34.4 181.6 32.08 176.24 32.08C171.28 32.08 168.08 33.68 164.4 38.16V32.8Z" />
      <path d="M235.44 32.8H224.24V93.44H235.44V70.88C238.16 75.68 242 77.92 247.44 77.92C257.84 77.92 265.52 68.16 265.52 55.04C265.52 48.96 263.76 42.88 260.88 38.88C258 34.8 252.64 32.08 247.44 32.08C242 32.08 238.16 34.4 235.44 39.2ZM244.88 41.44C250.56 41.44 254.32 46.88 254.32 55.2C254.32 63.12 250.48 68.56 244.88 68.56C239.2 68.56 235.44 63.12 235.44 55.04C235.44 46.88 239.2 41.44 244.88 41.44Z" />
      <path d="M285.04 32.8H273.84V76H285.04ZM285.04 17.68H273.84V27.68H285.04Z" />
      <path d="M323.12 76H334.32V17.68H323.12V38.4C320.32 34.08 316.64 32.08 311.2 32.08C300.88 32.08 293.04 42 293.04 55.04C293.04 60.88 294.8 66.8 297.68 70.96C300.64 75.2 305.92 77.84 311.2 77.84C316.64 77.84 320.32 75.92 323.12 71.6ZM313.68 41.44C319.36 41.44 323.12 46.88 323.12 55.2C323.12 63.04 319.28 68.48 313.68 68.48C308.08 68.48 304.24 62.96 304.24 55.04C304.24 46.96 308.08 41.44 313.68 41.44Z" />
      </g>
    </svg>
  );
}

export function Logo({ height }: { height?: number }) {
  return (
    <span className="brand">
      <Wordmark height={height} />
      <span className="sr-only">Limpid</span>
    </span>
  );
}
