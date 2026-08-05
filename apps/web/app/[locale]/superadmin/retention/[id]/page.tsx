/**
 * @file Süper admin log retention policy detay sayfası.
 * @module @vetniva/web/app/[locale]/superadmin/retention/[id]
 * @description Tek bir retention policy'nin detay, düzenleme ve silme
 * görünümü. Sayfa sunucu bileşenidir; SUPERADMIN shell, page header
 * ve `RetentionPolicyDetail` istemci komponentini render eder.
 *
 * Erişilebilirlik: PageHeader ve shell tarafından sağlanır.
 * @security Tüm mutasyonlar `audit:log:read` yetkisi gerektirir;
 * tenant kimliği URL'den alınmaz, kompozit anahtarın parçası
 * `tenantId` API response'undan gelir.
 */

import { SUPPORTED_LOCALES } from "@vetniva/contracts";
import { notFound } from "next/navigation";

import { SuperadminShell } from "@/components/layouts/superadmin-shell";
import { RetentionPolicyDetail } from "@/components/superadmin/retention-policy-detail";
import { PageHeader } from "@/components/ui/page-header";
import { getLabels, type Locale as LabelsLocale } from "@/lib/labels";

type PageParams = { locale: string; id: string };

/**
 *
 * @param root0
 * @param root0.params
 */
export default async function RetentionPolicyDetailPage({
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
      pageTitle={`${labels.retention.title} — ${id}`}
      user={{ name: labels.superadmin.user, role: "SUPERADMIN" }}
    >
      <PageHeader
        title={labels.retention.policy.id}
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
      <RetentionPolicyDetail locale={locale} policyId={id} />
    </SuperadminShell>
  );
}
