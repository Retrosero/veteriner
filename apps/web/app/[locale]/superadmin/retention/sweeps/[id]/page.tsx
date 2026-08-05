/**
 * @file Süper admin log retention sweep detay sayfası.
 * @module @vetniva/web/app/[locale]/superadmin/retention/sweeps/[id]
 * @description Tek bir retention sweep kaydının detay görünümü. Sweep
 * meta verisini (triggered by, started/finished, dryRun) ve
 * tenant × logType × severity bucket'ları için expired/archived/
 * deleted sayılarını gösterir. Sayfa sunucu bileşenidir; SUPERADMIN
 * shell ve page header render edilir, içerik `RetentionSweepDetail`
 * istemci komponentine bırakılır.
 *
 * Erişilebilirlik: PageHeader ve shell tarafından sağlanır.
 * @security Backend sweep detayını `audit:log:read` yetkisi ile
 * döner; UI yalnız ID gönderir.
 */

import { SUPPORTED_LOCALES } from "@vetniva/contracts";
import { notFound } from "next/navigation";

import { SuperadminShell } from "@/components/layouts/superadmin-shell";
import { RetentionSweepDetail } from "@/components/superadmin/retention-sweep-detail";
import { PageHeader } from "@/components/ui/page-header";
import { getLabels, type Locale as LabelsLocale } from "@/lib/labels";

type PageParams = { locale: string; id: string };

/**
 *
 * @param root0
 * @param root0.params
 */
export default async function RetentionSweepDetailPage({
  params,
}: {
  params: Promise<PageParams> | PageParams;
}): Promise<JSX.Element> {
  const resolved = await Promise.resolve(params);
  const { locale: rawLocale, id } = resolved;
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(rawLocale)) {
    notFound();
  }
  if (!id) notFound();
  const locale = rawLocale as LabelsLocale;
  const labels = getLabels(locale);

  return (
    <SuperadminShell
      locale={locale}
      pageTitle={`${labels.retention.tabs.sweeps} — ${id}`}
      user={{ name: labels.superadmin.user, role: "SUPERADMIN" }}
    >
      <PageHeader
        title={labels.retention.tabs.sweeps}
        description={id}
        breadcrumb={[
          {
            label: labels.superadmin.breadcrumb.root,
            href: `/${locale}/superadmin`,
          },
          {
            label: labels.retention.title,
            href: `/${locale}/superadmin/retention`,
          },
          { label: id },
        ]}
      />
      <RetentionSweepDetail locale={locale} sweepId={id} />
    </SuperadminShell>
  );
}
