/**
 * Icônes du kit Limpid V3 (assets/limpid-icons.svg), en composants : trait 1,7, coins arrondis,
 * couleur héritée du texte. Toujours décoratives ou accompagnées d'un libellé.
 */
const PATHS = {
  "learning": (
    <><path d="m2 8 10-5 10 5-10 5Z M6 10v7q6 5 12 0v-7M22 8v9" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "quiz-v4": (
    <><rect x="4" y="3" width="16" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.75"/><path d="m7 9 2 2 3-4M14 9h3M7 15h2M12 15h5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "folder": (
    <><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"/></>
  ),
  "folder-plus": (
    <><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z M12 11v6 M9 14h6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "hourglass": (
    <><path d="M7 3h10M7 21h10M8 3v3.5a4 4 0 0 0 1.6 3.2L12 11.5l2.4-1.8A4 4 0 0 0 16 6.5V3M8 21v-3.5a4 4 0 0 1 1.6-3.2l2.4-1.8 2.4 1.8a4 4 0 0 1 1.6 3.2V21" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "move": (
    <><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z M9 13.5h6m-2.5-2.5 2.5 2.5-2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "home": (
    <><path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "book": (
    <><path d="M12 5C9 3 5 3 2 4v16c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 1Zm0 0v16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "user": (
    <><path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "plus": (
    <><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "back": (
    <><path d="m14 5-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "arrow": (
    <><path d="M4 12h16m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "close": (
    <><path d="m6 6 12 12M6 18 18 6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "file": (
    <><path d="M14 2H5v20h14V7Zm0 0v5h5M8 12h8M8 16h6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "search": (
    <><path d="M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-2 5 7 7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "chat": (
    <><path d="M21 11a9 9 0 0 1-9 9H4l-2 2v-9A10 10 0 0 1 12 2a9 9 0 0 1 9 9ZM7 10h10M7 14h6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "check": (
    <><path d="m5 12 4 4L20 5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "chevron": (
    <><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "more": (
    <><path d="M5 12h.01M12 12h.01M19 12h.01" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "download": (
    <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "link": (
    <><path d="m9 15 6-6m-8 4-2 2a4 4 0 0 0 6 6l3-3M10 6l3-3a4 4 0 0 1 6 6l-2 2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "clock": (
    <><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 6v6l4 2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "moon": (
    <><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "sun": (
    <><path d="M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "settings": (
    <><path d="M4 7h16M4 17h16M8 4v6M16 14v6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "shield": (
    <><path d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6Zm-4 10 3 3 5-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "logout": (
    <><path d="M9 3H3v18h6M8 12h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "cloud": (
    <><path d="M6 19a5 5 0 0 1-1-10 7 7 0 0 1 13-2 6 6 0 0 1 0 12H6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "filter": (
    <><path d="M3 6h18M6 12h12M9 18h6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "sort": (
    <><path d="M8 3v18m-4-4 4 4 4-4M15 5h6M15 10h4M15 15h2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "info": (
    <><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v6M12 7h.01" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "alert": (
    <><path d="m12 3 10 18H2ZM12 9v5M12 17h.01" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "refresh": (
    <><path d="M20 8A8 8 0 1 0 21 14M20 3v6h-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "star": (
    <><path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "eye": (
    <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "list": (
    <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "spark": (
    <><path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "quiz": (
    <><path d="M7 3h10v18H7ZM10 7h4M10 11h4M10 15h1" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "heart": (
    <><path d="M12 21 3 12C-3 4 7-1 12 6c5-7 15-2 9 6Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "volume": (
    <><path d="M4 9h4l5-5v16l-5-5H4Zm13-2c4 3 4 7 0 10" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "copy": (
    <><path d="M8 8h13v13H8ZM4 16H2V2h14v2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "trash": (
    <><path d="M3 6h18M6 6l1 15h10l1-15M9 6V3h6v3M10 10v7M14 10v7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "kebab": (
    <><path d="M12 5h.01M12 12h.01M12 19h.01" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "aa": (
    <><text x="1" y="18" fontSize="17" fontFamily="Inter, system-ui, sans-serif" fontWeight="400" fill="currentColor">Aa</text></>
  ),
  "bell": (
    <><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2H4.5Zm4 2.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "send": (
    <><path d="M21 3 10 14M21 3l-7 18-4-7-7-4Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "mail": (
    <><path d="M3 6h18v12H3Zm0 0 9 7 9-7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "lock": (
    <><path d="M6 11h12v10H6Zm2.5 0V7.5a3.5 3.5 0 0 1 7 0V11" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "plus-circle": (
    <><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 8v8M8 12h8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "layers": (
    <><path d="M12 3 2.5 8 12 13l9.5-5Zm-9.5 9L12 17l9.5-5M2.5 16 12 21l9.5-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "grid": (
    <><path d="M4 4h6v6H4Zm10 0h6v6h-6ZM4 14h6v6H4Zm10 0h6v6h-6Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "bulb": (
    <><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "lines": (
    <><path d="M4 6h16M4 10h12M4 14h16M4 18h9" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "globe": (
    <><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "eye-off": (
    <><path d="M3 3l18 18M10.6 6.1A10.6 10.6 0 0 1 12 6c5 0 8.5 4 9.5 6-.5 1-1.5 2.5-3 3.8M6.5 7.6C4.6 8.9 3.2 10.7 2.5 12c1 2 4.5 6 9.5 6 1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "pencil": (
    <><path d="M4 20h4L19 9l-4-4L4 16Zm9-13 4 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "key": (
    <><path d="M14.5 9.5a4.5 4.5 0 1 1-1.3-3.2 4.5 4.5 0 0 1 1.3 3.2ZM13.2 12.7 21 20.5M17 16.5l2-2M19 18.5l1.5-1.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "sliders": (
    <><path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "text-size": (
    <><path d="M3 19 8 6l5 13M5 15h6M14 19l3.5-9 3.5 9M15.2 16h4.6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
  "bars": (
    <><path d="M6 20V12M12 20V4M18 20v-6" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/></>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className ? `icon ${className}` : "icon"}
    >
      {PATHS[name]}
    </svg>
  );
}
