/**
 * @file KPI kartı.
 * @module @vetniva/web/components/ui/kpi-card
 * @description Dashboard ve rapor sayfalarında kullanılan metrik
 * kartı. Büyük değer, etiket, önceki dönemle karşılaştırma (delta) ve
 * ikon içerir.
 *
 * Erişilebilirlik:
 * - `role="article"` + `aria-label` ile screen reader uyumu
 * - Delta yönü `aria-label` ile açıkça belirtilir ("+2 artış", "-1
 *   azalış").
 * @security Hassas metrikler (örn. tam gelir) PII içermemelidir;
 * bu bileşen aggregation sonrası sayıları kabul eder.
 */

import { Badge } from "@vetniva/ui";
import { cn } from "@vetniva/ui/cn";

export type KpiCardProps = {
  label: string;
  value: string;
  /**
   * Önceki dönemle karşılaştırma. Pozitif değer artış, negatif değer
   * azalış anlamına gelir. `null` karşılaştırma yok.
   */
  delta?: number | null;
  /**
   * Delta formatı: `absolute` (tam sayı, +2) veya `percent` (%, +15%).
   */
  deltaFormat?: "absolute" | "percent";
  /**
   * Sağ üstte gösterilecek ikon (24×24, klinik veya gri ton).
   */
  icon?: React.ReactNode;
  /**
   * Alt kısımda gösterilecek yardımcı metin (örn. "dünden").
   */
  hint?: string;
  className?: string;
};

/**
 *
 * @param delta
 * @param format
 */
function formatDelta(delta: number, format: "absolute" | "percent"): string {
  const sign = delta > 0 ? "+" : "";
  if (format === "percent") {
    return `${sign}${delta.toFixed(1)}%`;
  }
  return `${sign}${delta}`;
}

/**
 *
 * @param delta
 */
function deltaTone(delta: number): "success" | "danger" | "neutral" {
  if (delta > 0) return "success";
  if (delta < 0) return "danger";
  return "neutral";
}

/**
 *
 * @param root0
 * @param root0.label
 * @param root0.value
 * @param root0.delta
 * @param root0.deltaFormat
 * @param root0.icon
 * @param root0.hint
 * @param root0.className
 */
export function KpiCard({
  label,
  value,
  delta,
  deltaFormat = "absolute",
  icon,
  hint,
  className,
}: KpiCardProps): JSX.Element {
  return (
    <article
      role="article"
      aria-label={label}
      className={cn(
        "group flex flex-col gap-3 rounded-[14px] border border-[#E1E5E2] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-[#5F6368]">{label}</span>
        {icon ? (
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#F0F8F3] text-[#0D4D2E]"
          >
            <span className="h-5 w-5">{icon}</span>
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-semibold tracking-tight text-[#1D1D1F] sm:text-3xl">
          {value}
        </span>
        {typeof delta === "number" ? (
          <Badge
            tone={deltaTone(delta)}
            size="md"
            aria-label={formatDelta(delta, deltaFormat)}
          >
            {formatDelta(delta, deltaFormat)}
          </Badge>
        ) : null}
      </div>

      {hint ? <p className="text-xs text-[#86868B]">{hint}</p> : null}
    </article>
  );
}
