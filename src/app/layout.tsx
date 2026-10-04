import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { BottomNav, DesktopNav } from "@/components/Nav";
import { Logo } from "@/components/Logo";
import { fr } from "@/lib/i18n/fr";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Limpid", template: "%s · Limpid" },
  description: "Déposez n'importe quoi. Comprenez l'essentiel.",
  robots: { index: false, follow: false }, // alpha privée
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#F7F6F2",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Rendu dynamique obligatoire : la CSP utilise un nonce par requête.
  await connection();
  return (
    <html lang="fr">
      <body>
        <a className="skip-link" href="#contenu">{fr.nav.skip}</a>
        <header className="app-header">
          <Link href="/" className="logo-link" aria-label="Limpid, accueil">
            <Logo />
          </Link>
          <DesktopNav />
        </header>
        <main id="contenu">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
