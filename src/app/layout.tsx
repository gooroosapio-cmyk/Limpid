import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Pwa } from "@/components/shell/Pwa";
import { Toaster } from "@/components/shell/Toasts";
import { currentUser } from "@/lib/auth";
import { htmlAttributes, readDisplayPrefs } from "@/lib/display/prefs";
import { I18nProvider } from "@/lib/i18n/client";
import { getLang, getT } from "@/lib/i18n/server";
import { offlineKey } from "@/lib/offline-key";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/components.css";
import "./styles/reader.css";
import "./styles/pages.css";

export const metadata: Metadata = {
  title: { default: "Limpid", template: "%s · Limpid" },
  description: "Un document. Une explication qui fait sens.",
  robots: { index: false, follow: false }, // alpha privée
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Limpid", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F6F2" },
    { media: "(prefers-color-scheme: dark)", color: "#171815" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  // Rendu dynamique obligatoire : la CSP utilise un nonce par requête.
  await connection();
  const store = await cookies();
  const prefs = readDisplayPrefs((n) => store.get(n)?.value);
  const user = await currentUser();
  return (
    <html lang={lang} {...htmlAttributes(prefs)}>
      <body>
        <I18nProvider lang={lang}>
        <a className="skip-link" href="#contenu">{t.nav.skip}</a>
        <div className="app">
          {user && (
            <Suspense>
              <AppShell email={user.email ?? ""} />
            </Suspense>
          )}
          <main id="contenu" className="app-content">{children}</main>
        </div>
        <Pwa account={user ? offlineKey(user.id) : null} />
        <Toaster closeLabel={t.reader.close} />
        </I18nProvider>
      </body>
    </html>
  );
}
