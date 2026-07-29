/**
 * @file Ana sayfa (server component).
 * @module @vetniva/web/app/[locale]/page
 *
 * @description VetNiva'nın landing sayfası. Locale'den alınan çevirilerle
 * başlık ve tagline gösterilir; `@vetniva/ui` Button ve Card primitive'leri
 * kullanılır. Server component olduğu için `getT` ile senkron çeviri
 * yapılır.
 *
 * @security Sayfa yalnızca herkese açık içerik gösterir; auth
 * bağlamı GOAL-001+ birlikte gelir.
 */

import Link from "next/link";

import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@vetniva/ui";

import { getT } from "@/i18n/config";

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

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-clinic-800">
          {t("app.name")}
        </h1>
        <p className="text-sm text-gray-600">{t("app.tagline")}</p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("health.title")}</CardTitle>
          <CardDescription>
            {locale === "en-GB"
              ? "Check the live status of the VetNiva platform."
              : "VetNiva platformunun canlı durumunu kontrol edin."}
          </CardDescription>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-gray-600">
            {locale === "en-GB"
              ? "Click below to view the current system health, including database latency and build version."
              : "Veritabanı gecikmesi ve sürüm bilgisi dahil olmak üzere mevcut sistem sağlığını görmek için aşağıya tıklayın."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/${locale}/health`}
              className="inline-flex h-10 items-center justify-center rounded bg-clinic-700 px-4 text-sm font-medium text-white transition-colors hover:bg-clinic-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinic-700 focus-visible:ring-offset-2"
            >
              {t("health.title")}
            </Link>
            <Button variant="ghost" size="md" type="button" disabled>
              {t("common.loading")}
            </Button>
            <span className="text-xs text-gray-500">/{locale}/health</span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
