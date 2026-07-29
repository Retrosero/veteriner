/**
 * @file Sistem sagligi sayfasi.
 * @module @vetniva/web/app/[locale]/health/page
 *
 * @description API'nin `/api/v1/ready` endpoint'inden alinan
 * `ReadinessResponse`'i gorsellestirir. Sistem bilesenlerinin (DB,
 * queue, storage) canli durumunu ve build bilgisini gosterir. Gozlem
 * ve smoke test amacli kullanilir.
 *
 * @security Tenant filtresi uygulanmaz; health public bir endpoint
 * uzerinden calisir. Hassas build meta verisi GOAL-000'da yok
 * (yalnizca sha + version). Faz 10 ile birlikte build meta genisler.
 */

import { notFound } from "next/navigation";

import { SUPPORTED_LOCALES, type Locale } from "@vetniva/contracts";

import { AppShell } from "@/components/layouts/app-shell";
import { Badge, type BadgeProps } from "@vetniva/ui";
import { PageHeader } from "@/components/ui/page-header";
import { getLabels } from "@/lib/labels";
import { apiClient } from "@/lib/api-client";
import { HealthCard } from "@/components/health-card";

type PageParams = { locale: string };

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

const HEALTH_LABELS: Record<"tr-TR" | "en-GB", HealthLabels> = {
  "tr-TR": {
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
  "en-GB": {
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

type ReadinessView = {
  status: "ok" | "degraded" | "down";
  components: {
    db: {
      status: "ok" | "degraded" | "down";
      latency_ms?: number;
      message?: string;
    };
  };
};

function statusToBadge(status: "ok" | "degraded" | "down"): {
  tone: NonNullable<BadgeProps["tone"]>;
  text: string;
} {
  const tr = HEALTH_LABELS["tr-TR"];
  if (status === "ok") return { tone: "success", text: tr.statusOk };
  if (status === "degraded")
    return { tone: "warning", text: tr.statusDegraded };
  return { tone: "danger", text: tr.statusDown };
}

export default async function HealthPage({
  params,
}: {
  params: Promise<PageParams> | PageParams;
}): Promise<JSX.Element> {
  const resolved = await Promise.resolve(params);
  const { locale: rawLocale } = resolved;
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(rawLocale)) {
    notFound();
  }
  const locale = rawLocale as Locale;
  const labels = getLabels(locale);
  const hl = HEALTH_LABELS[locale === "en-GB" ? "en-GB" : "tr-TR"];

  const result = await apiClient.request<unknown>("/api/v1/ready", {
    method: "GET",
    cache: "no-store",
  });

  const data: ReadinessView | null = result.ok
    ? (result.data as ReadinessView)
    : null;

  return (
    <AppShell
      locale={locale}
      pageTitle={labels.health.title}
      pageDescription={labels.health.description}
      user={{
        name: "Dr. Ayşe Yılmaz",
        role: locale === "en-GB" ? "Veterinarian" : "Veteriner",
      }}
    >
      <PageHeader
        title={labels.health.title}
        description={labels.health.description}
        breadcrumb={[
          { label: labels.nav.dashboard, href: `/${locale}` },
          { label: labels.health.title },
        ]}
      />

      {result.ok && data ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
            <span className="text-sm text-gray-600">Genel durum</span>
            {(() => {
              const badge = statusToBadge(data.status);
              return <Badge tone={badge.tone}>{badge.text}</Badge>;
            })()}
            <span className="ml-auto font-mono text-xs text-gray-500">
              {new Date().toISOString()}
            </span>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              Bileşen durumları
            </h3>
            <dl className="divide-y divide-gray-100 text-sm">
              <div className="flex items-center justify-between py-2">
                <dt className="text-gray-600">{hl.db}</dt>
                <dd className="flex items-center gap-2">
                  {typeof data.components.db.latency_ms === "number" ? (
                    <span className="font-mono text-xs text-gray-500">
                      {data.components.db.latency_ms} {labels.units.ms}
                    </span>
                  ) : null}
                  {(() => {
                    const badge = statusToBadge(data.components.db.status);
                    return <Badge tone={badge.tone}>{badge.text}</Badge>;
                  })()}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ) : (
        <HealthCard
          data={null}
          error={result.ok ? hl.noData : result.error.message || hl.fetchError}
          correlationId={result.ok ? null : result.requestId}
          labels={hl}
        />
      )}
    </AppShell>
  );
}
