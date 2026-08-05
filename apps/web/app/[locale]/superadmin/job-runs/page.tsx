/**
 * @file Süper admin job runs liste sayfası.
 * @module @vetniva/web/app/[locale]/superadmin/job-runs/page
 * @description FAZ-10 (GOAL-101) SUPERADMIN paneli job runs
 * yönetim yüzeyi. Sayfa, server component olarak yalnız
 * SUPERADMIN oturumunda `audit:log:read` yetkisi ile
 * job-runs/summary endpoint'ini çağırır; filtreli, sayfalı liste
 * ve dead-letter view istemci tarafında yönetilir.
 *
 * Not: Tenant, kullanıcı veya aktör kimliği tarayıcıdan
 * türetilmez; tüm API çağrıları `credentials: "include"` ile
 * oturum çerezine güvenir.
 *
 * @security Summary çağrısı başarısız olursa sayfa tüm KPI'ları
 * "Yüklenemedi" rozeti ile gösterir; liste kısmı istemci tarafında
 * bağımsız yüklenir. Tek bir alt kaynak başarısız olması panelin
 * tamamen gizlenmesine yol açmaz.
 */

import { SUPPORTED_LOCALES } from "@vetniva/contracts";
import { notFound } from "next/navigation";

import { SuperadminShell } from "@/components/layouts/superadmin-shell";
import { JobRunList } from "@/components/superadmin/job-run-list";
import { JobRunSummary } from "@/components/superadmin/job-run-summary";
import { PageHeader } from "@/components/ui/page-header";
import { apiRequest } from "@/lib/api-client";
import { getLabels, type Locale as LabelsLocale } from "@/lib/labels";

import type { JobRunSummary as JobRunSummaryData } from "@/components/superadmin/job-run-types";

type PageParams = { locale: string };

/**
 * Son 24 saat için ISO-8601 zaman damgası. Backend summary
 * endpoint'i opsiyonel `from` filtresi kabul eder; yoksa tüm
 * zamanları döner.
 * @param now
 */
function iso24hAgo(now: Date): string {
  const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return d.toISOString();
}

/**
 * Server tarafında job run summary çağrısı. Başarısızsa
 * `null` döner; UI her alt KPI'yı bağımsız "Yüklenemedi" rozeti
 * ile gösterebilir.
 */
async function loadSummary(): Promise<{
  data: JobRunSummaryData | null;
}> {
  const from = iso24hAgo(new Date());
  const result = await apiRequest<JobRunSummaryData>(
    `/api/v1/superadmin/job-runs/summary?from=${encodeURIComponent(from)}`,
    { credentials: "include" },
  );
  if (result.ok) return { data: result.data };
  return { data: null };
}

/**
 * Job Runs liste sayfası; üstte 8 KPI kartı, altında filtreli
 * tablo + dead-letter view toggle.
 * @param root0
 * @param root0.params
 */
export default async function JobRunsPage({
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
  const { data } = await loadSummary();
  const jobRunLabels = labels.jobRuns;

  return (
    <SuperadminShell
      locale={locale}
      pageTitle={labels.jobRuns.title}
      pageDescription={labels.jobRuns.description}
      user={{ name: labels.superadmin.user, role: "SUPERADMIN" }}
    >
      <PageHeader
        title={labels.jobRuns.title}
        description={labels.jobRuns.description}
        breadcrumb={[
          { label: labels.superadmin.breadcrumb.root, href: `/${locale}/superadmin` },
          { label: labels.jobRuns.title },
        ]}
      />
      <JobRunSummary
        deadLetter={data?.deadLetter ?? null}
        deadLetterLoadFailed={!data}
        failed={data?.failed ?? null}
        failedLoadFailed={!data}
        last24hDeadLetter={data?.last24hDeadLetter ?? null}
        last24hDeadLetterLoadFailed={!data}
        labels={{
          title: jobRunLabels.summaryHeading,
          total: jobRunLabels.summary.total,
          succeeded: jobRunLabels.summary.succeeded,
          failed: jobRunLabels.summary.failed,
          deadLetter: jobRunLabels.summary.deadLetter,
          running: jobRunLabels.summary.running,
          pending: jobRunLabels.summary.pending,
          last24hDeadLetter: jobRunLabels.summary.last24hDeadLetter,
          oldestRunning: jobRunLabels.summary.oldestRunning,
          oldestRunningNone: jobRunLabels.summary.oldestRunningNone,
          loadErrorHint: jobRunLabels.summary.loadErrorHint,
        }}
        oldestRunningLoadFailed={!data}
        oldestRunningStartedAt={data?.oldestRunning?.startedAt ?? null}
        pending={data?.pending ?? null}
        pendingLoadFailed={!data}
        running={data?.running ?? null}
        runningLoadFailed={!data}
        succeeded={data?.succeeded ?? null}
        succeededLoadFailed={!data}
        total={data?.total ?? null}
        totalLoadFailed={!data}
      />
      <div className="mt-6">
        <JobRunList locale={locale} />
      </div>
    </SuperadminShell>
  );
}
