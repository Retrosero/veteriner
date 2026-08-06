/**
 * @file Superadmin güvenlik olayları canlı liste bileşeni.
 * @module @vetniva/web/components/superadmin/security-event-list
 * @description Yetkili SUPERADMIN `security-events` endpointinden
 * tenant-üstü görünüm için filtreli, sayfalı, salt okunur liste
 * alır. Tenant, kullanıcı veya aktör kimliği tarayıcıdan
 * türetilmez; tüm filtre değerleri yalnız izinli API sorgu
 * parametrelerine dönüştürülür ve `credentials: "include"` ile
 * oturum çerezi taşınır.
 *
 * Erişilebilirlik:
 * - Filtre alanları `aria-label` ile etiketlenir
 * - Tablo boş durumu `role="status"` ile duyurulur
 * - Detay sayfasına satır bağlantıları klavye ile erişilebilir
 *
 * @security IP adresi yalnız mask'lı (`192.168.1.***`) döner;
 * user agent yalnız kısa hash (8 hex) olarak taşınır; ham PII
 * istemciye hiçbir koşulda ulaşmaz.
 */

"use client";

import { Badge } from "@vetniva/ui";
import { cn } from "@vetniva/ui/cn";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { safeLabelLookup } from "@/lib/safe-lookup";

import {
  severityTone,
  securityEventTypeTone,
  type SecurityEventRow,
  type SecurityEventType,
  type SecuritySeverity,
  buildSecurityEventPath,
  type SecurityEventFilterState,
  safeFormatDate,
} from "./security-event-types";
import { apiRequest } from "../../lib/api-client";
import { getLabels, type Locale } from "../../lib/labels";

const INITIAL_FILTERS: SecurityEventFilterState = {
  type: "",
  severity: "",
  module: "",
  tenantId: "",
  branchId: "",
  userId: "",
  country: "",
  release: "",
  route: "",
  from: "",
  to: "",
  search: "",
};

const TYPE_OPTIONS: ReadonlyArray<SecurityEventType> = [
  "failed_login",
  "unauthorized_access_attempt",
  "suspicious_export",
  "role_change",
  "tenant_isolation_breach_attempt",
];

const SEVERITY_OPTIONS: ReadonlyArray<SecuritySeverity> = [
  "info",
  "warning",
  "error",
  "critical",
];

export type SecurityEventListProps = {
  locale: Locale;
};

export function SecurityEventList({
  locale,
}: SecurityEventListProps): JSX.Element {
  const labels = getLabels(locale);
  const sec = labels.securityEvents;
  const [data, setData] = useState<{
    items: SecurityEventRow[];
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] =
    useState<SecurityEventFilterState>(INITIAL_FILTERS);
  const path = useMemo(() => buildSecurityEventPath(filters), [filters]);

  useEffect(() => {
    let active = true;
    setError(null);
    void apiRequest<{ items: SecurityEventRow[]; total: number }>(path, {
      credentials: "include",
    }).then((result) => {
      if (!active) return;
      if (result.ok) {
        setData(result.data);
        return;
      }
      setData(null);
      setError(sec.loadErrorHint);
    });
    return () => {
      active = false;
    };
  }, [path, sec.loadErrorHint]);

  function updateFilter<K extends keyof SecurityEventFilterState>(
    field: K,
    value: SecurityEventFilterState[K],
  ): void {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters(): void {
    setFilters(INITIAL_FILTERS);
  }

  return (
    <section aria-label={sec.listHeading} className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-slate-700">
          {sec.filters.type}
          <select
            aria-label={sec.filters.type}
            className="mt-1 w-full rounded border border-slate-300 p-2"
            value={filters.type}
            onChange={(event) =>
              updateFilter("type", event.target.value as SecurityEventType | "")
            }
          >
            <option value="">—</option>
            {TYPE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {safeLabelLookup(sec.types, value, value)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          {sec.filters.severity}
          <select
            aria-label={sec.filters.severity}
            className="mt-1 w-full rounded border border-slate-300 p-2"
            value={filters.severity}
            onChange={(event) =>
              updateFilter(
                "severity",
                event.target.value as SecuritySeverity | "",
              )
            }
          >
            <option value="">—</option>
            {SEVERITY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {safeLabelLookup(sec.severities, value, value)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          {sec.filters.module}
          <input
            aria-label={sec.filters.module}
            className="mt-1 w-full rounded border border-slate-300 p-2"
            onChange={(event) => updateFilter("module", event.target.value)}
            placeholder="auth | clinic | ..."
            value={filters.module}
          />
        </label>
        <label className="text-sm text-slate-700">
          {sec.filters.tenant}
          <input
            aria-label={sec.filters.tenant}
            className="mt-1 w-full rounded border border-slate-300 p-2 font-mono"
            onChange={(event) => updateFilter("tenantId", event.target.value)}
            value={filters.tenantId}
          />
        </label>
        <label className="text-sm text-slate-700">
          {sec.filters.branch}
          <input
            aria-label={sec.filters.branch}
            className="mt-1 w-full rounded border border-slate-300 p-2 font-mono"
            onChange={(event) => updateFilter("branchId", event.target.value)}
            value={filters.branchId}
          />
        </label>
        <label className="text-sm text-slate-700">
          {sec.filters.user}
          <input
            aria-label={sec.filters.user}
            className="mt-1 w-full rounded border border-slate-300 p-2 font-mono"
            onChange={(event) => updateFilter("userId", event.target.value)}
            value={filters.userId}
          />
        </label>
        <label className="text-sm text-slate-700">
          {sec.filters.country}
          <input
            aria-label={sec.filters.country}
            className="mt-1 w-full rounded border border-slate-300 p-2"
            maxLength={2}
            onChange={(event) =>
              updateFilter("country", event.target.value.toUpperCase())
            }
            placeholder="TR"
            value={filters.country}
          />
        </label>
        <label className="text-sm text-slate-700">
          {sec.filters.release}
          <input
            aria-label={sec.filters.release}
            className="mt-1 w-full rounded border border-slate-300 p-2 font-mono"
            onChange={(event) => updateFilter("release", event.target.value)}
            value={filters.release}
          />
        </label>
        <label className="text-sm text-slate-700">
          {sec.filters.route}
          <input
            aria-label={sec.filters.route}
            className="mt-1 w-full rounded border border-slate-300 p-2 font-mono"
            onChange={(event) => updateFilter("route", event.target.value)}
            value={filters.route}
          />
        </label>
        <label className="text-sm text-slate-700">
          {sec.filters.from}
          <input
            aria-label={sec.filters.from}
            className="mt-1 w-full rounded border border-slate-300 p-2"
            onChange={(event) => updateFilter("from", event.target.value)}
            type="datetime-local"
            value={filters.from}
          />
        </label>
        <label className="text-sm text-slate-700">
          {sec.filters.to}
          <input
            aria-label={sec.filters.to}
            className="mt-1 w-full rounded border border-slate-300 p-2"
            onChange={(event) => updateFilter("to", event.target.value)}
            type="datetime-local"
            value={filters.to}
          />
        </label>
        <label className="text-sm text-slate-700 sm:col-span-2">
          {sec.filters.search}
          <input
            aria-label={sec.filters.search}
            className="mt-1 w-full rounded border border-slate-300 p-2"
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="message, code, fingerprint"
            value={filters.search}
          />
        </label>
        <div className="flex items-end sm:col-span-2">
          <button
            aria-label={sec.filters.reset}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            onClick={resetFilters}
            type="button"
          >
            {sec.filters.reset}
          </button>
        </div>
      </div>

      {error ? (
        <p
          className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="status"
        >
          {error}
        </p>
      ) : null}
      {!data && !error ? (
        <p className="text-sm text-slate-500" role="status">
          {labels.superadmin.status.loading}
        </p>
      ) : null}
      {data ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3 text-sm text-slate-600">
            <span>{sec.totalLabel.replace("{count}", String(data.total))}</span>
            <span className="text-xs text-slate-400">limit=50 · offset=0</span>
          </div>
          {data.items.length === 0 ? (
            <p
              className="px-5 py-10 text-center text-sm text-slate-500"
              role="status"
            >
              {sec.empty}
            </p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-3" scope="col">
                    {sec.table.type}
                  </th>
                  <th className="p-3" scope="col">
                    {sec.table.severity}
                  </th>
                  <th className="p-3" scope="col">
                    {sec.table.module}
                  </th>
                  <th className="p-3" scope="col">
                    {sec.table.code}
                  </th>
                  <th className="p-3" scope="col">
                    {sec.table.message}
                  </th>
                  <th className="p-3" scope="col">
                    {sec.table.route}
                  </th>
                  <th className="p-3" scope="col">
                    {sec.table.country}
                  </th>
                  <th className="p-3" scope="col">
                    {sec.table.occurrence}
                  </th>
                  <th className="p-3" scope="col">
                    {sec.table.lastSeen}
                  </th>
                  <th className="p-3" scope="col">
                    {sec.table.alertSent}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((event) => (
                  <tr className="border-t border-slate-100" key={event.id}>
                    <td className="p-3">
                      <Link
                        aria-label={`${safeLabelLookup(sec.types, event.type, event.type)} — ${sec.detail.heading}`}
                        className="inline-flex items-center gap-2 text-blue-700 underline decoration-blue-200 underline-offset-2 hover:text-blue-900"
                        href={`/${locale}/superadmin/security-events/${event.id}`}
                      >
                        <Badge
                          size="sm"
                          tone={securityEventTypeTone(event.type)}
                        >
                          {safeLabelLookup(sec.types, event.type, event.type)}
                        </Badge>
                      </Link>
                    </td>
                    <td className="p-3">
                      <Badge size="sm" tone={severityTone(event.severity)}>
                        {safeLabelLookup(
                          sec.severities,
                          event.severity,
                          event.severity,
                        )}
                      </Badge>
                    </td>
                    <td className="p-3">{event.module}</td>
                    <td className="p-3 font-mono text-xs">{event.errorCode}</td>
                    <td
                      aria-label={event.message}
                      className="max-w-[260px] truncate p-3"
                    >
                      {event.message}
                    </td>
                    <td
                      aria-label={event.route}
                      className="max-w-[180px] truncate p-3 font-mono text-xs"
                    >
                      {event.route}
                    </td>
                    <td className="p-3 font-mono text-xs">{event.country}</td>
                    <td className="p-3">{event.occurrenceCount}</td>
                    <td className="p-3 text-xs text-slate-600">
                      {safeFormatDate(event.lastSeenAt, locale)}
                    </td>
                    <td className="p-3">
                      {event.alertSent ? (
                        <span
                          aria-label={sec.detail.alertSentYes}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800",
                          )}
                        >
                          {sec.detail.alertSentYes}
                        </span>
                      ) : (
                        <span
                          aria-label={sec.detail.alertSentNo}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                        >
                          {sec.detail.alertSentNo}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </section>
  );
}
