/**
 * Illustration animée de la préparation (planche 01) : un livre ouvert dont une page se
 * soulève, des cartes de notions qui apparaissent et des points reliés. Une seule animation,
 * cycle lent (3,2 s), transform et opacity seulement ; figée si la page est masquée ou si
 * l'appareil demande moins d'animations (cf. styles).
 */
export function BookAnimation() {
  return (
    <svg className="bk" viewBox="0 0 320 150" role="img" aria-hidden="true" focusable="false">
      <g className="bk-book">
        <path d="M40 112 L40 40 Q88 26 136 40 L136 112 Q88 98 40 112Z" className="bk-cover" />
        <path d="M136 40 Q184 26 232 40 L232 112 Q184 98 136 112Z" className="bk-cover" />
        <path d="M48 104 L48 44 Q90 32 132 44 L132 104 Q90 94 48 104Z" className="bk-page" />
        <path d="M140 44 Q182 32 224 44 L224 104 Q182 94 140 104Z" className="bk-page" />
        <g className="bk-lines">
          <rect x="62" y="56" width="52" height="6" rx="3" /><rect x="62" y="70" width="44" height="6" rx="3" /><rect x="62" y="84" width="50" height="6" rx="3" />
          <rect x="156" y="56" width="52" height="6" rx="3" /><rect x="156" y="70" width="40" height="6" rx="3" />
        </g>
        <path d="M140 44 Q182 32 224 44 L224 104 Q182 94 140 104Z" className="bk-page bk-flip" />
      </g>
      <g className="bk-links">
        <path d="M232 60 C248 60 248 34 262 34" /><path d="M232 76 C250 76 250 76 262 76" /><path d="M232 92 C248 92 248 118 262 118" />
      </g>
      <g className="bk-cards">
        <g className="bk-card bk-c1"><circle cx="262" cy="34" r="4" /><rect x="270" y="20" width="44" height="28" rx="6" /><rect x="276" y="28" width="28" height="4" rx="2" className="bk-mark" /><rect x="276" y="36" width="20" height="4" rx="2" className="bk-mark" /></g>
        <g className="bk-card bk-c2"><circle cx="262" cy="76" r="4" /><rect x="270" y="62" width="44" height="28" rx="6" /><rect x="276" y="70" width="28" height="4" rx="2" className="bk-mark" /><rect x="276" y="78" width="22" height="4" rx="2" className="bk-mark" /></g>
        <g className="bk-card bk-c3"><circle cx="262" cy="118" r="4" /><rect x="270" y="104" width="44" height="28" rx="6" /><rect x="276" y="112" width="28" height="4" rx="2" className="bk-mark" /><rect x="276" y="120" width="18" height="4" rx="2" className="bk-mark" /></g>
      </g>
    </svg>
  );
}
