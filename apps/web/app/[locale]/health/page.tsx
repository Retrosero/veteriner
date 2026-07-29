/**
 * @file Sağlık durumu sayfası (server component).
 * @module @vetniva/web/app/[locale]/health/page
 *
 * @description API'nin `/api/v1/ready` endpoint'ine server-side fetch ile
 * istek atar. Yanıt `@vetniva/contracts` `readinessResponseSchema`
 * ile doğrulanır; hata/boş/başarı durumları için uygun state
 * render edilir. `X-Request-Id` correlation header'ı response'tan
 * okunur ve kullanıcıya gösterilir.
 *
 * @security Tenant bağlamı GOAL-001 ile gelecek; bu sayfa public
 * olduğu için yalnızca health verisi gösterilir. PII içermez.
 */

import {
  readinessResponseSchema,
  type ReadinessResponse,
} from "@vetniva/contracts";

import { HealthCard } from "@/components/health-card";
import { apiClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HealthPageProps = {
  params: Promise<{ locale: string }> | { locale: string };
};

type HealthLabels = {
  title: string;
  description: string;
  version: string;
  statusOk: string;
  statusDegraded: string;
  statusDown: string;
  db: string;
  latency: string;
  correlation: string;
  errorTitle: string;
  noData: string;
  fetchError: string;
};

const LABELS: Record<"tr" | "en", HealthLabels> = {
  tr: {
    title: "Sistem Sağlığı",
    description: "Platform bileşenlerinin canlı durumu.",
    version: "Sürüm",
    statusOk: "Çalışıyor",
    statusDegraded: "Kısmen çalışıyor",
    statusDown: "Çalışmıyor",
    db: "Veritabanı",
    latency: "Gecikme",
    correlation: "Correlation ID",
    errorTitle: "Sağlık bilgisi alınamadı",
    noData: "Şu an görüntülenecek veri yok.",
    fetchError:
      "API bağlantısı kurulamadı. Lütfen API servisinin çalıştığından emin olun.",
  },
  en: {
    title: "System Health",
    description: "Live status of platform components.",
    version: "Version",
    statusOk: "Operational",
    statusDegraded: "Degraded",
    statusDown: "Down",
    db: "Database",
    latency: "Latency",
    correlation: "Correlation ID",
    errorTitle: "Health information unavailable",
    noData: "No data to display right now.",
    fetchError:
      "Could not reach the API. Please ensure the API service is running.",
  },
};

function labelsFor(locale: string): HealthLabels {
  return locale === "en-GB" ? LABELS.en : LABELS.tr;
}

/**
 * Server-side fetch + Zod doğrulama. Hata durumunda null data döner;
 * çağıran taraf UI'da uygun state'i gösterir.
 */
async function fetchReadiness(): Promise<{
  data: ReadinessResponse | null;
  errorMessage: string | null;
  correlationId: string | null;
}> {
  const result = await apiClient.request<unknown>("/api/v1/ready", {
    method: "GET",
    cache: "no-store",
  });

  if (!result.ok) {
    return {
      data: null,
      errorMessage: result.error.message,
      correlationId: result.requestId,
    };
  }

  const parsed = readinessResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    return {
      data: null,
      errorMessage: "Beklenen sağlık yanıt formatı alınamadı",
      correlationId: result.requestId,
    };
  }

  return {
    data: parsed.data,
    errorMessage: null,
    correlationId: result.requestId,
  };
}

export default async function HealthPage({
  params,
}: HealthPageProps): Promise<JSX.Element> {
  const { locale } = await Promise.resolve(params);
  const labels = labelsFor(locale);
  const { data, errorMessage, correlationId } = await fetchReadiness();

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-clinic-800">
          {labels.title}
        </h1>
        <p className="text-sm text-gray-600">{labels.description}</p>
      </header>
      <HealthCard
        data={data}
        error={errorMessage}
        correlationId={correlationId}
        labels={labels}
      />
    </div>
  );
}
