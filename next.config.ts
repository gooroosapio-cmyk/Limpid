import type { NextConfig } from "next";

const fonts = ["./src/assets/fonts/**"];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Service worker : toujours revalidé, portée sur toute l'application.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  // Rendu et lecture des PDF : bibliothèques chargées telles quelles côté serveur (pdf.js importe
  // ses modules dynamiquement), polices jointes aux fonctions de rendu.
  serverExternalPackages: ["@react-pdf/renderer", "unpdf"],
  outputFileTracingIncludes: {
    "/api/reports/[id]/pdf": fonts,
    "/rapports/demo/pdf": fonts,
  },
};

export default nextConfig;
