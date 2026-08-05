/**
 * @file Job runs KPI özet kartları.
 * @module @vetniva/web/components/superadmin/job-run-summary
 * @description FAZ-10 SUPERADMIN Job Runs sayfasının üst kısmında
 * sekiz sayısal metrik kartı gösterir:
 *  - `total` — tüm job run sayısı
 *  - `succeeded` — başarı ile tamamlananlar
 *  - `failed` — hata ile sonuçlananlar (henüz dead-letter değil)
 *  - `deadLetter` — dead-letter'a terfi edenler
 *  - `running` — şu an çalışanlar
 *  - `pending` — kuyrukta bekleyenler
 *  - `last24hDeadLetter` — son 24 saatteki dead-letter sayısı
 *  - `oldestRunning` — en eski çalışan job'un başlangıç zamanı
 *
 * Her kart `null` aldığında "Yüklenemedi" rozetini gösterir; tek bir
 * alt metrik başarısız olursa yalnız o kart etkilenir, diğerleri
 * normal render edilir. Backend çağrıları sayfada (server) yapılır;
 * bu komponent yalnız sunum yapar.
 *
 * Erişilebilirlik:
 * - `role="group"` + `aria-label` üst grup
 * - Her kart `role="article"` + `aria-label`
 * - Yüklenemedi durumunda `role="status"` rozet
 * @security KPI değerleri aggregate sayılardır; PII içermez.
 * Yalnız `audit:log:read` yetkisi ile API'den gelir.
 */

import { Badge } from "@vetniva/ui";
import { cn } from "@vetniva/ui/cn";

export type JobRunSummaryLabels = {
  title: string;
  total: string;
  succeeded: string;
  failed: string;
  deadLetter: string;
  running: string;
  pending: string;
  last24hDeadLetter: string;
  oldestRunning: string;
  oldestRunningNone: string;
  loadErrorHint: string;
};

export type JobRunSummaryProps = {
  total?: number | null;
  succeeded?: number | null;
  failed?: number | null;
  deadLetter?: number | null;
  running?: number | null;
  pending?: number | null;
  last24hDeadLetter?: number | null;
  oldestRunningStartedAt?: string | null;
  totalLoadFailed?: boolean;
  succeededLoadFailed?: boolean;
  failedLoadFailed?: boolean;
  deadLetterLoadFailed?: boolean;
  runningLoadFailed?: boolean;
  pendingLoadFailed?: boolean;
  last24hDeadLetterLoadFailed?: boolean;
  oldestRunningLoadFailed?: boolean;
  labels: JobRunSummaryLabels;
  className?: string;
};

/**
 * Sayıyı insan-okunabilir formata dönüştürür. 1000+ için yerel
 * binlik ayracı kullanılır. null durumunda "—" döner.
 * @param n
 */
function formatNumber(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString();
}

/**
 * ISO-8601 zaman damgasını kısa formata (örn. "12.08.2026 14:32")
 * dönüştürür. Hatalı veya null değer "—" döner.
 * @param iso
 */
function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

/**
 * Tek bir KPI kartı; başarısız yükleme veya null değer için
 * "Yüklenemedi" rozeti gösterir. Sayısal ve zaman etiketli
 * varyantları destekler.
 * @param root0
 * @param root0.label
 * @param root0.value
 * @param root0.failed
 * @param root0.failedHint
 * @param root0.display
 */
function KpiCell({
  label,
  value,
  failed,
  failedHint,
  display,
}: {
  label: string;
  value: number | string | null;
  failed: boolean;
  failedHint: string;
  display?: "number" | "time";
}): JSX.Element {
  let formatted: string;
  if (display === "time") {
    formatted =
      typeof value === "string" ? formatTimestamp(value) : formatNumber(null);
  } else {
    formatted = formatNumber(typeof value === "number" ? value : null);
  }
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
            display === "time"
              ? "text-base font-semibold tracking-tight text-[#1D1D1F] sm:text-lg"
              : "text-2xl font-semibold tracking-tight text-[#1D1D1F] sm:text-3xl",
            failed && "text-[#9CA3AF]",
          )}
        >
          {formatted}
        </span>
      </div>
    </article>
  );
}

/**
 * Job Runs sayfası için sekiz metrikten oluşan KPI özet kartları.
 * Tek bir alt KPI başarısız olursa yalnızca o kart "Yüklenemedi"
 * rozeti gösterir; diğerleri normal render edilir.
 * @param root0
 * @param root0.total
 * @param root0.succeeded
 * @param root0.failed
 * @param root0.deadLetter
 * @param root0.running
 * @param root0.pending
 * @param root0.last24hDeadLetter
 * @param root0.oldestRunningStartedAt
 * @param root0.totalLoadFailed
 * @param root0.succeededLoadFailed
 * @param root0.failedLoadFailed
 * @param root0.deadLetterLoadFailed
 * @param root0.runningLoadFailed
 * @param root0.pendingLoadFailed
 * @param root0.last24hDeadLetterLoadFailed
 * @param root0.oldestRunningLoadFailed
 * @param root0.labels
 * @param root0.className
 */
export function JobRunSummary({
  total = null,
  succeeded = null,
  failed = null,
  deadLetter = null,
  running = null,
  pending = null,
  last24hDeadLetter = null,
  oldestRunningStartedAt = null,
  totalLoadFailed = false,
  succeededLoadFailed = false,
  failedLoadFailed = false,
  deadLetterLoadFailed = false,
  runningLoadFailed = false,
  pendingLoadFailed = false,
  last24hDeadLetterLoadFailed = false,
  oldestRunningLoadFailed = false,
  labels,
  className,
}: JobRunSummaryProps): JSX.Element {
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
        failed={succeededLoadFailed}
        failedHint={labels.loadErrorHint}
        label={labels.succeeded}
        value={succeeded}
      />
      <KpiCell
        failed={failedLoadFailed}
        failedHint={labels.loadErrorHint}
        label={labels.failed}
        value={failed}
      />
      <KpiCell
        failed={deadLetterLoadFailed}
        failedHint={labels.loadErrorHint}
        label={labels.deadLetter}
        value={deadLetter}
      />
      <KpiCell
        failed={runningLoadFailed}
        failedHint={labels.loadErrorHint}
        label={labels.running}
        value={running}
      />
      <KpiCell
        failed={pendingLoadFailed}
        failedHint={labels.loadErrorHint}
        label={labels.pending}
        value={pending}
      />
      <KpiCell
        failed={last24hDeadLetterLoadFailed}
        failedHint={labels.loadErrorHint}
        label={labels.last24hDeadLetter}
        value={last24hDeadLetter}
      />
      <KpiCell
        failed={oldestRunningLoadFailed}
        failedHint={labels.loadErrorHint}
        label={labels.oldestRunning}
        value={oldestRunningStartedAt}
        display="time"
      />
    </section>
  );
}
