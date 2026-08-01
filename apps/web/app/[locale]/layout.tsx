/**
 * @file Locale bazli minimal layout.
 * @module @vetniva/web/app/[locale]/layout
 * @description Sadece dil dogrulama ve HTML iskeleti. Auth gerektiren
 * sayfalar kendi iclerinde `AppShell` kullanir; landing/login gibi
 * public sayfalar bu layout'un sagladigi minimal yapiyi kullanir.
 *
 * Not: Server component oldugu icin `I18nextProvider` kullanilmaz;
 * ceviriler dogrudan i18n.t ile cozumlenir. Client component'ler
 * `useTranslation` hook'u ile kendi context'lerini olusturur.
 * @security Tenant locale'i URL'den alinir; middleware zaten
 * desteklenmeyen locale'leri yonlendirmistir. Burada yeniden
 * dogrulama yapilarak tenant izolasyonu savunma amacli guclendirilir.
 */

import { SUPPORTED_LOCALES, type Locale } from "@vetniva/contracts";
import { notFound } from "next/navigation";

import type { Metadata } from "next";
import type { ReactNode } from "react";

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
 * @param params
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

/**
 *
 * @param root0
 * @param root0.params
 */
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

/**
 *
 * @param root0
 * @param root0.children
 * @param root0.params
 */
export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps): Promise<JSX.Element> {
  const locale = await resolveLocale(params);
  return (
    <div lang={locale} dir="ltr">
      {children}
    </div>
  );
}
