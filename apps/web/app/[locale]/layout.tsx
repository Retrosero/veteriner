/**
 * @file Locale bazli layout.
 * @module @vetniva/web/app/[locale]/layout
 *
 * @description URL'den alinan locale'i dogrular, i18next ornegini
 * olusturur ve sayfa agacini render eder. Header ve footer bu
 * katmanda render edilir.
 *
 * Not: Server component oldugu icin `I18nextProvider` kullanilmaz;
 * ceviriler dogrudan i18n.t ile cozumlenir. Client component'ler
 * `useTranslation` hook'u ile kendi context'lerini olusturur.
 *
 * @security Tenant locale'i URL'den alinir; middleware zaten
 * desteklenmeyen locale'leri yonlendirmistir. Burada yeniden
 * dogrulama yapilarak tenant izolasyonu savunma amacli guclendirilir.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
} from "@vetniva/contracts";

import { getI18n } from "@/i18n/config";

type LocaleParams = {
  locale: string;
};

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<LocaleParams> | LocaleParams;
};

/**
 * Next 14'te `params` Promise olabilir; desteklenmeyen tipleri handle
 * etmek icin normalizasyon yapilir.
 */
async function resolveLocale(
  params: LocaleLayoutProps["params"],
): Promise<Locale> {
  const resolved = await Promise.resolve(params);
  const candidate = resolved.locale;
  if ((SUPPORTED_LOCALES as readonly string[]).includes(candidate)) {
    return candidate as Locale;
  }
  notFound();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<LocaleParams> | LocaleParams;
}): Promise<Metadata> {
  const locale = await resolveLocale(params);
  return {
    title: "VetNiva",
    description:
      locale === "en-GB"
        ? "Veterinary clinic and petshop management platform."
        : "Veteriner klinik ve petshop yonetim platformu.",
  };
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps): Promise<JSX.Element> {
  const locale = await resolveLocale(params);
  const i18n = getI18n(locale);
  const tApp = (key: string): string => i18n.t(key);

  return (
    <div lang={locale} dir="ltr" className="flex min-h-screen flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <a
              href={`/${locale}`}
              className="text-base font-semibold text-clinic-800 hover:text-clinic-700"
              aria-label={tApp("app.name")}
            >
              {tApp("app.name")}
            </a>
            <span className="hidden text-sm text-gray-500 sm:inline">
              {tApp("app.tagline")}
            </span>
          </div>
          <nav aria-label="primary" className="flex items-center gap-4 text-sm">
            <a
              href={`/${locale}/health`}
              className="text-gray-700 hover:text-clinic-700"
            >
              {tApp("health.title")}
            </a>
            <a href="/en-GB" className="text-gray-700 hover:text-clinic-700">
              EN
            </a>
            <a href="/tr-TR" className="text-gray-700 hover:text-clinic-700">
              TR
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 text-xs text-gray-500">
          <span>
            &copy; {new Date().getFullYear()} {tApp("app.name")}
          </span>
          <span className="font-mono">
            {process.env["APP_VERSION"] ?? DEFAULT_LOCALE}
          </span>
        </div>
      </footer>
    </div>
  );
}
