import type { MetadataRoute } from "next";

/** Manifeste PWA (kit V3, écran 41) : installation facultative, icônes du kit. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Limpid",
    short_name: "Limpid",
    description: "Un document. Une explication qui fait sens.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0E110F",
    theme_color: "#0E110F",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icons/limpid-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/limpid-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/limpid-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
