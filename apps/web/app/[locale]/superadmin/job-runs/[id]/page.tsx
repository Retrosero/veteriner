/**
 * @file Süper admin job run detay sayfası.
 * @module @vetniva/web/app/[locale]/superadmin/job-runs/[id]/page
 * @description FAZ-10 (GOAL-101) SUPERADMIN paneli job run detay
 * yüzeyi. Seçilen job run'ın tüm bilgilerini, retry/finish
 * aksiyonlarını ve aynı jobKey için tüm denemeleri gösterir.
 *
 * @security Detay sayfası yalnız SUPERADMIN oturumunda ve
 * `audit:log:read` yetkisi ile erişilebilir. URL'deki `id`
 * path parametresi backend'e düz geçirilir; ek doğrulama
 * backend tarafında yapılır.
 */

import { SUPPORTED_LOCALES } from "@vetniva/contracts";
import { notFound } from "next/navigation";

import { SuperadminShell } from "@/components/layouts/superadmin-shell";
import { JobRunDetail } from "@/components/superadmin/job-run-detail";
import { PageHeader } from "@/components/ui/page-header";
import { getLabels, type Locale as LabelsLocale } from "@/lib/labels";

type PageParams = { locale: string; id: string };

/**
 * Job run detay sayfası; meta veri, input/output, errorStack,
 * retry/finish aksiyonları ve attempts özetini gösterir.
 * @param root0
 * @param root0.params
 */
export default async function JobRunDetailPage({
  params,
}: {
  params: Promise<PageParams> | PageParams;
}): Promise<JSX.Element> {
  const resolved = await Promise.resolve(params);
  const { locale: rawLocale, id } = resolved;
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(rawLocale)) {
    notFound();
  }
  if (!id) {
    notFound();
  }
  const locale = rawLocale as LabelsLocale;
  const labels = getLabels(locale);

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
          {
            label: labels.jobRuns.title,
            href: `/${locale}/superadmin/job-runs`,
          },
          { label: labels.jobRuns.detailHeading },
        ]}
      />
      <div className="mt-2">
        <JobRunDetail locale={locale} runId={id} />
      </div>
    </SuperadminShell>
  );
}
