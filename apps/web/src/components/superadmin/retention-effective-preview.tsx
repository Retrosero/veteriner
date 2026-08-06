/**
 * @file Effective retention policy önizleme bileşeni.
 * @module @vetniva/web/components/superadmin/retention-effective-preview
 * @description SUPERADMIN Log Retention — Effective sekmesinin önizleme
 * aracı. tenantId × logType × severity kombinasyonu için geçerli
 * policy'yi `tenantOverride → globalOverride → default` sırasıyla
 * çözer. `source` alanı kaynağı belirtir. Kullanıcı filtreleri
 * doldurup "Hesapla" butonuna bastığında `GET /policies/effective`
 * çağrılır.
 *
 * Erişilebilirlik:
 * - Filtre alanları label/aria-label eşleşmesi
 * - Hata/boş durumlar `role="status"` / `role="alert"`
 * - Sonuç kartı `role="region"` + `aria-label`
 * - Source badge'i tone ile renk semantiği taşır
 * @security Backend effective policy çözümünü uygular; UI yalnız
 * filtre değerlerini gönderir. `audit:log:read` yetkisi zorunlu.
 */

"use client";

import { Badge } from "@vetniva/ui";
import { useState } from "react";

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

type EffectivePolicy = {
  tenantId: string | null;
  logType: string;
  severity: string;
  retentionDays: number;
  archiveAfterDays: number;
  archiveStorage: "hot" | "cold" | "none";
  redactPii: boolean;
  source: "tenantOverride" | "globalOverride" | "default";
};

type EffectiveState = {
  data: EffectivePolicy | null;
  error: string | null;
  loading: boolean;
};

export type RetentionEffectivePreviewProps = {
  locale: Locale;
};

function sourceTone(
  s: EffectivePolicy["source"],
): "success" | "info" | "neutral" {
  if (s === "tenantOverride") return "success";
  if (s === "globalOverride") return "info";
  return "neutral";
}

/**
 * Effective policy önizleme bileşeni. Backend'den gelen `source` alanına
 * göre `tenantOverride → globalOverride → default` zincirini görsel
 * rozetle gösterir; resolved policy alanlarını kart formatında sunar.
 * @param root0
 * @param root0.locale
 */
export function RetentionEffectivePreview({
  locale,
}: RetentionEffectivePreviewProps): JSX.Element {
  const labels = getLabels(locale).retention;
  const [tenantId, setTenantId] = useState("");
  const [logType, setLogType] = useState<LogType>("error_event");
  const [severity, setSeverity] = useState<Severity>("critical");
  const [state, setState] = useState<EffectiveState>({
    data: null,
    error: null,
    loading: false,
  });

  /**
   * Filtre değerleri ile birlikte effective policy'yi sorgular. logType
   * ve severity zorunlu; tenantId opsiyonel (boş = global).
   */
  const resolve = async (): Promise<void> => {
    setState({ data: null, error: null, loading: true });
    const query = new URLSearchParams({ logType, severity });
    if (tenantId.trim()) query.set("tenantId", tenantId.trim());
    const result = await apiRequest<EffectivePolicy>(
      `/api/v1/superadmin/log-retention/policies/effective?${query.toString()}`,
      { credentials: "include" },
    );
    if (!result.ok) {
      setState({ data: null, error: labels.common.error, loading: false });
      return;
    }
    setState({ data: result.data, error: null, loading: false });
  };

  return (
    <section
      aria-label={labels.effective.title}
      className="space-y-4"
      data-testid="retention-effective-preview"
    >
      <header>
        <h3 className="text-base font-semibold text-slate-900">
          {labels.effective.title}
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {labels.effective.description}
        </p>
      </header>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
        <label className="text-sm text-slate-700">
          <span className="font-medium">{labels.filters.tenant}</span>
          <input
            aria-label={labels.filters.tenant}
            className="mt-1 h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-clinic-500 focus:outline-none focus:ring-2 focus:ring-clinic-500/20"
            onChange={(e) => setTenantId(e.target.value)}
            placeholder={labels.filters.tenantPlaceholder}
            value={tenantId}
          />
        </label>
        <label className="text-sm text-slate-700">
          <span className="font-medium">{labels.filters.logType}</span>
          <select
            aria-label={labels.filters.logType}
            className="mt-1 h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-clinic-500 focus:outline-none focus:ring-2 focus:ring-clinic-500/20"
            onChange={(e) => setLogType(e.target.value as LogType)}
            value={logType}
          >
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
            onChange={(e) => setSeverity(e.target.value as Severity)}
            value={severity}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {safeLabelLookup(labels.severity, s, s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <button
          aria-busy={state.loading}
          className="rounded-lg bg-clinic-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-clinic-600 disabled:opacity-50"
          disabled={state.loading}
          onClick={() => void resolve()}
          type="button"
        >
          {labels.effective.apply}
        </button>
      </div>

      {state.error ? (
        <p
          className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      {state.data ? (
        <article
          aria-label={labels.effective.title}
          className="rounded-[14px] border border-slate-200 bg-white p-5 shadow-sm"
          role="region"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">
              {labels.effective.source}
            </span>
            <Badge size="md" tone={sourceTone(state.data.source)}>
              {state.data.source === "tenantOverride"
                ? labels.effective.sourceTenantOverride
                : state.data.source === "globalOverride"
                  ? labels.effective.sourceGlobalOverride
                  : labels.effective.sourceDefault}
            </Badge>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">{labels.policy.tenant}</dt>
              <dd className="font-mono text-xs">
                {state.data.tenantId ?? labels.policy.globalBadge}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{labels.policy.logType}</dt>
              <dd>
                {labels.logType[state.data.logType as LogType] ??
                  state.data.logType}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{labels.policy.severity}</dt>
              <dd>
                {labels.severity[state.data.severity as Severity] ??
                  state.data.severity}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{labels.policy.retentionDays}</dt>
              <dd className="font-mono">{state.data.retentionDays}</dd>
            </div>
            <div>
              <dt className="text-slate-500">
                {labels.policy.archiveAfterDays}
              </dt>
              <dd className="font-mono">{state.data.archiveAfterDays}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{labels.policy.archiveStorage}</dt>
              <dd>{labels.archiveStorage[state.data.archiveStorage]}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{labels.policy.redactPii}</dt>
              <dd>{state.data.redactPii ? "true" : "false"}</dd>
            </div>
          </dl>
        </article>
      ) : !state.loading && !state.error ? (
        <p className="text-sm text-slate-500" role="status">
          {labels.effective.noResult}
        </p>
      ) : null}
    </section>
  );
}
