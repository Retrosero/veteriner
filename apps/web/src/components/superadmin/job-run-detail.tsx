/**
 * @file Superadmin job run detay ve aksiyon bileşeni.
 * @module @vetniva/web/components/superadmin/job-run-detail
 * @description Seçilen job run'ın detayını (input, output, errorStack,
 * meta veri), retry/finish aksiyonlarını ve aynı jobKey için tüm
 * denemelerin özetini SUPERADMIN yetkili API üzerinden yönetir.
 *
 * Erişilebilirlik:
 * - Detay paneli `<aside>` semantiği
 * - Yükleme/hata durumları `role="status"`
 * - Aksiyon butonları klavye ile erişilebilir; pending sırasında
 *   `disabled` + `aria-busy`
 * - JSON görünümü `<pre>` + `aria-label`
 *
 * @security Tenant, kullanıcı veya aktör bilgisi tarayıcıdan
 * türetilmez. Tüm çağrılar yalnız oturum çereziyle yapılır; backend
 * `audit:log:read` kontrolünü uygular ve input/output PII açısından
 * maskeler. errorStack yalnızca failed/dead_letter run'lar için
 * dolu gelir.
 */

"use client";

import { Badge } from "@vetniva/ui";
import { cn } from "@vetniva/ui/cn";
import { useCallback, useEffect, useState } from "react";

import {
  formatDurationMs,
  jobRunSourceTone,
  jobRunStatusCriticalClass,
  jobRunStatusTone,
  jobRunTriggeredByTone,
  type JobRunAttempt,
  type JobRunAttemptsResponse,
  type JobRunDetailRecord,
  type JobRunStatus,
} from "./job-run-types";
import { apiRequest } from "../../lib/api-client";
import { getLabels, type Locale } from "../../lib/labels";
import { safeLabelLookup } from "../../lib/safe-lookup";

const RETRYABLE_STATUSES: ReadonlyArray<JobRunStatus> = [
  "failed",
  "dead_letter",
];
const FINISHABLE_STATUSES: ReadonlyArray<JobRunStatus> = ["running"];

export type JobRunDetailProps = {
  locale: Locale;
  runId: string;
};

/**
 * Tek bir job run'ın detay görünümü. Retry / finish aksiyonlarını
 * ve attempts özetini içerir. Sayfa (server component) tarafından
 * id ile çağrılır.
 * @param root0
 * @param root0.locale
 * @param root0.runId
 */
export function JobRunDetail({
  locale,
  runId,
}: JobRunDetailProps): JSX.Element {
  const labels = getLabels(locale);
  const jobRuns = labels.jobRuns;
  const [detail, setDetail] = useState<JobRunDetailRecord | null>(null);
  const [attempts, setAttempts] = useState<JobRunAttempt[]>([]);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState<"retry" | "finish" | null>(null);

  const load = useCallback((): void => {
    setDetailError(null);
    setAttemptsError(null);
    void Promise.all([
      apiRequest<JobRunDetailRecord>(`/api/v1/superadmin/job-runs/${runId}`, {
        credentials: "include",
      }),
    ]).then(([detailResult]) => {
      if (!detailResult.ok) {
        setDetailError(jobRuns.detailLoadErrorHint);
        return;
      }
      const run = detailResult.data;
      setDetail(run);
      // Aynı jobKey için attempts'i yalnızca jobKey varsa yükle.
      if (run.jobKey) {
        void apiRequest<JobRunAttemptsResponse>(
          `/api/v1/superadmin/job-runs/attempts/${encodeURIComponent(run.jobKey)}`,
          { credentials: "include" },
        ).then((attemptsResult) => {
          if (!attemptsResult.ok) {
            setAttemptsError(jobRuns.attempts.loadErrorHint);
            return;
          }
          setAttempts(attemptsResult.data.items);
        });
      }
    });
  }, [runId, jobRuns.detailLoadErrorHint, jobRuns.attempts.loadErrorHint]);

  useEffect(() => {
    load();
  }, [load]);

  const retry = useCallback(async (): Promise<void> => {
    if (!detail) return;
    setPending("retry");
    setFeedback(null);
    const result = await apiRequest<unknown>(
      `/api/v1/superadmin/job-runs/${detail.id}/retry`,
      {
        method: "POST",
        credentials: "include",
        body: {},
      },
    );
    setPending(null);
    if (!result.ok) {
      setFeedback(jobRuns.actions.retryError);
      return;
    }
    setFeedback(jobRuns.actions.retrySuccess);
    load();
  }, [detail, jobRuns.actions.retryError, jobRuns.actions.retrySuccess, load]);

  const finish = useCallback(async (): Promise<void> => {
    if (!detail) return;
    setPending("finish");
    setFeedback(null);
    const result = await apiRequest<unknown>(
      `/api/v1/superadmin/job-runs/${detail.id}/finish`,
      {
        method: "POST",
        credentials: "include",
        body: {},
      },
    );
    setPending(null);
    if (!result.ok) {
      setFeedback(jobRuns.actions.finishError);
      return;
    }
    setFeedback(jobRuns.actions.finishSuccess);
    load();
  }, [
    detail,
    jobRuns.actions.finishError,
    jobRuns.actions.finishSuccess,
    load,
  ]);

  if (detailError) {
    return (
      <aside
        aria-label={jobRuns.detailHeading}
        className="rounded-[14px] border border-red-200 bg-red-50 p-5"
      >
        <p className="text-sm text-red-800" role="status">
          {detailError}
        </p>
      </aside>
    );
  }

  if (!detail) {
    return (
      <aside
        aria-label={jobRuns.detailHeading}
        className="rounded-[14px] border border-[#E1E5E2] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <p className="text-sm text-[#5F6368]" role="status">
          {labels.superadmin.status.loading}
        </p>
      </aside>
    );
  }

  const canRetry = RETRYABLE_STATUSES.includes(detail.status);
  const canFinish = FINISHABLE_STATUSES.includes(detail.status);
  const showErrorStack =
    detail.status === "failed" || detail.status === "dead_letter";

  return (
    <aside
      aria-label={jobRuns.detailHeading}
      className="space-y-4 rounded-[14px] border border-[#E1E5E2] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      {/* Üst başlık: status + jobKey + duration */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge
              className={jobRunStatusCriticalClass(detail.status)}
              size="md"
              tone={jobRunStatusTone(detail.status)}
            >
              {safeLabelLookup(jobRuns.statuses, detail.status, detail.status)}
            </Badge>
            <span className="font-mono text-xs text-[#5F6368]">
              {detail.id}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-[#1D1D1F]">
            <span className="font-mono">{detail.queueName}</span>
            <span className="mx-2 text-[#86868B]">/</span>
            <span className="font-mono">{detail.jobName}</span>
          </h3>
        </div>
        <div className="text-right text-xs text-[#5F6368]">
          <div>{jobRuns.detail.durationMs}</div>
          <div className="font-mono text-sm text-[#1D1D1F]">
            {formatDurationMs(detail.durationMs)}
          </div>
        </div>
      </header>

      {feedback ? (
        <p
          className={cn(
            "rounded border p-3 text-sm",
            feedback === jobRuns.actions.retrySuccess ||
              feedback === jobRuns.actions.finishSuccess
              ? "border-[#A5D6A7] bg-[#EAF6EC] text-[#0D4D2E]"
              : "border-red-200 bg-red-50 text-red-800",
          )}
          role="status"
        >
          {feedback}
        </p>
      ) : null}

      {/* Meta grid */}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[#86868B]">{jobRuns.detail.jobKey}</dt>
          <dd className="font-mono text-[#1D1D1F]">{detail.jobKey}</dd>
        </div>
        <div>
          <dt className="text-[#86868B]">{jobRuns.detail.attempt}</dt>
          <dd className="text-[#1D1D1F]">
            {detail.attempt}
            {detail.maxAttempts !== null ? ` / ${detail.maxAttempts}` : null}
          </dd>
        </div>
        <div>
          <dt className="text-[#86868B]">{jobRuns.detail.source}</dt>
          <dd>
            <Badge size="sm" tone={jobRunSourceTone(detail.source)}>
              {safeLabelLookup(jobRuns.sources, detail.source, detail.source)}
            </Badge>
          </dd>
        </div>
        <div>
          <dt className="text-[#86868B]">{jobRuns.detail.triggeredBy}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <Badge size="sm" tone={jobRunTriggeredByTone(detail.triggeredBy)}>
              {safeLabelLookup(
                jobRuns.triggeredBy,
                detail.triggeredBy,
                detail.triggeredBy,
              )}
            </Badge>
            <span className="text-xs text-[#5F6368]">
              {detail.triggeredByUserId ?? jobRuns.detail.noUser}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-[#86868B]">{jobRuns.detail.tenant}</dt>
          <dd className="font-mono text-xs">{detail.tenantId ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[#86868B]">{jobRuns.detail.branch}</dt>
          <dd className="font-mono text-xs">{detail.branchId ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[#86868B]">{jobRuns.detail.country}</dt>
          <dd className="font-mono text-xs">{detail.country ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[#86868B]">{jobRuns.detail.correlationId}</dt>
          <dd className="font-mono text-xs">{detail.correlationId ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[#86868B]">{jobRuns.detail.startedAt}</dt>
          <dd className="text-xs text-[#1D1D1F]">
            {new Date(detail.startedAt).toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-[#86868B]">{jobRuns.detail.finishedAt}</dt>
          <dd className="text-xs text-[#1D1D1F]">
            {detail.finishedAt
              ? new Date(detail.finishedAt).toLocaleString()
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[#86868B]">{jobRuns.detail.errorCode}</dt>
          <dd className="font-mono text-xs">{detail.errorCode ?? "—"}</dd>
        </div>
      </dl>

      {/* Input / Output / Error stack */}
      <section className="space-y-3 border-t border-[#ECEFED] pt-4">
        <h4 className="text-sm font-semibold text-[#1D1D1F]">
          {jobRuns.detail.input}
        </h4>
        <JsonBlock
          ariaLabel={jobRuns.detail.input}
          emptyHint={jobRuns.detail.noInput}
          value={detail.input}
        />

        <h4 className="text-sm font-semibold text-[#1D1D1F]">
          {jobRuns.detail.output}
        </h4>
        <JsonBlock
          ariaLabel={jobRuns.detail.output}
          emptyHint={jobRuns.detail.noOutput}
          value={detail.output}
        />

        {showErrorStack ? (
          <>
            <h4 className="text-sm font-semibold text-[#1D1D1F]">
              {jobRuns.detail.errorStack}
            </h4>
            <pre
              aria-label={jobRuns.detail.errorStack}
              className="max-h-64 overflow-auto rounded border border-red-200 bg-red-50 p-3 text-xs text-red-900"
            >
              {detail.errorStack ?? jobRuns.detail.noErrorStack}
            </pre>
          </>
        ) : null}
      </section>

      {/* Aksiyonlar */}
      <section
        aria-label={jobRuns.detail.actionsHeading}
        className="flex flex-wrap items-center gap-2 border-t border-[#ECEFED] pt-4"
      >
        <button
          aria-busy={pending === "retry"}
          className="rounded border border-[#D5DBD7] bg-white px-3 py-2 text-sm font-medium text-[#1D1D1F] hover:bg-[#F1F5F1] disabled:opacity-50"
          disabled={!canRetry || pending !== null}
          onClick={() => void retry()}
          type="button"
        >
          {jobRuns.actions.retry}
        </button>
        <button
          aria-busy={pending === "finish"}
          className="rounded border border-[#D5DBD7] bg-white px-3 py-2 text-sm font-medium text-[#1D1D1F] hover:bg-[#F1F5F1] disabled:opacity-50"
          disabled={!canFinish || pending !== null}
          onClick={() => void finish()}
          type="button"
        >
          {jobRuns.actions.finish}
        </button>
      </section>

      {/* Attempts */}
      <section
        aria-label={jobRuns.attemptsHeading}
        className="space-y-2 border-t border-[#ECEFED] pt-4"
      >
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-[#1D1D1F]">
            {jobRuns.attempts.listHeading}
          </h4>
          <span className="text-xs text-[#86868B]">
            {jobRuns.attempts.totalLabel.replace(
              "{count}",
              String(attempts.length),
            )}
          </span>
        </div>
        {attemptsError ? (
          <p
            className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="status"
          >
            {attemptsError}
          </p>
        ) : null}
        {attempts.length === 0 && !attemptsError ? (
          <p
            className="rounded border border-dashed border-[#E1E5E2] p-3 text-center text-sm text-[#5F6368]"
            role="status"
          >
            {jobRuns.attempts.empty}
          </p>
        ) : null}
        {attempts.length > 0 ? (
          <ol className="space-y-2 text-sm">
            {attempts.map((attempt) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#ECEFED] bg-[#F7F8F7] p-3"
                key={attempt.id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={jobRunStatusCriticalClass(attempt.status)}
                    size="sm"
                    tone={jobRunStatusTone(attempt.status)}
                  >
                    {safeLabelLookup(
                      jobRuns.statuses,
                      attempt.status,
                      attempt.status,
                    )}
                  </Badge>
                  <span className="font-mono text-xs text-[#5F6368]">
                    attempt #{attempt.attempt}
                  </span>
                  <span className="text-xs text-[#5F6368]">
                    {new Date(attempt.startedAt).toLocaleString()}
                  </span>
                  <span className="font-mono text-xs text-[#1D1D1F]">
                    {formatDurationMs(attempt.durationMs)}
                  </span>
                  {attempt.errorCode ? (
                    <span className="font-mono text-xs text-red-800">
                      {attempt.errorCode}
                    </span>
                  ) : null}
                </div>
                <span className="font-mono text-[10px] text-[#86868B]">
                  {attempt.id}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </aside>
  );
}

/**
 * Bir JSON object'i okunabilir `<pre>` bloğu olarak render eder.
 * null ise `emptyHint` gösterilir.
 * @param root0
 * @param root0.value
 * @param root0.ariaLabel
 * @param root0.emptyHint
 */
function JsonBlock({
  value,
  ariaLabel,
  emptyHint,
}: {
  value: Record<string, unknown> | null;
  ariaLabel: string;
  emptyHint: string;
}): JSX.Element {
  if (value === null) {
    return (
      <p
        aria-label={ariaLabel}
        className="rounded border border-dashed border-[#E1E5E2] bg-[#F7F8F7] p-3 text-center text-xs text-[#86868B]"
        role="status"
      >
        {emptyHint}
      </p>
    );
  }
  return (
    <pre
      aria-label={ariaLabel}
      className="max-h-64 overflow-auto rounded border border-[#ECEFED] bg-[#F7F8F7] p-3 text-xs text-[#1D1D1F]"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
