/**
 * @file Retention sweep detay bileşeni.
 * @module @vetniva/web/components/superadmin/retention-sweep-detail
 * @description SUPERADMIN Log Retention — Sweep detay sayfasının
 * istemci bileşeni. Tek bir sweep kaydının meta verisini ve
 * `tenant × logType × severity` bucket'ları için expired / archived /
 * deleted sayılarını tablo halinde gösterir. `dryRun` rozeti ile
 * kuru çalışma olduğu belirtilir.
 *
 * Erişilebilirlik:
 * - Yükleme/hata durumları `role="status"` / `role="alert"`
 * - Tablo `scope="col"` semantiği ile başlıklar
 * - Sayılar `aria-label` ile duyurulur
 * @security Backend sweep kaydını içeriden çözer; UI yalnız ID
 * gönderir, `audit:log:read` yetkisi zorunludur.
 */

"use client";

import { Badge, Button } from "@vetniva/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";



import { apiRequest } from "@/lib/api-client";
import { getLabels, type Locale } from "@/lib/labels";

// `_LOG_TYPES` ve `_SEVERITIES` array'leri bilinçli olarak salt tip
// türetimi için tutulur; bucket verilerinin tipleri backend'in
// response şemasından gelir ve UI tarafında logType/severity
// literal'leri olarak render edilir (label sözlüğü ile).
const _LOG_TYPES = [
  "audit_log",
  "error_event",
  "security_event",
  "job_run",
  "notification",
  "request_log",
] as const;

const _SEVERITIES = ["info", "warning", "error", "critical"] as const;

type LogType = (typeof _LOG_TYPES)[number];
type Severity = (typeof _SEVERITIES)[number];

type SweepBucket = {
  tenantId: string | null;
  logType: string;
  severity: string;
  cutoff: string;
  expired: number;
  archived: number;
  deleted: number;
};

type SweepDetail = {
  id: string;
  triggeredBy: string;
  triggeredByType: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  dryRun: boolean;
  buckets: SweepBucket[];
  totals: { expired: number; archived: number; deleted: number };
};

export type RetentionSweepDetailProps = {
  locale: Locale;
  sweepId: string;
};

/**
 * Sweep detay sayfası. Tek `GET /sweeps/{id}` çağrısı ile meta
 * veriler ve bucket listesi alınır. dryRun rozeti ile birlikte
 * expired/archived/deleted sayıları tablo formatında gösterilir.
 * @param root0
 * @param root0.locale
 * @param root0.sweepId
 */
export function RetentionSweepDetail({
  locale,
  sweepId,
}: RetentionSweepDetailProps): JSX.Element {
  const labels = getLabels(locale).retention;
  const router = useRouter();
  const [sweep, setSweep] = useState<SweepDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await apiRequest<SweepDetail>(
      `/api/v1/superadmin/log-retention/sweeps/${encodeURIComponent(sweepId)}`,
      { credentials: "include" },
    );
    if (!result.ok) {
      setError(labels.common.error);
      setLoading(false);
      return;
    }
    setSweep(result.data);
    setLoading(false);
  }, [sweepId, labels.common.error]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <p className="text-slate-500" role="status">
        {labels.common.loading}
      </p>
    );
  }
  if (error || !sweep) {
    return (
      <p
        className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        role="alert"
      >
        {error ?? labels.common.empty}
      </p>
    );
  }

  return (
    <article
      aria-label={labels.sweep.id}
      className="space-y-5 rounded-[14px] border border-slate-200 bg-white p-6 shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            <span className="font-mono text-base">{sweep.id}</span>
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {new Date(sweep.startedAt).toLocaleString()}
            {sweep.finishedAt
              ? ` — ${new Date(sweep.finishedAt).toLocaleString()}`
              : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sweep.dryRun ? (
            <Badge size="md" tone="warning">
              {labels.common.dryRun}
            </Badge>
          ) : (
            <Badge size="md" tone="success">
              Live
            </Badge>
          )}
          <Button
            onClick={() => router.push(`/${locale}/superadmin/retention`)}
            size="md"
            type="button"
            variant="secondary"
          >
            {labels.common.back}
          </Button>
        </div>
      </header>

      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-slate-500">{labels.sweep.triggeredBy}</dt>
          <dd className="font-mono">{sweep.triggeredBy}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{labels.sweep.duration}</dt>
          <dd className="font-mono">
            {sweep.durationMs === null ? "—" : `${sweep.durationMs}ms`}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">{labels.sweep.totals}</dt>
          <dd>
            <span aria-label="expired">{sweep.totals.expired}</span> /{" "}
            <span aria-label="archived">{sweep.totals.archived}</span> /{" "}
            <span aria-label="deleted">{sweep.totals.deleted}</span>
          </dd>
        </div>
      </dl>

      <section aria-label={labels.sweep.bucket}>
        <h4 className="mb-2 text-sm font-medium text-slate-700">
          {labels.sweep.bucket} ({sweep.buckets.length})
        </h4>
        {sweep.buckets.length === 0 ? (
          <p className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500" role="status">
            {labels.common.empty}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[14px] border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-5 py-3" scope="col">
                    {labels.sweep.tenant}
                  </th>
                  <th className="px-5 py-3" scope="col">
                    {labels.sweep.logType}
                  </th>
                  <th className="px-5 py-3" scope="col">
                    {labels.sweep.severity}
                  </th>
                  <th className="px-5 py-3" scope="col">
                    {labels.sweep.cutoff}
                  </th>
                  <th className="px-5 py-3" scope="col">
                    {labels.sweep.expired}
                  </th>
                  <th className="px-5 py-3" scope="col">
                    {labels.sweep.archived}
                  </th>
                  <th className="px-5 py-3" scope="col">
                    {labels.sweep.deleted}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sweep.buckets.map((b, idx) => (
                  <tr
                    className="border-t border-slate-100"
                    key={`${b.tenantId ?? "global"}-${b.logType}-${b.severity}-${idx}`}
                  >
                    <td className="px-5 py-3 font-mono text-xs">
                      {b.tenantId ?? labels.policy.globalBadge}
                    </td>
                    <td className="px-5 py-3">
                      {labels.logType[b.logType as LogType] ?? b.logType}
                    </td>
                    <td className="px-5 py-3">
                      {labels.severity[b.severity as Severity] ?? b.severity}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(b.cutoff).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 font-mono">{b.expired}</td>
                    <td className="px-5 py-3 font-mono">{b.archived}</td>
                    <td className="px-5 py-3 font-mono">{b.deleted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </article>
  );
}
