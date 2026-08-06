/**
 * @file Retention sweep geçmişi listesi bileşeni.
 * @module @vetniva/web/components/superadmin/retention-sweep-list
 * @description SUPERADMIN Log Retention — Sweeps sekmesinin filtreli
 * tablo görünümü. `from`/`to` tarih filtresi ile geçmiş sweep
 * kayıtlarını listeler. Her satıra tıklamak sweep detay sayfasına
 * yönlendirir.
 *
 * Erişilebilirlik:
 * - Tarih inputları `aria-label` ile etiketlenir
 * - Boş/hata durumları `role="status"` / `role="alert"`
 * - Yükleme durumu `aria-busy`
 * @security Backend `audit:log:read` kontrolü uygular; UI tenant
 * bilgisi göndermez, sweep scope backend'de çözülür.
 */

"use client";

import { Badge } from "@vetniva/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "@/lib/api-client";
import { getLabels, type Locale } from "@/lib/labels";

type SweepListItem = {
  id: string;
  triggeredBy: string;
  triggeredByType: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  dryRun: boolean;
};

type SweepListResponse = { items: SweepListItem[]; total: number };

type FilterState = {
  from: string;
  to: string;
};

const INITIAL_FILTERS: FilterState = { from: "", to: "" };

export type RetentionSweepListProps = {
  locale: Locale;
};

function buildPath(filters: FilterState): string {
  const query = new URLSearchParams({ limit: "50", offset: "0" });
  if (filters.from) query.set("from", new Date(filters.from).toISOString());
  if (filters.to) query.set("to", new Date(filters.to).toISOString());
  return `/api/v1/superadmin/log-retention/sweeps?${query.toString()}`;
}

/**
 * Süre (ms) → insan-okunabilir "1s 234ms" gibi bir metin.
 * @param ms
 */
function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  return `${minutes}m ${remSec}s`;
}

/**
 * Filtreli sweep geçmişi. `from` ve `to` alanları `<input type="datetime-local">`
 * olarak alınır ve ISO-8601'e dönüştürülerek query'ye yazılır.
 * @param root0
 * @param root0.locale
 */
export function RetentionSweepList({
  locale,
}: RetentionSweepListProps): JSX.Element {
  const labels = getLabels(locale).retention;
  const [data, setData] = useState<SweepListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const path = useMemo(() => buildPath(filters), [filters]);

  useEffect(() => {
    let active = true;
    setError(null);
    void apiRequest<SweepListResponse>(path, { credentials: "include" }).then(
      (result) => {
        if (!active) return;
        if (result.ok) setData(result.data);
        else setError(labels.common.error);
      },
    );
    return () => {
      active = false;
    };
  }, [path, labels.common.error]);

  const updateFilter = (field: keyof FilterState, value: string): void => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  return (
    <section
      aria-busy={data === null && !error}
      aria-label={labels.tabs.sweeps}
      className="space-y-4"
      data-testid="retention-sweep-list"
    >
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        <label className="text-sm text-slate-700">
          <span className="font-medium">{labels.filters.from}</span>
          <input
            aria-label={labels.filters.from}
            className="mt-1 h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-clinic-500 focus:outline-none focus:ring-2 focus:ring-clinic-500/20"
            onChange={(e) => updateFilter("from", e.target.value)}
            type="datetime-local"
            value={filters.from}
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="font-medium">{labels.filters.to}</span>
          <input
            aria-label={labels.filters.to}
            className="mt-1 h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 px-3 text-sm focus:border-clinic-500 focus:outline-none focus:ring-2 focus:ring-clinic-500/20"
            onChange={(e) => updateFilter("to", e.target.value)}
            type="datetime-local"
            value={filters.to}
          />
        </label>
      </div>

      {error ? (
        <p
          className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {!data && !error ? (
        <p className="text-slate-500" role="status">
          {labels.common.loading}
        </p>
      ) : null}

      {data && data.items.length === 0 && !error ? (
        <p
          className="rounded border border-slate-200 bg-white p-6 text-center text-sm text-slate-500"
          role="status"
        >
          {labels.common.empty}
        </p>
      ) : null}

      {data && data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-[14px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3 text-sm text-slate-600">
            {labels.sweep.totals}: {data.total}
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-3" scope="col">
                  {labels.sweep.id}
                </th>
                <th className="px-5 py-3" scope="col">
                  {labels.sweep.startedAt}
                </th>
                <th className="px-5 py-3" scope="col">
                  {labels.sweep.duration}
                </th>
                <th className="px-5 py-3" scope="col">
                  {labels.sweep.dryRun}
                </th>
                <th className="px-5 py-3" scope="col">
                  {labels.sweep.triggeredBy}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((sweep) => (
                <tr
                  className="border-t border-slate-100 transition-colors hover:bg-slate-50"
                  key={sweep.id}
                >
                  <td className="px-5 py-3">
                    <Link
                      aria-label={`${labels.common.detail}: ${sweep.id}`}
                      className="font-mono text-xs text-clinic-700 hover:underline"
                      href={`/${locale}/superadmin/retention/sweeps/${encodeURIComponent(sweep.id)}`}
                    >
                      {sweep.id}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-600">
                    {new Date(sweep.startedAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">
                    {formatDuration(sweep.durationMs)}
                  </td>
                  <td className="px-5 py-3">
                    {sweep.dryRun ? (
                      <Badge size="sm" tone="warning">
                        {labels.common.dryRun}
                      </Badge>
                    ) : (
                      <Badge size="sm" tone="success">
                        Live
                      </Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">
                    {sweep.triggeredBy}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
