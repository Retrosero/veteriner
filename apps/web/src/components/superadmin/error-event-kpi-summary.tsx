/**
 * @file Error Center KPI özet kartları.
 * @module @vetniva/web/components/superadmin/error-event-kpi-summary
 * @description FAZ-10 SUPERADMIN Error Center sayfasının üst kısmında
 * dört sayısal metrik kartı gösterir:
 *  - `total` — son 24 saatteki hata olayı toplamı
 *  - `critical` — son 24 saatteki kritik olay sayısı
 *  - `investigating` — `investigating` statüsündeki tüm olaylar
 *  - `reopened` — `reopened` statüsündeki tüm olaylar
 *
 * Her kart `null` aldığında "yüklenemedi" rozetini gösterir; sayısal
 * kartlardan herhangi biri başarısız olursa tek rozet ile geri
 * kalan kartlar etkilenmez. Backend çağrıları sayfada (server)
 * yapılır; bu komponent yalnız sunum yapar.
 *
 * Erişilebilirlik:
 * - `role="group"` + `aria-label` üst grup
 * - Her kart `role="article"` + `aria-label` ile
 * - Yüklenemedi durumunda `role="status"` rozet
 * @security KPI değerleri aggregate sayılardır; PII içermez.
 * Yalnız `audit:log:read` yetkisi ile API'den gelir.
 */

import { Badge } from "@vetniva/ui";
import { cn } from "@vetniva/ui/cn";

export type ErrorEventKpiSummaryLabels = {
  title: string;
  total: string;
  critical: string;
  investigating: string;
  reopened: string;
  loadErrorHint: string;
};

export type ErrorEventKpiSummaryProps = {
  total?: number | null;
  critical?: number | null;
  investigating?: number | null;
  reopened?: number | null;
  totalLoadFailed?: boolean;
  criticalLoadFailed?: boolean;
  investigatingLoadFailed?: boolean;
  reopenedLoadFailed?: boolean;
  labels: ErrorEventKpiSummaryLabels;
  className?: string;
};

/**
 * Sayıyı insan-okunabilir formata dönüştürür. 1000+ için yerel
 * binlik ayracı kullanılır. null/undefined durumunda "—" döner.
 * @param n
 */
function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
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
  value: number | null | undefined;
  failed: boolean;
  failedHint: string;
}): JSX.Element {
  return (
    <article
      aria-label={label}
      className={cn(
        "flex flex-col gap-3 rounded-[14px] border border-[#E1E5E2] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-md",
      )}
      role="article"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-[#5F6368]">{label}</span>
        {failed ? (
          <Badge role="status" size="sm" tone="warning">
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
 * Error Center sayfası için dört metrikten oluşan KPI özet kartları.
 * Tek bir alt KPI başarısız olursa yalnızca o kart "yüklenemedi"
 * rozeti gösterir; diğerleri normal render edilir.
 * @param root0
 * @param root0.total
 * @param root0.critical
 * @param root0.investigating
 * @param root0.reopened
 * @param root0.totalLoadFailed
 * @param root0.criticalLoadFailed
 * @param root0.investigatingLoadFailed
 * @param root0.reopenedLoadFailed
 * @param root0.labels
 * @param root0.className
 */
export function ErrorEventKpiSummary({
  total,
  critical,
  investigating,
  reopened,
  totalLoadFailed = false,
  criticalLoadFailed = false,
  investigatingLoadFailed = false,
  reopenedLoadFailed = false,
  labels,
  className,
}: ErrorEventKpiSummaryProps): JSX.Element {
  return (
    <section
      aria-label={labels.title}
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
      role="group"
    >
      <KpiCell
        failed={totalLoadFailed}
        failedHint={labels.loadErrorHint}
        label={labels.total}
        value={total}
      />
      <KpiCell
        failed={criticalLoadFailed}
        failedHint={labels.loadErrorHint}
        label={labels.critical}
        value={critical}
      />
      <KpiCell
        failed={investigatingLoadFailed}
        failedHint={labels.loadErrorHint}
        label={labels.investigating}
        value={investigating}
      />
      <KpiCell
        failed={reopenedLoadFailed}
        failedHint={labels.loadErrorHint}
        label={labels.reopened}
        value={reopened}
      />
    </section>
  );
}
