"use client";

import { useEffect, useRef } from "react";
import { useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";

/**
 * Image décorative en parallaxe très légère (±5 % de sa hauteur) pendant le défilement.
 * L'image est agrandie de 12 % en CSS (.parallax-img) pour que ses bords ne se découvrent
 * jamais. Le décalage est appliqué par le navigateur (jamais d'attribut style dans le HTML :
 * la CSP l'interdit). Mouvement réduit (système ou réglage Limpid) : image fixe.
 */
export function ParallaxImg({ src, srcSet, eager = false }: { src: string; srcSet?: string; eager?: boolean }) {
  const frame = useRef<HTMLSpanElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const systemReduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: frame, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["-5%", "5%"]);

  const still = () => Boolean(systemReduced) || document.documentElement.dataset.motion === "reduit";
  const apply = (v: string) => {
    if (img.current) img.current.style.transform = still() ? "" : `translateY(${v})`;
  };
  useMotionValueEvent(y, "change", apply);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- position initiale, une fois montée
  useEffect(() => apply(y.get()), [systemReduced]);

  return (
    <span ref={frame} className="parallax-frame">
      {/* eslint-disable-next-line @next/next/no-img-element -- fichier statique déjà dimensionné */}
      <img ref={img} src={src} srcSet={srcSet} alt="" loading={eager ? "eager" : "lazy"} decoding="async" className="parallax-img" />
    </span>
  );
}
