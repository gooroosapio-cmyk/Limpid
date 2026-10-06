/**
 * Illustration de contexte du catalogue local (kit V6, CC0) : l'image garde ses couleurs,
 * le cadre suit le thème. Jamais une donnée : mention « non à l'échelle ».
 */
export function Scene({ asset, alt, note, caption }: { asset: string; alt: string; note: string; caption: React.ReactNode }) {
  return (
    <figure className="v6-scene">
      <div className="v6-scene-frame">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG statique local, déjà dimensionné */}
        <img src={`/illustrations/scenes/${asset}.svg`} alt={alt} width={960} height={540} loading="lazy" decoding="async" />
      </div>
      <figcaption>
        {caption}
        <span className="v6-scene-note">{note}</span>
      </figcaption>
    </figure>
  );
}
