/**
 * @file Landing sayfasi (server component).
 * @module @vetniva/web/app/[locale]/page
 *
 * @description Gozlemci ve potansiyel klinik yoneticileri icin landing
 * sayfasi. Giris yapmamis ziyaretcilere uygulamanin degerini ozetler
 * ve "Giris Yap" / "Kayit Ol" aksiyonlari sunar. Auth sonrasi
 * kullanicilar `/[locale]/dashboard` adresine yonlendirilir
 * (GOAL-001).
 *
 * @security Sayfa public'tir ve PII tasimaz. CTA linkleri sadece
 * tenant ici yonlendirmeler yapar.
 */

import Link from "next/link";

import { Button } from "@vetniva/ui";

import { getT } from "@/i18n/config";
import { getLabels } from "@/lib/labels";

type HomeParams = {
  locale: string;
};

export default async function HomePage({
  params,
}: {
  params: Promise<HomeParams> | HomeParams;
}): Promise<JSX.Element> {
  const { locale } = await Promise.resolve(params);
  const t = getT(locale as "tr-TR" | "en-GB");
  const labels = getLabels(locale);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-clinic-50/30 to-white">
      <header className="border-b border-gray-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2"
            aria-label={labels.brand.name}
          >
            <span
              aria-hidden="true"
              className="grid h-8 w-8 place-items-center rounded-lg bg-clinic-700 text-white"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <circle cx="12" cy="14" r="6" />
                <circle cx="6" cy="8" r="2.5" />
                <circle cx="18" cy="8" r="2.5" />
                <circle cx="9" cy="4" r="2" />
                <circle cx="15" cy="4" r="2" />
              </svg>
            </span>
            <span className="text-base font-semibold text-clinic-800">
              {labels.brand.name}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={`/${locale}/login`}
              className="text-sm font-medium text-gray-700 hover:text-clinic-700"
            >
              {labels.login.submit}
            </Link>
            <Link href={`/${locale}/dashboard`}>
              <Button size="sm">{labels.login.submit}</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-clinic-200 bg-clinic-50 px-3 py-1 text-xs font-medium text-clinic-700">
            {labels.brand.name} &middot; {labels.brand.tagline}
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            {locale === "en-GB"
              ? "One platform for your clinic, your patients, and your team."
              : "Kliniğiniz, hastalarınız ve ekibiniz için tek platform."}
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            {locale === "en-GB"
              ? "Manage appointments, exams, vaccinations, sales, and reports in a single, fast interface designed for veterinary teams."
              : "Randevu, muayene, aşı, satış ve raporları klinik ekipleri için tasarlanmış hızlı ve bütünleşik bir arayüzde yönetin."}
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href={`/${locale}/dashboard`}>
              <Button size="lg">{labels.login.submit}</Button>
            </Link>
            <Link href={`/${locale}/health`}>
              <Button size="lg" variant="secondary">
                {t("health.title")}
              </Button>
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-100">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 text-xs text-gray-500 sm:px-6 lg:px-8">
          <span>
            &copy; {new Date().getFullYear()} {labels.brand.name}
          </span>
          <span className="font-mono">
            {process.env["APP_VERSION"] ?? "devlocal"}
          </span>
        </div>
      </footer>
    </div>
  );
}
