/**
 * @file Süper admin güvenlik olayları liste sayfası.
 * @module @vetniva/web/app/[locale]/superadmin/security-events/page
 * @description FAZ-10 SUPERADMIN paneli güvenlik olayları modülünün
 * giriş sayfası. Tüm tenant'ların güvenlik olaylarını
 * (failed_login, unauthorized_access_attempt, suspicious_export,
 * role_change, tenant_isolation_breach_attempt) filtreli olarak
 * listeler ve detay sayfasına yönlendirir. Sayfanın üst
 * kısmında summary kartları da yer alır; severity × type
 * kırılımı ve top-20 fingerprint saldırı sınıfı görünür.
 *
 * Sayfa, server component olarak `locale` doğrulaması yapar
 * ve ardından etiketleri hazırlayıp client komponentleri
 * (`SecurityEventList`, `SecurityEventSummary`) sarmalar. Tüm
 * veri çağrıları client tarafında, SUPERADMIN oturum çerezi
 * ile yapılır.
 *
 * @security Tüm backend çağrıları `audit:log:read`
 * permission'ı gerektirir. Tenant, kullanıcı veya aktör
 * kimliği istemciden gönderilmez; backend SUPERADMIN
 * oturumundan türetir.
 */

import { SUPPORTED_LOCALES } from "@vetniva/contracts";
import { notFound } from "next/navigation";

import { SuperadminShell } from "@/components/layouts/superadmin-shell";
import { SecurityEventList } from "@/components/superadmin/security-event-list";
import { SecurityEventSummary } from "@/components/superadmin/security-event-summary";
import { PageHeader } from "@/components/ui/page-header";
import { getLabels, type Locale as LabelsLocale } from "@/lib/labels";

type PageParams = { locale: string };

/**
 * Son 24 saat için ISO-8601 zaman damgası. Summary endpoint'i
 * opsiyonel `from` filtresi kabul eder; yoksa tüm zamanları
 * döner. 24 saatlik pencere dashboard ile tutarlıdır.
 */
function iso24hAgo(now: Date): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
}

/**
 *
 * @param root0
 * @param root0.params
 */
export default async function SecurityEventsPage({
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
  const summaryFrom = iso24hAgo(new Date());

  return (
    <SuperadminShell
      locale={locale}
      pageTitle={labels.securityEvents.title}
      pageDescription={labels.securityEvents.description}
      user={{ name: labels.superadmin.user, role: "SUPERADMIN" }}
    >
      <PageHeader
        title={labels.securityEvents.title}
        description={labels.securityEvents.description}
        breadcrumb={[
          {
            label: labels.superadmin.breadcrumb.root,
            href: `/${locale}/superadmin`,
          },
          { label: labels.securityEvents.title },
        ]}
      />
      <div className="space-y-6">
        <SecurityEventSummary from={summaryFrom} locale={locale} />
        <SecurityEventList locale={locale} />
      </div>
    </SuperadminShell>
  );
}
