/**
 * @file Next.js kök layout.
 * @module @vetniva/web/app/layout
 *
 * @description Tüm route'lar için kök HTML iskeleti. `html` etiketinin
 * `lang` ve `dir` özellikleri burada ayarlanır; gerçek locale bilgisi
 * `[locale]` segmentli layout'ta çözümlenir. Burada yalnızca global
 * CSS ve metadata tanımlanır.
 *
 * @security `html lang` ekran okuyucular için doğru biçimde ayarlanır;
 * yön (dir) İngilizce/Türkçe için soldan sağa sabittir.
 */

import "@vetniva/ui/globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    default: "VetNiva",
    template: "%s — VetNiva",
  },
  description: "Veteriner klinik ve petshop yönetim sistemi.",
  applicationName: "VetNiva",
  formatDetection: {
    email: false,
    telephone: false,
    address: false,
  },
  openGraph: {
    type: "website",
    siteName: "VetNiva",
    locale: "tr_TR",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0359a1",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <html lang="tr" dir="ltr" suppressHydrationWarning>
      <body className="min-h-screen bg-[rgb(var(--color-bg))] text-[rgb(var(--color-fg))] antialiased">
        {children}
      </body>
    </html>
  );
}
