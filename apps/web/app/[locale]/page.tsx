/**
 * @file Landing sayfası (server component).
 * @module @vetniva/web/app/[locale]/page
 * @description Gözlemci ve potansiyel klinik yöneticileri için landing
 * sayfası. Giriş yapmamış ziyaretçilere uygulamanın değerini özetler
 * ve "Giriş Yap" / "Demo İzle" aksiyonları sunar. Auth sonrası
 * kullanıcılar `/[locale]/dashboard` adresine yönlendirilir
 * (GOAL-001).
 *
 * Erişilebilirlik:
 * - Skip-link "İçeriğe geç"
 * - Semantic `<header>` / `<main>` / `<footer>`
 * - Tek H1 + açıklayıcı metin.
 * @security Sayfa public'tir ve PII taşımaz. CTA linkleri sadece
 * tenant içi yönlendirmeler yapar.
 */

import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@vetniva/ui";
import Link from "next/link";

import { getLabels } from "@/lib/labels";

type HomeParams = {
  locale: string;
};

const FEATURES = [
  {
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-6 w-6"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </svg>
    ),
    titleKey: "feature.appointments.title" as const,
    descKey: "feature.appointments.desc" as const,
  },
  {
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-6 w-6"
      >
        <path d="M12 21s-7-4.5-7-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-7 11-7 11" />
        <path d="M9 12h.01M12 11h.01M15 12h.01" />
      </svg>
    ),
    titleKey: "feature.exam.title" as const,
    descKey: "feature.exam.desc" as const,
  },
  {
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-6 w-6"
      >
        <path d="M14 4l6 6M10 8l-6 6v6h6l6-6M14 4l3-3 3 3-3 3" />
      </svg>
    ),
    titleKey: "feature.vaccine.title" as const,
    descKey: "feature.vaccine.desc" as const,
  },
  {
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-6 w-6"
      >
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M7 15h3" />
      </svg>
    ),
    titleKey: "feature.finance.title" as const,
    descKey: "feature.finance.desc" as const,
  },
] as const;

/**
 *
 * @param root0
 * @param root0.params
 */
export default async function HomePage({
  params,
}: {
  params: Promise<HomeParams> | HomeParams;
}): Promise<JSX.Element> {
  const { locale } = await Promise.resolve(params);
  const labels = getLabels(locale);
  const isEn = locale === "en-GB";

  const featureCopy: Record<string, { title: string; desc: string }> = {
    "feature.appointments.title": {
      title: isEn ? "Smart scheduling" : "Akıllı randevu yönetimi",
      desc: isEn
        ? "Daily and weekly views, automatic reminders, and owner self-booking via the portal."
        : "Günlük ve haftalık görünümler, otomatik hatırlatmalar ve portal üzerinden sahip öz-randevusu.",
    },
    "feature.appointments.desc": { title: "", desc: "" },
    "feature.exam.title": {
      title: isEn ? "Structured exam records" : "Yapılandırılmış muayene",
      desc: isEn
        ? "SOAP notes, attachments, and patient history in one place."
        : "SOAP notları, ekler ve hasta geçmişi tek bir yerde.",
    },
    "feature.exam.desc": { title: "", desc: "" },
    "feature.vaccine.title": {
      title: isEn ? "Vaccination tracking" : "Aşı takibi",
      desc: isEn
        ? "Schedule, reminders, and brand/batch traceability per patient."
        : "Hasta başına planlama, hatırlatma ve marka/parti izlenebilirliği.",
    },
    "feature.vaccine.desc": { title: "", desc: "" },
    "feature.finance.title": {
      title: isEn ? "Sales & invoicing" : "Satış ve fatura",
      desc: isEn
        ? "POS for the in-clinic shop, inventory movements, and reporting."
        : "Klinik içi petshop POS'u, stok hareketleri ve raporlama.",
    },
    "feature.finance.desc": { title: "", desc: "" },
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Skip-link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-clinic-700 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        {isEn ? "Skip to main content" : "İçeriğe geç"}
      </a>

      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2"
            aria-label={labels.brand.name}
          >
            <span
              aria-hidden="true"
              className="grid h-9 w-9 place-items-center rounded-lg bg-clinic-700 text-white"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                <circle cx="12" cy="14" r="6" />
                <circle cx="6" cy="8" r="2.5" />
                <circle cx="18" cy="8" r="2.5" />
                <circle cx="9" cy="4" r="2" />
                <circle cx="15" cy="4" r="2" />
              </svg>
            </span>
            <span className="text-base font-semibold text-gray-900">
              {labels.brand.name}
            </span>
          </Link>
          <nav
            aria-label={isEn ? "Primary" : "Birincil"}
            className="flex items-center gap-2"
          >
            <Link
              href={`/${locale}/login`}
              className="hidden text-sm font-medium text-gray-700 hover:text-clinic-700 sm:inline-block"
            >
              {labels.login.submit}
            </Link>
            <Link href={`/${locale}/login`}>
              <Button size="sm">{labels.login.submit}</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Main */}
      <main id="main-content" aria-label={isEn ? "Main content" : "Ana içerik"}>
        {/* Hero */}
        <section aria-labelledby="hero-title" className="bg-white">
          <div className="mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pt-20">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-clinic-200 bg-clinic-50 px-3 py-1 text-xs font-medium text-clinic-700">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-clinic-600"
                />
                {labels.brand.tagline}
              </span>
              <h1
                id="hero-title"
                className="mt-6 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl"
              >
                {isEn
                  ? "One platform for your clinic, your patients, and your team."
                  : "Kliniğiniz, hastalarınız ve ekibiniz için tek platform."}
              </h1>
              <p className="mt-5 text-lg leading-8 text-gray-600">
                {isEn
                  ? "Manage appointments, exams, vaccinations, sales, and reports in a single, fast interface designed for veterinary teams."
                  : "Randevu, muayene, aşı, satış ve raporları klinik ekipleri için tasarlanmış hızlı ve bütünleşik bir arayüzde yönetin."}
              </p>
              <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Link href={`/${locale}/login`}>
                  <Button size="lg">{labels.login.submit}</Button>
                </Link>
                <Link href={`/${locale}/health`}>
                  <Button size="lg" variant="secondary">
                    {isEn ? "System status" : "Sistem Durumu"}
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section
          aria-labelledby="features-title"
          className="border-t border-gray-200 bg-gray-50"
        >
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2
                id="features-title"
                className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl"
              >
                {isEn
                  ? "Everything your clinic needs, in one place"
                  : "Kliniğinizin ihtiyacı olan her şey tek yerde"}
              </h2>
              <p className="mt-3 text-base text-gray-600">
                {isEn
                  ? "Designed for veterinary workflows from day one."
                  : "Veteriner iş akışları için sıfırdan tasarlandı."}
              </p>
            </div>
            <ul
              role="list"
              className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              {FEATURES.map((feature) => {
                const copy = featureCopy[feature.titleKey];
                if (copy === undefined) return null;
                return (
                  <li key={feature.titleKey}>
                    <Card className="h-full">
                      <CardHeader>
                        <div
                          aria-hidden="true"
                          className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-clinic-50 text-clinic-700"
                        >
                          {feature.icon}
                        </div>
                        <CardTitle className="text-base">
                          {copy.title}
                        </CardTitle>
                      </CardHeader>
                      <CardBody>
                        <CardDescription>{copy.desc}</CardDescription>
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Trust band */}
        <section
          aria-labelledby="trust-title"
          className="border-t border-gray-200 bg-white"
        >
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2
                id="trust-title"
                className="text-sm font-semibold uppercase tracking-wider text-clinic-700"
              >
                {isEn ? "Built for compliance" : "Uyumluluk için tasarlandı"}
              </h2>
              <p className="mt-3 text-base text-gray-600">
                {isEn
                  ? "Multi-tenant isolation, append-only medical records, and KVKK/GDPR-ready audit trails."
                  : "Çok kiracılı izolasyon, ekleme-onaylı tıbbi kayıtlar ve KVKK/GDPR uyumlu denetim izleri."}
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-4 py-6 text-xs text-gray-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
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
