/**
 * @file Superadmin hata olayları canlı liste bileşeni.
 * @module @vetniva/web/components/superadmin
 * @description Yetkili error-events endpointinden yalnız görüntüleme için
 * özet kayıtları alır. Tenant bağlamı istemciden gönderilmez; backend
 * SUPERADMIN oturumunu ve erişim sınırını uygular.
 *
 * Filtreler: status, severity, search, tenant, branch, module, errorCode,
 * release, assignedTo, from (ISO datetime), to (ISO datetime). Tüm
 * filtreler query string'e yansır; boş değerler atlanır.
 *
 * Erişilebilirlik:
 * - Her filtre `aria-label` ile
 * - Yüklenemedi durumunda kırmızı uyarı + "yeniden dene" butonu
 *   (`role="status"`).
 * @security `tenant` filtresi yalnız tenant slug/id string'idir;
 * aktör kimliği istemciden türetilmez. Tarih formatı ISO-8601
 * (URL encoded) olarak gönderilir; backend `from`/`to` aralığını
 * `firstSeenAt`/`lastSeenAt` üzerinde uygular.
 */

"use client";

import { useEffect, useMemo, useState } from "react";

import { ErrorEventDetail } from "./error-event-detail";
import { apiRequest } from "../../lib/api-client";
import { getLabels, type Locale } from "../../lib/labels";
import { safeLabelLookup } from "../../lib/safe-lookup";

type ErrorEventRow = {
  id: string;
  severity: string;
  errorCode: string;
  message: string;
  status: string;
  module: string;
  lastSeenAt: string;
  occurrenceCount: number;
};

type ErrorEventList = { items: ErrorEventRow[]; total: number };

type FilterState = {
  status: string;
  severity: string;
  search: string;
  tenant: string;
  branch: string;
  module: string;
  errorCode: string;
  release: string;
  assignedTo: string;
  from: string;
  to: string;
};

const INITIAL_FILTERS: FilterState = {
  status: "",
  severity: "",
  search: "",
  tenant: "",
  branch: "",
  module: "",
  errorCode: "",
  release: "",
  assignedTo: "",
  from: "",
  to: "",
};

const STATUS_OPTIONS = [
  "new",
  "investigating",
  "resolved",
  "reopened",
] as const;
const SEVERITY_OPTIONS = ["critical", "error", "warning", "info"] as const;

export type ErrorEventListProps = {
  locale: Locale;
};

/**
 * Bir datetime-local string değerini ISO-8601 formatına dönüştürür.
 * Geçersiz veya boş değer için `null` döner; bu sayede çağıran taraf
 * `query.set("from", iso)` çağrısını koşulsuz yapabilir ve
 * `RangeError: Invalid time value` istisnalarından kaçınılır.
 * @param value `datetime-local` input değeri (örn. `2026-08-01T00:00`).
 * @returns Geçerli ISO string veya `null`.
 */
function safeParseDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Aktif filtreleri API path'ine dönüştürür. Yalnız izinli parametreler
 * eklenir; boş string olanlar atlanır. `from`/`to` `datetime-local`
 * değerleri `safeParseDate` üzerinden ISO'ya dönüştürülür; geçersiz
 * değerler atlanır. `URLSearchParams` otomatik encoding yapar.
 * @param filters
 */
function buildPath(filters: FilterState): string {
  const query = new URLSearchParams({ limit: "50", offset: "0" });
  if (filters.status) query.set("status", filters.status);
  if (filters.severity) query.set("severity", filters.severity);
  if (filters.search.trim()) query.set("search", filters.search.trim());
  if (filters.tenant.trim()) query.set("tenantId", filters.tenant.trim());
  if (filters.branch.trim()) query.set("branchId", filters.branch.trim());
  if (filters.module.trim()) query.set("module", filters.module.trim());
  if (filters.errorCode.trim())
    query.set("errorCode", filters.errorCode.trim());
  if (filters.release.trim()) query.set("release", filters.release.trim());
  if (filters.assignedTo.trim())
    query.set("assignedToUserId", filters.assignedTo.trim());
  const fromIso = safeParseDate(filters.from);
  if (fromIso) query.set("from", fromIso);
  const toIso = safeParseDate(filters.to);
  if (toIso) query.set("to", toIso);
  return `/api/v1/superadmin/error-events?${query.toString()}`;
}

/**
 * Kalıcı hata olaylarının ilk sayfasını yükler ve güvenli durum metni gösterir.
 * @param root0
 * @param root0.locale
 */
export function ErrorEventList({ locale }: ErrorEventListProps): JSX.Element {
  const labels = getLabels(locale).errorCenter;
  const [data, setData] = useState<ErrorEventList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const path = useMemo(() => buildPath(filters), [filters]);

  useEffect(() => {
    let active = true;
    setError(null);
    void apiRequest<ErrorEventList>(path, { credentials: "include" }).then(
      (result) => {
        if (!active) return;
        if (result.ok) setData(result.data);
        else setError(labels.errorLoad);
      },
    );
    return () => {
      active = false;
    };
  }, [path, reloadKey, labels.errorLoad]);

  const updateFilter = (field: keyof FilterState, value: string): void => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  const handleRetry = (): void => {
    setReloadKey((current) => current + 1);
  };

  return (
    <section aria-label={labels.title} className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3 lg:grid-cols-4">
        <label className="text-sm text-slate-700">
          {labels.filters.status}
          <select
            aria-label={labels.filters.status}
            className="mt-1 w-full rounded border p-2"
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            <option value="">{labels.filters.all}</option>
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {safeLabelLookup(labels.statusLabels, value, value)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          {labels.filters.severity}
          <select
            aria-label={labels.filters.severity}
            className="mt-1 w-full rounded border p-2"
            value={filters.severity}
            onChange={(event) => updateFilter("severity", event.target.value)}
          >
            <option value="">{labels.filters.all}</option>
            {SEVERITY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {safeLabelLookup(labels.severityLabels, value, value)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          {labels.filters.search}
          <input
            aria-label={labels.filters.search}
            className="mt-1 w-full rounded border p-2"
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder={labels.filters.searchPlaceholder}
          />
        </label>
        <label className="text-sm text-slate-700">
          {labels.filters.tenant}
          <input
            aria-label={labels.filters.tenant}
            className="mt-1 w-full rounded border p-2"
            value={filters.tenant}
            onChange={(event) => updateFilter("tenant", event.target.value)}
            placeholder="tenant-slug veya id"
          />
        </label>
        <label className="text-sm text-slate-700">
          {labels.filters.branch}
          <input
            aria-label={labels.filters.branch}
            className="mt-1 w-full rounded border p-2"
            value={filters.branch}
            onChange={(event) => updateFilter("branch", event.target.value)}
            placeholder="branch-id"
          />
        </label>
        <label className="text-sm text-slate-700">
          {labels.filters.module}
          <input
            aria-label={labels.filters.module}
            className="mt-1 w-full rounded border p-2"
            value={filters.module}
            onChange={(event) => updateFilter("module", event.target.value)}
            placeholder="auth, clinic, lab, ..."
          />
        </label>
        <label className="text-sm text-slate-700">
          {labels.filters.errorCode}
          <input
            aria-label={labels.filters.errorCode}
            className="mt-1 w-full rounded border p-2"
            value={filters.errorCode}
            onChange={(event) => updateFilter("errorCode", event.target.value)}
            placeholder="VET-CLINIC-0001"
          />
        </label>
        <label className="text-sm text-slate-700">
          {labels.filters.release}
          <input
            aria-label={labels.filters.release}
            className="mt-1 w-full rounded border p-2"
            value={filters.release}
            onChange={(event) => updateFilter("release", event.target.value)}
            placeholder="1.0.0"
          />
        </label>
        <label className="text-sm text-slate-700">
          {labels.filters.assignedTo}
          <input
            aria-label={labels.filters.assignedTo}
            className="mt-1 w-full rounded border p-2"
            value={filters.assignedTo}
            onChange={(event) => updateFilter("assignedTo", event.target.value)}
            placeholder="usr-..."
          />
        </label>
        <label className="text-sm text-slate-700">
          {labels.filters.from}
          <input
            aria-label={labels.filters.from}
            className="mt-1 w-full rounded border p-2"
            type="datetime-local"
            value={filters.from}
            onChange={(event) => updateFilter("from", event.target.value)}
          />
        </label>
        <label className="text-sm text-slate-700">
          {labels.filters.to}
          <input
            aria-label={labels.filters.to}
            className="mt-1 w-full rounded border p-2"
            type="datetime-local"
            value={filters.to}
            onChange={(event) => updateFilter("to", event.target.value)}
          />
        </label>
      </div>
      {error ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded border border-red-200 bg-red-50 p-4 text-red-800"
          role="status"
        >
          <span>{error}</span>
          <button
            aria-label={labels.errorRetry}
            className="rounded border border-red-300 px-3 py-1 text-sm hover:bg-red-100"
            onClick={handleRetry}
            type="button"
          >
            {labels.retry}
          </button>
        </div>
      ) : null}
      {!data && !error ? (
        <p className="text-slate-500" role="status">
          {labels.detail.loading}
        </p>
      ) : null}
      {data && data.items.length === 0 ? (
        <p className="text-slate-500" role="status">
          {labels.empty.title}
        </p>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3 text-sm text-slate-600">
            {labels.totalLabel.replace("{count}", String(data.total))}
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-3">{labels.table.status}</th>
                <th className="p-3">{labels.table.severity}</th>
                <th className="p-3">{labels.table.code}</th>
                <th className="p-3">{labels.table.module}</th>
                <th className="p-3">{labels.table.occurrence}</th>
                <th className="p-3">{labels.table.lastSeen}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((event) => (
                <tr className="border-t border-slate-100" key={event.id}>
                  <td className="p-3">
                    <button
                      className="text-left underline decoration-slate-300 underline-offset-2 hover:text-blue-700"
                      onClick={() => setSelectedEventId(event.id)}
                      type="button"
                    >
                      {safeLabelLookup(
                        labels.statusLabels,
                        event.status,
                        event.status,
                      )}
                    </button>
                  </td>
                  <td className="p-3">
                    {safeLabelLookup(
                      labels.severityLabels,
                      event.severity,
                      event.severity,
                    )}
                  </td>
                  <td className="p-3 font-mono">{event.errorCode}</td>
                  <td className="p-3">{event.module}</td>
                  <td className="p-3">{event.occurrenceCount}</td>
                  <td className="p-3">
                    {new Date(event.lastSeenAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {selectedEventId ? (
        <ErrorEventDetail eventId={selectedEventId} locale={locale} />
      ) : null}
    </section>
  );
}
