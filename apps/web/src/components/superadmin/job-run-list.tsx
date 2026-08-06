/**
 * @file Superadmin job runs canlı liste bileşeni.
 * @module @vetniva/web/components/superadmin/job-run-list
 * @description Yetkili SUPERADMIN `job-runs` endpointinden tenant-üstü
 * görünüm için filtreli, sayfalı, salt okunur liste alır. Dead-letter
 * view'a sekme ile geçilebilir. Tenant, kullanıcı veya aktör kimliği
 * tarayıcıdan türetilmez; tüm filtre değerleri yalnız izinli API
 * sorgu parametrelerine dönüştürülür ve `credentials: "include"` ile
 * oturum çerezi taşınır.
 *
 * Erişilebilirlik:
 * - Filtre alanları `aria-label` ile etiketlenir
 * - Tablo boş durumu `role="status"` ile duyurulur
 * - Detay sayfasına satır bağlantıları klavye ile erişilebilir
 * - Dead-letter view toggle için `role="tablist"` + `role="tab"`
 *
 * @security Input/output PII mask'lıdır; errorStack yalnızca
 * failed/dead_letter için dolu. Detail component'i bu kontratı
 * backend'den gelen veriye güvenerek render eder; ek maskeleme
 * bu katmanda yapılmaz (tek doğruluk kaynağı backend).
 */

"use client";

import { Badge } from "@vetniva/ui";
import { cn } from "@vetniva/ui/cn";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "@/lib/api-client";
import { getLabels, type Locale } from "@/lib/labels";
import { safeLabelLookup } from "@/lib/safe-lookup";

import {
  JOB_RUN_SOURCES,
  JOB_RUN_STATUSES,
  JOB_RUN_TRIGGERED_BY,
  buildJobRunPath,
  formatDurationMs,
  jobRunSourceTone,
  jobRunStatusCriticalClass,
  jobRunStatusTone,
  jobRunTriggeredByTone,
  type JobRunFilterState,
  type JobRunListResponse,
  type JobRunSource,
  type JobRunStatus,
  type JobRunTriggeredBy,
} from "./job-run-types";

const INITIAL_FILTERS: JobRunFilterState = {
  queueName: "",
  jobName: "",
  jobKey: "",
  status: "",
  source: "",
  triggeredBy: "",
  tenantId: "",
  branchId: "",
  country: "",
  from: "",
  to: "",
  search: "",
};

const STATUS_OPTIONS: ReadonlyArray<JobRunStatus> = JOB_RUN_STATUSES;
const SOURCE_OPTIONS: ReadonlyArray<JobRunSource> = JOB_RUN_SOURCES;
const TRIGGERED_BY_OPTIONS: ReadonlyArray<JobRunTriggeredBy> =
  JOB_RUN_TRIGGERED_BY;

export type JobRunListProps = {
  locale: Locale;
};

/**
 * Job Runs listesi; sayfa başında filtre + KPI bloğu, altında tablo.
 * Dead-letter view'a sekme ile geçilebilir.
 * @param root0
 * @param root0.locale
 */
export function JobRunList({ locale }: JobRunListProps): JSX.Element {
  const labels = getLabels(locale);
  const jobRuns = labels.jobRuns;
  const [data, setData] = useState<JobRunListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "dead-letter">("list");
  const [filters, setFilters] = useState<JobRunFilterState>(INITIAL_FILTERS);
  const path = useMemo(() => buildJobRunPath(filters, view), [filters, view]);

  useEffect(() => {
    let active = true;
    setError(null);
    void apiRequest<JobRunListResponse>(path, {
      credentials: "include",
    }).then((result) => {
      if (!active) return;
      if (result.ok) {
        setData(result.data);
        return;
      }
      setData(null);
      setError(jobRuns.loadErrorHint);
    });
    return () => {
      active = false;
    };
  }, [path, jobRuns.loadErrorHint]);

  function updateFilter<K extends keyof JobRunFilterState>(
    field: K,
    value: JobRunFilterState[K],
  ): void {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters(): void {
    setFilters(INITIAL_FILTERS);
  }

  return (
    <section aria-label={jobRuns.listHeading} className="space-y-4">
      {/* Dead-letter view toggle */}
      <div
        aria-label={jobRuns.filters.title}
        className="flex flex-wrap items-center gap-2"
        role="tablist"
      >
        <button
          aria-controls="job-run-list-panel"
          aria-selected={view === "list"}
          className={cn(
            "rounded-[10px] border px-3 py-1.5 text-sm font-medium transition-colors",
            view === "list"
              ? "border-[#0D4D2E] bg-[#E6F4EC] text-[#0D4D2E]"
              : "border-[#E1E5E2] bg-white text-[#5F6368] hover:bg-[#F1F5F1]",
          )}
          onClick={() => setView("list")}
          role="tab"
          type="button"
        >
          {jobRuns.listHeading}
        </button>
        <button
          aria-controls="job-run-list-panel"
          aria-selected={view === "dead-letter"}
          className={cn(
            "rounded-[10px] border px-3 py-1.5 text-sm font-medium transition-colors",
            view === "dead-letter"
              ? "border-red-700 bg-red-100 text-red-900"
              : "border-[#E1E5E2] bg-white text-[#5F6368] hover:bg-[#F1F5F1]",
          )}
          onClick={() => setView("dead-letter")}
          role="tab"
          type="button"
        >
          {jobRuns.deadLetterHeading}
        </button>
      </div>

      <div className="grid gap-3 rounded-[14px] border border-[#E1E5E2] bg-[#F7F8F7] p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm text-[#1D1D1F]">
          {jobRuns.filters.queueName}
          <input
            aria-label={jobRuns.filters.queueName}
            className="mt-1 w-full rounded border border-[#D5DBD7] bg-white p-2 font-mono text-sm"
            onChange={(event) => updateFilter("queueName", event.target.value)}
            placeholder="billing.invoice"
            value={filters.queueName}
          />
        </label>
        <label className="text-sm text-[#1D1D1F]">
          {jobRuns.filters.jobName}
          <input
            aria-label={jobRuns.filters.jobName}
            className="mt-1 w-full rounded border border-[#D5DBD7] bg-white p-2 font-mono text-sm"
            onChange={(event) => updateFilter("jobName", event.target.value)}
            placeholder="SendInvoice"
            value={filters.jobName}
          />
        </label>
        <label className="text-sm text-[#1D1D1F]">
          {jobRuns.filters.jobKey}
          <input
            aria-label={jobRuns.filters.jobKey}
            className="mt-1 w-full rounded border border-[#D5DBD7] bg-white p-2 font-mono text-sm"
            onChange={(event) => updateFilter("jobKey", event.target.value)}
            placeholder="invoice-123"
            value={filters.jobKey}
          />
        </label>
        <label className="text-sm text-[#1D1D1F]">
          {jobRuns.filters.status}
          <select
            aria-label={jobRuns.filters.status}
            className="mt-1 w-full rounded border border-[#D5DBD7] bg-white p-2"
            onChange={(event) =>
              updateFilter("status", event.target.value as JobRunStatus | "")
            }
            value={filters.status}
          >
            <option value="">{jobRuns.filters.all}</option>
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {safeLabelLookup(jobRuns.statuses, value, value)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[#1D1D1F]">
          {jobRuns.filters.source}
          <select
            aria-label={jobRuns.filters.source}
            className="mt-1 w-full rounded border border-[#D5DBD7] bg-white p-2"
            onChange={(event) =>
              updateFilter("source", event.target.value as JobRunSource | "")
            }
            value={filters.source}
          >
            <option value="">{jobRuns.filters.all}</option>
            {SOURCE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {safeLabelLookup(jobRuns.sources, value, value)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[#1D1D1F]">
          {jobRuns.filters.triggeredBy}
          <select
            aria-label={jobRuns.filters.triggeredBy}
            className="mt-1 w-full rounded border border-[#D5DBD7] bg-white p-2"
            onChange={(event) =>
              updateFilter(
                "triggeredBy",
                event.target.value as JobRunTriggeredBy | "",
              )
            }
            value={filters.triggeredBy}
          >
            <option value="">{jobRuns.filters.all}</option>
            {TRIGGERED_BY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {safeLabelLookup(jobRuns.triggeredBy, value, value)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[#1D1D1F]">
          {jobRuns.filters.tenant}
          <input
            aria-label={jobRuns.filters.tenant}
            className="mt-1 w-full rounded border border-[#D5DBD7] bg-white p-2 font-mono text-sm"
            onChange={(event) => updateFilter("tenantId", event.target.value)}
            value={filters.tenantId}
          />
        </label>
        <label className="text-sm text-[#1D1D1F]">
          {jobRuns.filters.branch}
          <input
            aria-label={jobRuns.filters.branch}
            className="mt-1 w-full rounded border border-[#D5DBD7] bg-white p-2 font-mono text-sm"
            onChange={(event) => updateFilter("branchId", event.target.value)}
            value={filters.branchId}
          />
        </label>
        <label className="text-sm text-[#1D1D1F]">
          {jobRuns.filters.country}
          <input
            aria-label={jobRuns.filters.country}
            className="mt-1 w-full rounded border border-[#D5DBD7] bg-white p-2 font-mono text-sm"
            maxLength={2}
            onChange={(event) =>
              updateFilter("country", event.target.value.toUpperCase())
            }
            placeholder="TR"
            value={filters.country}
          />
        </label>
        <label className="text-sm text-[#1D1D1F]">
          {jobRuns.filters.from}
          <input
            aria-label={jobRuns.filters.from}
            className="mt-1 w-full rounded border border-[#D5DBD7] bg-white p-2"
            onChange={(event) => updateFilter("from", event.target.value)}
            type="datetime-local"
            value={filters.from}
          />
        </label>
        <label className="text-sm text-[#1D1D1F]">
          {jobRuns.filters.to}
          <input
            aria-label={jobRuns.filters.to}
            className="mt-1 w-full rounded border border-[#D5DBD7] bg-white p-2"
            onChange={(event) => updateFilter("to", event.target.value)}
            type="datetime-local"
            value={filters.to}
          />
        </label>
        <label className="text-sm text-[#1D1D1F] sm:col-span-2">
          {jobRuns.filters.search}
          <input
            aria-label={jobRuns.filters.search}
            className="mt-1 w-full rounded border border-[#D5DBD7] bg-white p-2"
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder={jobRuns.filters.searchPlaceholder}
            value={filters.search}
          />
        </label>
        <div className="flex items-end sm:col-span-2">
          <button
            aria-label={jobRuns.filters.reset}
            className="rounded border border-[#D5DBD7] bg-white px-3 py-2 text-sm text-[#5F6368] hover:bg-[#F1F5F1]"
            onClick={resetFilters}
            type="button"
          >
            {jobRuns.filters.reset}
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
        <p className="text-sm text-[#5F6368]" role="status">
          {labels.superadmin.status.loading}
        </p>
      ) : null}
      {data ? (
        <div
          aria-live="polite"
          className="overflow-x-auto rounded-[14px] border border-[#E1E5E2] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          id="job-run-list-panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ECEFED] px-5 py-3 text-sm text-[#5F6368]">
            <span>
              {jobRuns.totalLabel.replace("{count}", String(data.total))}
            </span>
            <span className="text-xs text-[#86868B]">
              {jobRuns.paginationLabel}
            </span>
          </div>
          {data.items.length === 0 ? (
            <p
              className="px-5 py-10 text-center text-sm text-[#5F6368]"
              role="status"
            >
              {jobRuns.empty}
            </p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#F6F8F6] text-[#5F6368]">
                <tr>
                  <th className="p-3" scope="col">
                    {jobRuns.columns.status}
                  </th>
                  <th className="p-3" scope="col">
                    {jobRuns.columns.queueName}
                  </th>
                  <th className="p-3" scope="col">
                    {jobRuns.columns.jobName}
                  </th>
                  <th className="p-3" scope="col">
                    {jobRuns.columns.attempt}
                  </th>
                  <th className="p-3" scope="col">
                    {jobRuns.columns.source}
                  </th>
                  <th className="p-3" scope="col">
                    {jobRuns.columns.triggeredBy}
                  </th>
                  <th className="p-3" scope="col">
                    {jobRuns.columns.tenant}
                  </th>
                  <th className="p-3" scope="col">
                    {jobRuns.columns.country}
                  </th>
                  <th className="p-3" scope="col">
                    {jobRuns.columns.durationMs}
                  </th>
                  <th className="p-3" scope="col">
                    {jobRuns.columns.startedAt}
                  </th>
                  <th className="p-3" scope="col">
                    {jobRuns.columns.errorCode}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr
                    className="border-t border-[#ECEFED] transition-colors hover:bg-[#F7FBF8]"
                    key={row.id}
                  >
                    <td className="p-3">
                      <Link
                        aria-label={`${safeLabelLookup(jobRuns.statuses, row.status, row.status)} — ${jobRuns.detailHeading}`}
                        className="inline-flex items-center"
                        href={`/${locale}/superadmin/job-runs/${row.id}`}
                      >
                        <Badge
                          className={jobRunStatusCriticalClass(row.status)}
                          size="sm"
                          tone={jobRunStatusTone(row.status)}
                        >
                          {safeLabelLookup(
                            jobRuns.statuses,
                            row.status,
                            row.status,
                          )}
                        </Badge>
                      </Link>
                    </td>
                    <td className="p-3 font-mono text-xs">{row.queueName}</td>
                    <td className="p-3 font-mono text-xs">{row.jobName}</td>
                    <td className="p-3 text-center">{row.attempt}</td>
                    <td className="p-3">
                      <Badge size="sm" tone={jobRunSourceTone(row.source)}>
                        {safeLabelLookup(
                          jobRuns.sources,
                          row.source,
                          row.source,
                        )}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        size="sm"
                        tone={jobRunTriggeredByTone(row.triggeredBy)}
                      >
                        {safeLabelLookup(
                          jobRuns.triggeredBy,
                          row.triggeredBy,
                          row.triggeredBy,
                        )}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {row.tenantId ?? "—"}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {row.country ?? "—"}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {formatDurationMs(row.durationMs)}
                    </td>
                    <td className="p-3 text-xs text-[#5F6368]">
                      {new Date(row.startedAt).toLocaleString()}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {row.errorCode ?? "—"}
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
