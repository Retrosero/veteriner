/**
 * @file Süper admin hata merkezi sayfası.
 * @module @vetniva/web/app/[locale]/superadmin/error-center
 * @description FAZ-10 (GOAL-103 + GOAL-104) kalıcı hata olaylarının
 * yönetim yüzeyi. Sayfa yalnız SUPERADMIN oturumunda backend'in
 * yetki kontrolünden veri alır; tenant veya kullanıcı kimliği
 * tarayıcıdan türetilmez.
 *
 * Tick 1C (zenginleştirme) sürümünde:
 *  - Üst kısımda 4 KPI kartı (total/critical 24s, investigating/reopened status)
 *  - "Liste" ve "Gruplar (fingerprint)" sekmeleri
 *  - Liste sekmesinde filtreli tablo + detay paneli
 *  - Gruplar sekmesinde fingerprint agregat tablosu + detay modal
 * @security Tüm backend çağrıları `audit:log:read` permission'ı
 * gerektirir. Notlar PII mask'tan geçirilir.
 */

import { SUPPORTED_LOCALES } from "@vetniva/contracts";
import { notFound } from "next/navigation";

import { SuperadminShell } from "@/components/layouts/superadmin-shell";
import { ErrorEventGroups } from "@/components/superadmin/error-event-groups";
import { ErrorEventKpiSummary } from "@/components/superadmin/error-event-kpi-summary";
import { ErrorEventList } from "@/components/superadmin/error-event-list";
import { ErrorEventTabs } from "@/components/superadmin/error-event-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { apiRequest } from "@/lib/api-client";
import { getLabels, type Locale as LabelsLocale } from "@/lib/labels";

type PageParams = { locale: string };

/**
 * Hata olayı summary response şeması (sözleşme). 24 saatlik
 * aggregate istatistikler sağlar; `bySeverity`, `byModule`,
 * `byErrorCode` ve `byStatus` toplamları içerir.
 */
type ErrorEventSummary = {
  total: number;
  bySeverity: Array<{ severity: string; count: number }>;
  byModule: Array<{ module: string; count: number }>;
  byErrorCode: Array<{ errorCode: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  topFingerprints: Array<{
    fingerprint: string;
    severity: string;
    module: string;
    errorCode: string;
    eventCount: number;
  }>;
};

/**
 * byStatus / bySeverity dizilerinden belirli bir anahtarın
 * sayısını döner. Anahtar yoksa 0.
 * @param buckets
 * @param key
 */
function pickCount(
  buckets: ReadonlyArray<{ count: number } & Record<string, unknown>>,
  key: string,
): number {
  return (
    buckets.find(
      (bucket) => bucket["severity"] === key || bucket["status"] === key,
    )?.count ?? 0
  );
}

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
 * Summary'yi sunucu tarafında çeker. Hata durumunda null döner;
 * UI'da ilgili KPI kartı "yüklenemedi" rozeti gösterir.
 */
async function loadSummary(): Promise<ErrorEventSummary | null> {
  const from = iso24hAgo(new Date());
  const result = await apiRequest<ErrorEventSummary>(
    `/api/v1/superadmin/error-events/summary?from=${encodeURIComponent(from)}`,
    { credentials: "include" },
  );
  return result.ok ? result.data : null;
}

/**
 *
 * @param root0
 * @param root0.params
 */
export default async function ErrorCenterPage({
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
  const ecLabels = labels.errorCenter;
  const summary = await loadSummary();

  return (
    <SuperadminShell
      locale={locale}
      pageTitle={ecLabels.title}
      pageDescription={ecLabels.description}
      user={{ name: labels.superadmin.user, role: "SUPERADMIN" }}
    >
      <PageHeader
        title={ecLabels.title}
        description={ecLabels.description}
        breadcrumb={[
          {
            label: labels.superadmin.breadcrumb.root,
            href: `/${locale}/superadmin`,
          },
          { label: ecLabels.title },
        ]}
      />
      <div className="space-y-6">
        <ErrorEventKpiSummary
          critical={summary ? pickCount(summary.bySeverity, "critical") : null}
          criticalLoadFailed={!summary}
          investigating={
            summary ? pickCount(summary.byStatus, "investigating") : null
          }
          investigatingLoadFailed={!summary}
          labels={{
            title: ecLabels.kpi.title,
            total: ecLabels.kpi.total,
            critical: ecLabels.kpi.critical,
            investigating: ecLabels.kpi.investigating,
            reopened: ecLabels.kpi.reopened,
            loadErrorHint: ecLabels.kpi.loadErrorHint,
          }}
          reopened={summary ? pickCount(summary.byStatus, "reopened") : null}
          reopenedLoadFailed={!summary}
          total={summary?.total ?? null}
          totalLoadFailed={!summary}
        />
        <ErrorEventTabs
          activeTab="list"
          groupsContent={
            <ErrorEventGroups
              labels={{
                title: ecLabels.groups.title,
                loading: ecLabels.groups.loading,
                empty: ecLabels.groups.empty,
                loadFailed: ecLabels.groups.loadFailed,
                detailTitle: ecLabels.groups.detailTitle,
                detailLoading: ecLabels.groups.detailLoading,
                detailLoadFailed: ecLabels.groups.detailLoadFailed,
                detailClose: ecLabels.groups.detailClose,
                columns: ecLabels.groups.columns,
                filters: {
                  severity: "Şiddet",
                  module: "Modül",
                  status: "Durum",
                  all: "Tümü",
                },
                detail: {
                  events: "Son olaylar",
                  message: "Mesaj",
                  tenant: "Tenant",
                },
                retry: ecLabels.retry,
              }}
            />
          }
          labels={{
            list: ecLabels.tabs.list,
            groups: ecLabels.tabs.groups,
          }}
          listContent={<ErrorEventList locale={locale} />}
          onTabChange={() => undefined}
        />
      </div>
    </SuperadminShell>
  );
}
