/**
 * @file Süper admin dashboard sayfası.
 * @module @vetniva/web/app/[locale]/superadmin/page
 * @description FAZ-10 SUPERADMIN paneli giriş ekranı. Operasyonel
 * durumun özetini sunar: 24 saatlik hata olayı sayısı, 24
 * saatlik dead-letter job sayısı ve 24 saatlik güvenlik olayı
 * sayısı. Veriler paralel feature sayfalarındaki aynı SUPERADMIN
 * API'lerinden çekilir.
 *
 * Not: Bu sayfa yalnız istasyon bilgilendirme amaçlıdır; detay
 * etkileşimleri kendi route'larına yönlendirilir.
 * @security Tüm backend çağrıları `audit:log:read` permission'ı
 * gerektirir. Yalnız SUPERADMIN oturumunda veri alınabilir.
 */

import { SUPPORTED_LOCALES } from "@vetniva/contracts";
import { notFound } from "next/navigation";

import { SuperadminShell } from "@/components/layouts/superadmin-shell";
import { SuperadminKpiSummary } from "@/components/superadmin/superadmin-kpi-summary";
import { PageHeader } from "@/components/ui/page-header";
import { apiRequest } from "@/lib/api-client";
import { getLabels, type Locale as LabelsLocale } from "@/lib/labels";

type PageParams = { locale: string };

/**
 * Hata özeti response şeması (sözleşme). SUPERADMIN summary endpoint'i.
 * `total` tüm fingerprint'lerin occurrenceCount toplamıdır; son 24
 * saat filtresi query üzerinden uygulanır.
 */
type ErrorEventSummary = {
  total: number;
  bySeverity: Array<{ severity: string; count: number }>;
  byModule: Array<{ module: string; count: number }>;
  byErrorCode: Array<{ errorCode: string; count: number }>;
  topFingerprints: Array<{
    fingerprint: string;
    severity: string;
    module: string;
    errorCode: string;
    eventCount: number;
  }>;
};

/**
 * Job run summary response şeması.
 */
type JobRunSummary = {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
  byQueue: Array<{
    queueName: string;
    succeeded: number;
    failed: number;
    deadLetter: number;
    running: number;
    pending: number;
  }>;
  last24hDeadLetter: number;
  oldestRunning: { id: string; startedAt: string } | null;
};

/**
 * Güvenlik özeti response şeması.
 */
type SecurityEventSummary = {
  total: number;
  bySeverity: Array<{ severity: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
  topGroups: Array<{
    fingerprint: string;
    type: string;
    severity: string;
    eventCount: number;
  }>;
};

/**
 * Son 24 saat için ISO-8601 zaman damgası. Backend summary endpoint'i
 * opsiyonel `from` filtresi kabul eder; yoksa tüm zamanları döner.
 * @param now
 */
function iso24hAgo(now: Date): string {
  const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return d.toISOString();
}

/**
 * Üç summary'yi paralel olarak çeker. Biri başarısız olursa
 * toplamı 0 verir; UI'da hata rozetleri gösterilebilir.
 */
async function loadSummaries(): Promise<{
  errors: ErrorEventSummary | null;
  jobs: JobRunSummary | null;
  security: SecurityEventSummary | null;
}> {
  const from = iso24hAgo(new Date());
  const [errorsRes, jobsRes, securityRes] = await Promise.all([
    apiRequest<ErrorEventSummary>(
      `/api/v1/superadmin/error-events/summary?from=${encodeURIComponent(from)}`,
      { credentials: "include" },
    ),
    apiRequest<JobRunSummary>(
      `/api/v1/superadmin/job-runs/summary?from=${encodeURIComponent(from)}`,
      { credentials: "include" },
    ),
    apiRequest<SecurityEventSummary>(
      `/api/v1/superadmin/security-events/summary?from=${encodeURIComponent(from)}`,
      { credentials: "include" },
    ),
  ]);

  return {
    errors: errorsRes.ok ? errorsRes.data : null,
    jobs: jobsRes.ok ? jobsRes.data : null,
    security: securityRes.ok ? securityRes.data : null,
  };
}

/**
 *
 * @param root0
 * @param root0.params
 */
export default async function SuperadminOverviewPage({
  params,
}: {
  params: Promise<PageParams> | PageParams;
}): Promise<JSX.Element> {
  const resolved = await Promise.resolve(params);
  const { locale: rawLocale } = resolved;
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(rawLocale)) {
    notFound();
  }
  const locale = rawLocale as LabelsLocale;
  const labels = getLabels(locale);

  const { errors, jobs, security } = await loadSummaries();

  return (
    <SuperadminShell
      locale={locale}
      pageTitle={labels.superadmin.nav.overview}
      user={{ name: labels.superadmin.user, role: "SUPERADMIN" }}
    >
      <PageHeader
        title={labels.superadmin.nav.overview}
        description={labels.superadmin.tagline}
        breadcrumb={[{ label: labels.superadmin.breadcrumb.root }]}
      />

      <SuperadminKpiSummary
        errorsTotal={errors?.total ?? null}
        deadLetter24h={jobs?.last24hDeadLetter ?? null}
        securityEvents24h={security?.total ?? null}
        errorLoadFailed={!errors}
        jobLoadFailed={!jobs}
        securityLoadFailed={!security}
        labels={{
          kpiErrors: labels.superadmin.kpi.totalErrors24h,
          kpiDeadLetter: labels.superadmin.kpi.deadLetterLast24h,
          kpiSecurity: labels.superadmin.kpi.securityEventsLast24h,
          loadErrorHint: labels.superadmin.status.loading,
        }}
      />
    </SuperadminShell>
  );
}
