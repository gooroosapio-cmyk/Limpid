import type { NextConfig } from "next";

const fonts = ["./src/assets/fonts/**"];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Rendu et lecture des PDF : bibliothèques chargées telles quelles côté serveur (pdf.js importe
  // ses modules dynamiquement), polices jointes aux fonctions de rendu.
  serverExternalPackages: ["@react-pdf/renderer", "unpdf"],
  outputFileTracingIncludes: {
    "/api/reports/[id]/pdf": fonts,
    "/rapports/demo/pdf": fonts,
  },
};

export default nextConfig;
