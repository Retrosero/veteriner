/**
 * @file Error Center fingerprint grupları bileşeni.
 * @module @vetniva/web/components/superadmin/error-event-groups
 * @description SUPERADMIN hata merkezi için fingerprint grupları
 * görünümü. Listeleme `GET /api/v1/superadmin/error-events/groups`
 * üzerinden yapılır; satıra tıklayınca
 * `GET /api/v1/superadmin/error-events/groups/:fingerprint` ile detay
 * yüklenir ve modal içinde gösterilir.
 *
 * Filtreler (severity, module, status) liste sorgusuna dahil edilir;
 * query string yalnız izinli parametrelerden oluşur. Tenant veya
 * aktör bilgisi istemciden gönderilmez.
 *
 * Erişilebilirlik:
 * - Tablo `role="table"` + `aria-label`
 * - Modal: `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
 * - ESC tuşu modal'ı kapatır, focus ilk etkileşimli öğeye gider
 * - Boş/hata/loading durumlarında `role="status"`
 * @security Tüm API çağrıları yalnız oturum çereziyle yapılır;
 * backend `audit:log:read` permission'ı uygular. Detay yüklenirken
 * PII mask'lı gösterilir.
 */

"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { apiRequest } from "../../lib/api-client";

type ErrorSeverity = "info" | "warning" | "error" | "critical";
type ErrorStatus = "new" | "investigating" | "resolved" | "reopened";

type ErrorEventGroup = {
  fingerprint: string;
  severity: ErrorSeverity;
  module: string;
  errorCode: string;
  status: ErrorStatus;
  assignedToUserId: string | null;
  eventCount: number;
  uniqueTenants: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

type ErrorEventGroupList = {
  items: ErrorEventGroup[];
  total: number;
};

type ErrorEventGroupDetail = ErrorEventGroup & {
  recentEvents: Array<{
    id: string;
    message: string;
    tenantId: string | null;
    lastSeenAt: string;
  }>;
};

export type ErrorEventGroupLabels = {
  title: string;
  loading: string;
  empty: string;
  loadFailed: string;
  detailTitle: string;
  detailLoading: string;
  detailLoadFailed: string;
  detailClose: string;
  columns: {
    fingerprint: string;
    severity: string;
    module: string;
    errorCode: string;
    status: string;
    assigned: string;
    events: string;
    uniqueTenants: string;
    firstSeen: string;
    lastSeen: string;
  };
  filters: {
    severity: string;
    module: string;
    status: string;
    all: string;
  };
  detail: {
    events: string;
    message: string;
    tenant: string;
  };
  retry: string;
};

export type ErrorEventGroupsProps = {
  labels: ErrorEventGroupLabels;
};

const SEVERITY_OPTIONS: ReadonlyArray<ErrorSeverity> = [
  "info",
  "warning",
  "error",
  "critical",
];

const STATUS_OPTIONS: ReadonlyArray<ErrorStatus> = [
  "new",
  "investigating",
  "resolved",
  "reopened",
];

const MODULE_OPTIONS = [
  "auth",
  "clinic",
  "lab",
  "inventory",
  "payment",
  "tenant",
] as const;

const ALL = "" as const;

type GroupFilters = {
  severity: ErrorSeverity | typeof ALL;
  module: (typeof MODULE_OPTIONS)[number] | typeof ALL;
  status: ErrorStatus | typeof ALL;
};

const INITIAL_FILTERS: GroupFilters = {
  severity: ALL,
  module: ALL,
  status: ALL,
};

/**
 * Listeleme API path'ini mevcut filtrelerden üretir. Yalnız izinli
 * parametreler eklenir; boş değerler atlanır.
 * @param filters
 */
function buildListPath(filters: GroupFilters): string {
  const query = new URLSearchParams({ limit: "50", offset: "0" });
  if (filters.severity) query.set("severity", filters.severity);
  if (filters.module) query.set("module", filters.module);
  if (filters.status) query.set("status", filters.status);
  return `/api/v1/superadmin/error-events/groups?${query.toString()}`;
}

/**
 * Tek bir fingerprint için detay path'i. Değer parça yolu olarak
 * eklenir; URL encoding `encodeURIComponent` ile yapılır.
 * @param fingerprint
 */
function buildDetailPath(fingerprint: string): string {
  return `/api/v1/superadmin/error-events/groups/${encodeURIComponent(
    fingerprint,
  )}`;
}

/**
 *
 * @param root0
 * @param root0.labels
 */
export function ErrorEventGroups({
  labels,
}: ErrorEventGroupsProps): JSX.Element {
  const [filters, setFilters] = useState<GroupFilters>(INITIAL_FILTERS);
  const [data, setData] = useState<ErrorEventGroupList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFingerprint, setSelectedFingerprint] = useState<string | null>(
    null,
  );
  const [reloadKey, setReloadKey] = useState(0);
  const path = useMemo(() => buildListPath(filters), [filters]);

  useEffect(() => {
    let active = true;
    setError(null);
    void apiRequest<ErrorEventGroupList>(path, { credentials: "include" }).then(
      (result) => {
        if (!active) return;
        if (result.ok) setData(result.data);
        else setError(labels.loadFailed);
      },
    );
    return () => {
      active = false;
    };
  }, [path, reloadKey, labels.loadFailed]);

  const updateFilter = <K extends keyof GroupFilters>(
    field: K,
    value: GroupFilters[K],
  ): void => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  const handleRetry = (): void => {
    setReloadKey((current) => current + 1);
  };

  const handleSelect = (fingerprint: string): void => {
    setSelectedFingerprint(fingerprint);
  };

  return (
    <section aria-label={labels.title} className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
        <label className="text-sm text-slate-700">
          {labels.filters.severity}
          <select
            aria-label={labels.filters.severity}
            className="mt-1 w-full rounded border p-2"
            onChange={(event) =>
              updateFilter(
                "severity",
                (event.target.value as GroupFilters["severity"]) || ALL,
              )
            }
            value={filters.severity}
          >
            <option value={ALL}>{labels.filters.all}</option>
            {SEVERITY_OPTIONS.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          {labels.filters.module}
          <select
            aria-label={labels.filters.module}
            className="mt-1 w-full rounded border p-2"
            onChange={(event) =>
              updateFilter(
                "module",
                (event.target.value as GroupFilters["module"]) || ALL,
              )
            }
            value={filters.module}
          >
            <option value={ALL}>{labels.filters.all}</option>
            {MODULE_OPTIONS.map((moduleName) => (
              <option key={moduleName} value={moduleName}>
                {moduleName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          {labels.filters.status}
          <select
            aria-label={labels.filters.status}
            className="mt-1 w-full rounded border p-2"
            onChange={(event) =>
              updateFilter(
                "status",
                (event.target.value as GroupFilters["status"]) || ALL,
              )
            }
            value={filters.status}
          >
            <option value={ALL}>{labels.filters.all}</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded border border-red-200 bg-red-50 p-4 text-red-800"
          role="status"
        >
          <span>{error}</span>
          <button
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
          {labels.loading}
        </p>
      ) : null}

      {data && data.items.length === 0 ? (
        <p className="text-slate-500" role="status">
          {labels.empty}
        </p>
      ) : null}

      {data && data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3 text-sm text-slate-600">
            {data.total}
          </div>
          <table className="min-w-full text-left text-sm" role="table">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-3">{labels.columns.fingerprint}</th>
                <th className="p-3">{labels.columns.severity}</th>
                <th className="p-3">{labels.columns.module}</th>
                <th className="p-3">{labels.columns.errorCode}</th>
                <th className="p-3">{labels.columns.status}</th>
                <th className="p-3">{labels.columns.assigned}</th>
                <th className="p-3">{labels.columns.events}</th>
                <th className="p-3">{labels.columns.uniqueTenants}</th>
                <th className="p-3">{labels.columns.firstSeen}</th>
                <th className="p-3">{labels.columns.lastSeen}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((group) => (
                <tr className="border-t border-slate-100" key={group.fingerprint}>
                  <td className="p-3">
                    <button
                      className="text-left font-mono text-blue-700 underline decoration-slate-300 underline-offset-2 hover:text-blue-900"
                      onClick={() => handleSelect(group.fingerprint)}
                      type="button"
                    >
                      {group.fingerprint.slice(0, 12)}…
                    </button>
                  </td>
                  <td className="p-3">{group.severity}</td>
                  <td className="p-3">{group.module}</td>
                  <td className="p-3 font-mono">{group.errorCode}</td>
                  <td className="p-3">{group.status}</td>
                  <td className="p-3">{group.assignedToUserId ?? "—"}</td>
                  <td className="p-3">{group.eventCount}</td>
                  <td className="p-3">{group.uniqueTenants}</td>
                  <td className="p-3">
                    {new Date(group.firstSeenAt).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {new Date(group.lastSeenAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {selectedFingerprint ? (
        <GroupDetailDialog
          fingerprint={selectedFingerprint}
          labels={labels}
          onClose={() => setSelectedFingerprint(null)}
        />
      ) : null}
    </section>
  );
}

type GroupDetailDialogProps = {
  fingerprint: string;
  labels: ErrorEventGroupLabels;
  onClose: () => void;
};

/**
 * Bir fingerprint için detay dialog'u. ESC ile kapanır; ilk
 * etkileşimli öğeye (kapat butonu) focus gider.
 * @param root0
 * @param root0.fingerprint
 * @param root0.labels
 * @param root0.onClose
 */
function GroupDetailDialog({
  fingerprint,
  labels,
  onClose,
}: GroupDetailDialogProps): JSX.Element {
  const titleId = useId();
  const [detail, setDetail] = useState<ErrorEventGroupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const path = useMemo(() => buildDetailPath(fingerprint), [fingerprint]);

  const load = useCallback((): void => {
    setError(null);
    void apiRequest<ErrorEventGroupDetail>(path, { credentials: "include" }).then(
      (result) => {
        if (result.ok) setDetail(result.data);
        else setError(labels.detailLoadFailed);
      },
    );
  }, [path, labels.detailLoadFailed]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    /**
     * @param event
     */
    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
    >
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900" id={titleId}>
            {labels.detailTitle}
          </h2>
          <button
            aria-label={labels.detailClose}
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            {labels.detailClose}
          </button>
        </div>

        {error ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded border border-red-200 bg-red-50 p-3 text-red-800"
            role="status"
          >
            <span>{error}</span>
            <button
              className="rounded border border-red-300 px-3 py-1 text-sm hover:bg-red-100"
              onClick={() => setReloadKey((current) => current + 1)}
              type="button"
            >
              {labels.retry}
            </button>
          </div>
        ) : null}

        {!detail && !error ? (
          <p className="text-sm text-slate-500" role="status">
            {labels.detailLoading}
          </p>
        ) : null}

        {detail ? (
          <div className="space-y-4">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">{labels.columns.fingerprint}</dt>
                <dd className="font-mono">{detail.fingerprint}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{labels.columns.errorCode}</dt>
                <dd className="font-mono">{detail.errorCode}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{labels.columns.severity}</dt>
                <dd>{detail.severity}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{labels.columns.module}</dt>
                <dd>{detail.module}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{labels.columns.status}</dt>
                <dd>{detail.status}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{labels.columns.assigned}</dt>
                <dd>{detail.assignedToUserId ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{labels.columns.events}</dt>
                <dd>{detail.eventCount}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{labels.columns.uniqueTenants}</dt>
                <dd>{detail.uniqueTenants}</dd>
              </div>
            </dl>

            <section aria-label={labels.detail.events}>
              <h3 className="text-sm font-medium text-slate-900">
                {labels.detail.events}
              </h3>
              <ul className="mt-2 space-y-2">
                {detail.recentEvents.map((event) => (
                  <li
                    className="rounded border border-slate-200 bg-slate-50 p-3 text-sm"
                    key={event.id}
                  >
                    <p className="text-slate-800">{event.message}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {labels.detail.tenant}: {event.tenantId ?? "—"} ·{" "}
                      {new Date(event.lastSeenAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
