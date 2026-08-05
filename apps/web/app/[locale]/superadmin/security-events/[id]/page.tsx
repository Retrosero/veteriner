/**
 * @file Süper admin güvenlik olayı detay sayfası.
 * @module @vetniva/web/app/[locale]/superadmin/security-events/[id]/page
 * @description FAZ-10 SUPERADMIN paneli güvenlik olayı detay
 * sayfası. `[id]` segmentindeki olay kimliğiyle tek bir kaydın
 * tüm alanlarını (type, severity, module, errorCode, message,
 * statusCode, fingerprint, requestId, maskedIp, userAgentHash,
 * country, route, release, occurrenceCount, firstSeenAt,
 * lastSeenAt, alertSent, PII-mask'lı context) salt okunur
 * olarak gösterir. Liste sayfasına geri dönüş bağlantısı
 * içerir.
 *
 * Server component olarak `locale` doğrulaması yapar; ID
 * bazlı veri çağrısı client tarafında gerçekleşir. Detay
 * komponenti (`SecurityEventDetail`) oturum çerezi ile
 * `/api/v1/superadmin/security-events/{id}` endpoint'ine
 * istek gönderir.
 *
 * @security ID URL'de taşındığı için path-traversal benzeri
 * saldırılar yalnız backend'de whitelist ile sınırlandırılır;
 * client bu ID'yi verbatim aktarır. Tenant, kullanıcı ve
 * aktör bilgisi istemciden gönderilmez.
 */

import { SUPPORTED_LOCALES } from "@vetniva/contracts";
import { notFound } from "next/navigation";

import { SuperadminShell } from "@/components/layouts/superadmin-shell";
import { SecurityEventDetail } from "@/components/superadmin/security-event-detail";
import { PageHeader } from "@/components/ui/page-header";
import { getLabels, type Locale as LabelsLocale } from "@/lib/labels";

type PageParams = { locale: string; id: string };

/**
 *
 * @param root0
 * @param root0.params
 */
export default async function SecurityEventDetailPage({
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
      pageTitle={labels.securityEvents.title}
      pageDescription={labels.securityEvents.description}
      user={{ name: labels.superadmin.user, role: "SUPERADMIN" }}
    >
      <PageHeader
        title={labels.securityEvents.detail.heading}
        description={labels.securityEvents.description}
        breadcrumb={[
          {
            label: labels.superadmin.breadcrumb.root,
            href: `/${locale}/superadmin`,
          },
          {
            label: labels.securityEvents.title,
            href: `/${locale}/superadmin/security-events`,
          },
          { label: labels.securityEvents.detail.heading },
        ]}
      />
      <SecurityEventDetail eventId={id} locale={locale} />
    </SuperadminShell>
  );
}
