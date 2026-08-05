/**
 * @file Retention policy listesi bileşeni.
 * @module @vetniva/web/components/superadmin/retention-policy-list
 * @description SUPERADMIN Log Retention — Policies sekmesinin filtreli
 * tablo görünümü. tenantId/logType/severity filtrelerini query'ye
 * taşır, ilk 50 policy'yi getirir ve tablo halinde gösterir. Satıra
 * tıklamak policy detay sayfasına yönlendirir.
 *
 * Erişilebilirlik:
 * - Filtre alanları `aria-label` ile etiketlenir
 * - Tablo `role="table"` semantiğine sahip
 * - Yükleme durumu `aria-busy`
 * - Boş/hata durumları `role="status"` / `role="alert"`
 * @security Tüm API çağrıları yalnızca oturum çereziyle yapılır;
 * filtre değerleri whitelist edilmiş alanlardır.
 */

"use client";

import { Badge } from "@vetniva/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";


import { apiRequest } from "@/lib/api-client";
import { getLabels, type Locale } from "@/lib/labels";
import { safeLabelLookup } from "@/lib/safe-lookup";

const LOG_TYPES = [
  "audit_log",
  "error_event",
  "security_event",
  "job_run",
  "notification",
  "request_log",
] as const;

const SEVERITIES = ["info", "warning", "error", "critical"] as const;

type LogType = (typeof LOG_TYPES)[number];
type Severity = (typeof SEVERITIES)[number];

type RetentionPolicy = {
  id: string;
  tenantId: string | null;
  logType: string;
  severity: string;
  retentionDays: number;
  archiveAfterDays: number;
  archiveStorage: "hot" | "cold" | "none";
  redactPii: boolean;
  createdById: string;
  createdAt: string;
  updatedById?: string | null;
  updatedAt?: string | null;
};

type RetentionPolicyList = { items: RetentionPolicy[]; total: number };

type FilterState = {
  tenantId: string;
  logType: string;
  severity: string;
};

const INITIAL_FILTERS: FilterState = {
  tenantId: "",
  logType: "",
  severity: "",
};

export type RetentionPolicyListProps = {
  locale: Locale;
};

function buildPath(filters: FilterState): string {
  const query = new URLSearchParams({ limit: "50", offset: "0" });
  if (filters.tenantId.trim()) query.set("tenantId", filters.tenantId.trim());
  if (filters.logType) query.set("logType", filters.logType);
  if (filters.severity) query.set("severity", filters.severity);
  return `/api/v1/superadmin/log-retention/policies?${query.toString()}`;
}

/**
 * Filtreli policy listesi. Sıralama backend tarafında yapılır; UI
 * yalnız filtreleri query'ye taşır ve gelen `items` dizisini render
 * eder. Satır tıklaması `/superadmin/retention/{id}` detay sayfasına
 * yönlendirir.
 * @param root0
 * @param root0.locale
 */
export function RetentionPolicyList({
  locale,
}: RetentionPolicyListProps): JSX.Element {
  const labels = getLabels(locale).retention;
  const [data, setData] = useState<RetentionPolicyList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const path = useMemo(() => buildPath(filters), [filters]);

  useEffect(() => {
    let active = true;
    setError(null);
    void apiRequest<RetentionPolicyList>(path, { credentials: "include" }).then(
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
      aria-label={labels.tabs.policies}
      className="space-y-4"
      data-testid="retention-policy-list"
    >
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
        <label className="text-sm text-slate-700">
          <span className="font-medium">{labels.filters.tenant}</span>
          <input
            aria-label={labels.filters.tenant}
            className="mt-1 h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-clinic-500 focus:outline-none focus:ring-2 focus:ring-clinic-500/20"
            onChange={(e) => updateFilter("tenantId", e.target.value)}
            placeholder={labels.filters.tenantPlaceholder}
            value={filters.tenantId}
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="font-medium">{labels.filters.logType}</span>
          <select
            aria-label={labels.filters.logType}
            className="mt-1 h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-clinic-500 focus:outline-none focus:ring-2 focus:ring-clinic-500/20"
            onChange={(e) => updateFilter("logType", e.target.value)}
            value={filters.logType}
          >
            <option value="">{labels.filters.all}</option>
            {LOG_TYPES.map((t) => (
              <option key={t} value={t}>
                {safeLabelLookup(labels.logType, t, t)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          <span className="font-medium">{labels.filters.severity}</span>
          <select
            aria-label={labels.filters.severity}
            className="mt-1 h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-clinic-500 focus:outline-none focus:ring-2 focus:ring-clinic-500/20"
            onChange={(e) => updateFilter("severity", e.target.value)}
            value={filters.severity}
          >
            <option value="">{labels.filters.all}</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {safeLabelLookup(labels.severity, s, s)}
              </option>
            ))}
          </select>
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
        <p className="rounded border border-slate-200 bg-white p-6 text-center text-sm text-slate-500" role="status">
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
                  {labels.policy.tenant}
                </th>
                <th className="px-5 py-3" scope="col">
                  {labels.policy.logType}
                </th>
                <th className="px-5 py-3" scope="col">
                  {labels.policy.severity}
                </th>
                <th className="px-5 py-3" scope="col">
                  {labels.policy.retentionDays}
                </th>
                <th className="px-5 py-3" scope="col">
                  {labels.policy.archiveAfterDays}
                </th>
                <th className="px-5 py-3" scope="col">
                  {labels.policy.archiveStorage}
                </th>
                <th className="px-5 py-3" scope="col">
                  {labels.policy.createdAt}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((policy) => {
                const isGlobal = policy.tenantId === null;
                return (
                  <tr
                    className="border-t border-slate-100 transition-colors hover:bg-slate-50"
                    key={policy.id}
                  >
                    <td className="px-5 py-3">
                      <Link
                        aria-label={`${labels.common.detail}: ${policy.id}`}
                        className="text-clinic-700 hover:underline"
                        href={`/${locale}/superadmin/retention/${encodeURIComponent(policy.id)}`}
                      >
                        {isGlobal ? (
                          <Badge size="sm" tone="info">
                            {labels.policy.globalBadge}
                          </Badge>
                        ) : (
                          <span className="font-mono text-xs">
                            {policy.tenantId}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      {safeLabelLookup(
                        labels.logType,
                        policy.logType as LogType,
                        policy.logType,
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {safeLabelLookup(
                        labels.severity,
                        policy.severity as Severity,
                        policy.severity,
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {policy.retentionDays}
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {policy.archiveAfterDays}
                    </td>
                    <td className="px-5 py-3">
                      {safeLabelLookup(
                        labels.archiveStorage,
                        policy.archiveStorage,
                        policy.archiveStorage,
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(policy.createdAt).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
