/**
 * @file Süper admin log retention sayfası.
 * @module @vetniva/web/app/[locale]/superadmin/retention
 * @description FAZ-10 SUPERADMIN Log Retention modülünün giriş sayfası.
 * Üç sekmeyi (Policies, Sweeps, Effective) tek bir istemci
 * komponentinde toplar. Sayfa sunucu bileşenidir; SUPERADMIN
 * shell'i ve page header'ı render eder, içerik `RetentionTabs`
 * istemci komponentine bırakılır.
 *
 * Erişilebilirlik: PageHeader ve shell tarafından sağlanır;
 * tabs komponenti ek sekme semantiği ekler.
 * @security Tüm backend çağrıları yalnız oturum çereziyle yapılır;
 * `audit:log:read` permission kontrolü backend tarafından uygulanır.
 */

import { SUPPORTED_LOCALES } from "@vetniva/contracts";
import { notFound } from "next/navigation";

import { SuperadminShell } from "@/components/layouts/superadmin-shell";
import { RetentionTabs } from "@/components/superadmin/retention-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { getLabels, type Locale as LabelsLocale } from "@/lib/labels";

type PageParams = { locale: string };

/**
 *
 * @param root0
 * @param root0.params
 */
export default async function RetentionPage({
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

  return (
    <SuperadminShell
      locale={locale}
      pageTitle={labels.retention.title}
      pageDescription={labels.retention.description}
      user={{ name: labels.superadmin.user, role: "SUPERADMIN" }}
    >
      <PageHeader
        title={labels.retention.title}
        description={labels.retention.description}
        breadcrumb={[
          {
            label: labels.superadmin.breadcrumb.root,
            href: `/${locale}/superadmin`,
          },
          { label: labels.retention.title },
        ]}
      />
      <RetentionTabs locale={locale} />
    </SuperadminShell>
  );
}
