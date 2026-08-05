/**
 * @file SUPERADMIN dashboard KPI özet kartları.
 * @module @vetniva/web/components/superadmin/superadmin-kpi-summary
 * @description FAZ-10 SUPERADMIN paneli giriş ekranında üç
 * sayısal metrik kartı gösterir: 24 saatlik hata olayı, 24
 * saatlik dead-letter job sayısı ve 24 saatlik güvenlik olayı
 * sayısı. Herhangi bir alt API başarısız olursa kart "yüklenemedi"
 * rozetini gösterir; bu sayede tek bir sorun tüm paneli
 * gizlemez.
 *
 * Erişilebilirlik:
 * - `role="group"` + `aria-label` üst grup
 * - Her kart `role="article"`
 * - Yüklenemedi durumunda `role="status"` ile ekran okuyucuya bildirim
 * @security KPI değerleri aggregate sayılardır; PII içermez.
 * Yalnız `audit:log:read` yetkisi ile API'den gelir.
 */

import { Badge } from "@vetniva/ui";
import { cn } from "@vetniva/ui/cn";

export type SuperadminKpiSummaryLabels = {
  kpiErrors: string;
  kpiDeadLetter: string;
  kpiSecurity: string;
  loadErrorHint: string;
};

export type SuperadminKpiSummaryProps = {
  errorsTotal: number | null;
  deadLetter24h: number | null;
  securityEvents24h: number | null;
  errorLoadFailed?: boolean;
  jobLoadFailed?: boolean;
  securityLoadFailed?: boolean;
  labels: SuperadminKpiSummaryLabels;
  className?: string;
};

/**
 * Üç sayıyı insan-okunabilir formata dönüştürür. 1000+ için
 * Türkçe/İngilizce ortak binlik ayracı kullanılır.
 * @param n
 */
function formatNumber(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString();
}

/**
 * Tek bir KPI kartı; başarısız yükleme veya null değer için
 * "yüklenemedi" rozeti gösterir.
 * @param root0
 * @param root0.label
 * @param root0.value
 * @param root0.failed
 * @param root0.failedHint
 */
function KpiCell({
  label,
  value,
  failed,
  failedHint,
}: {
  label: string;
  value: number | null;
  failed: boolean;
  failedHint: string;
}): JSX.Element {
  return (
    <article
      role="article"
      aria-label={label}
      className={cn(
        "flex flex-col gap-3 rounded-[14px] border border-[#E1E5E2] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-[#5F6368]">{label}</span>
        {failed ? (
          <Badge tone="warning" size="sm" role="status">
            {failedHint}
          </Badge>
        ) : null}
      </div>
      <div className="flex items-baseline gap-3">
        <span
          className={cn(
            "text-2xl font-semibold tracking-tight text-[#1D1D1F] sm:text-3xl",
            failed && "text-[#9CA3AF]",
          )}
        >
          {formatNumber(value)}
        </span>
      </div>
    </article>
  );
}

/**
 *
 * @param root0
 * @param root0.errorsTotal
 * @param root0.deadLetter24h
 * @param root0.securityEvents24h
 * @param root0.errorLoadFailed
 * @param root0.jobLoadFailed
 * @param root0.securityLoadFailed
 * @param root0.labels
 * @param root0.className
 */
export function SuperadminKpiSummary({
  errorsTotal,
  deadLetter24h,
  securityEvents24h,
  errorLoadFailed = false,
  jobLoadFailed = false,
  securityLoadFailed = false,
  labels,
  className,
}: SuperadminKpiSummaryProps): JSX.Element {
  return (
    <section
      aria-label="Süper admin 24 saat özeti"
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
      role="group"
    >
      <KpiCell
        failed={errorLoadFailed}
        failedHint={labels.loadErrorHint}
        label={labels.kpiErrors}
        value={errorsTotal}
      />
      <KpiCell
        failed={jobLoadFailed}
        failedHint={labels.loadErrorHint}
        label={labels.kpiDeadLetter}
        value={deadLetter24h}
      />
      <KpiCell
        failed={securityLoadFailed}
        failedHint={labels.loadErrorHint}
        label={labels.kpiSecurity}
        value={securityEvents24h}
      />
    </section>
  );
}
