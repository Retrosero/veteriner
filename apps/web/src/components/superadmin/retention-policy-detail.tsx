/**
 * @file Retention policy detay ve düzenleme bileşeni.
 * @module @vetniva/web/components/superadmin/retention-policy-detail
 * @description SUPERADMIN Log Retention — Policy detay sayfasının
 * istemci bileşeni. Tek bir policy'nin (tenantId, logType, severity)
 * alanlarını düzenlenebilir form halinde gösterir; kaydet PUT
 * endpoint'ine gider, sil DELETE endpoint'ine gider. `tenantId`
 * ve `redactPii` alanları read-only'dir; tenantId kompozit anahtarın
 * parçası, redactPii ise KVKK/UK GDPR uyumu gereği servis tarafında
 * her zaman `true` yapılır.
 *
 * Erişilebilirlik:
 * - Form alanları label/aria-label eşleşmesi
 * - Loading/hata durumları `role="status"` / `role="alert"`
 * - Silme aksiyonu `variant="danger"` + onay adımı
 * - Değişiklik olmadan Kaydet devre dışı
 * @security Tüm mutasyonlar `audit:log:read` permission'ı gerektirir;
 * `redactPii` UI'dan gönderilmez (backend zorlar).
 */

"use client";

import { Badge, Button, Input } from "@vetniva/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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

const ARCHIVE_STORAGES = ["hot", "cold", "none"] as const;

type LogType = (typeof LOG_TYPES)[number];
type Severity = (typeof SEVERITIES)[number];
type ArchiveStorage = (typeof ARCHIVE_STORAGES)[number];

type RetentionPolicy = {
  id: string;
  tenantId: string | null;
  logType: string;
  severity: string;
  retentionDays: number;
  archiveAfterDays: number;
  archiveStorage: ArchiveStorage;
  redactPii: boolean;
  createdById: string;
  createdAt: string;
  updatedById: string | null;
  updatedAt: string | null;
};

export type RetentionPolicyDetailProps = {
  locale: Locale;
  policyId: string;
};

function asLogType(v: string): LogType {
  return (LOG_TYPES as readonly string[]).includes(v)
    ? (v as LogType)
    : "error_event";
}

function asSeverity(v: string): Severity {
  return (SEVERITIES as readonly string[]).includes(v)
    ? (v as Severity)
    : "info";
}

function asArchiveStorage(v: string): ArchiveStorage {
  return (ARCHIVE_STORAGES as readonly string[]).includes(v)
    ? (v as ArchiveStorage)
    : "hot";
}

/**
 * Policy detay sayfası. Detay GET'i, upsert PUT'u ve silme DELETE'i
 * tek bileşende toplar. tenantId ve redactPii alanları bilinçli
 * olarak read-only işaretlenmiştir.
 * @param root0
 * @param root0.locale
 * @param root0.policyId
 */
export function RetentionPolicyDetail({
  locale,
  policyId,
}: RetentionPolicyDetailProps): JSX.Element {
  const labels = getLabels(locale).retention;
  const router = useRouter();
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null);
  const [logType, setLogType] = useState<LogType>("error_event");
  const [severity, setSeverity] = useState<Severity>("info");
  const [retentionDays, setRetentionDays] = useState<string>("365");
  const [archiveAfterDays, setArchiveAfterDays] = useState<string>("0");
  const [archiveStorage, setArchiveStorage] = useState<ArchiveStorage>("hot");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const result = await apiRequest<RetentionPolicy>(
      `/api/v1/superadmin/log-retention/policies/${encodeURIComponent(policyId)}`,
      { credentials: "include" },
    );
    if (!result.ok) {
      setError(labels.common.error);
      setLoading(false);
      return;
    }
    const p = result.data;
    setPolicy(p);
    setLogType(asLogType(p.logType));
    setSeverity(asSeverity(p.severity));
    setRetentionDays(String(p.retentionDays));
    setArchiveAfterDays(String(p.archiveAfterDays));
    setArchiveStorage(asArchiveStorage(p.archiveStorage));
    setLoading(false);
  }, [policyId, labels.common.error]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * PUT /api/v1/superadmin/log-retention/policies ile upsert.
   * tenantId kompozit anahtarın parçası olduğu için mevcut değer
   * korunur; redactPii gönderilmez.
   */
  const handleSave = async (): Promise<void> => {
    setSuccess(null);
    setError(null);
    const r = Number(retentionDays);
    if (!Number.isFinite(r) || r < 1 || r > 3650) {
      setValidationError(labels.form.validation.retentionRange);
      return;
    }
    const a = Number(archiveAfterDays);
    if (!Number.isFinite(a) || a < 0 || a > r) {
      setValidationError(labels.form.validation.archiveRange);
      return;
    }
    setValidationError(null);
    setSaving(true);
    const result = await apiRequest<unknown>(
      "/api/v1/superadmin/log-retention/policies",
      {
        method: "PUT",
        credentials: "include",
        body: {
          tenantId: policy?.tenantId ?? null,
          logType,
          severity,
          retentionDays: r,
          archiveAfterDays: a,
          archiveStorage,
        },
      },
    );
    setSaving(false);
    if (!result.ok) {
      setError(labels.common.saveError);
      return;
    }
    setSuccess(labels.common.saveSuccess);
    await load();
  };

  const handleDelete = async (): Promise<void> => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(labels.common.deleteConfirm);
      if (!ok) return;
    }
    setDeleting(true);
    setError(null);
    const result = await apiRequest<unknown>(
      `/api/v1/superadmin/log-retention/policies/${encodeURIComponent(policyId)}`,
      { method: "DELETE", credentials: "include" },
    );
    setDeleting(false);
    if (!result.ok) {
      setError(labels.common.deleteError);
      return;
    }
    setSuccess(labels.common.deleteSuccess);
    router.push(`/${locale}/superadmin/retention`);
  };

  if (loading) {
    return (
      <p className="text-slate-500" role="status">
        {labels.common.loading}
      </p>
    );
  }

  if (error && !policy) {
    return (
      <p
        className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        role="alert"
      >
        {error}
      </p>
    );
  }

  if (!policy) return <p role="status">{labels.common.empty}</p>;

  const isGlobal = policy.tenantId === null;

  return (
    <article
      aria-label={labels.form.titleEdit}
      className="space-y-5 rounded-[14px] border border-slate-200 bg-white p-6 shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {labels.form.titleEdit}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            <span className="font-mono">{policy.id}</span>
            {isGlobal ? (
              <span className="ml-2">
                <Badge size="sm" tone="info">
                  {labels.policy.globalBadge}
                </Badge>
              </span>
            ) : null}
          </p>
        </div>
        <Button
          onClick={() => router.push(`/${locale}/superadmin/retention`)}
          size="md"
          type="button"
          variant="secondary"
        >
          {labels.common.back}
        </Button>
      </header>

      {error ? (
        <p
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {validationError ? (
        <p
          className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          role="alert"
        >
          {validationError}
        </p>
      ) : null}
      {success ? (
        <p
          className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          role="status"
        >
          {success}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm text-slate-700">
            <span className="font-medium">{labels.form.tenantLabel}</span>
            <Input
              aria-label={labels.form.tenantLabel}
              className="mt-1"
              disabled
              readOnly
              value={policy.tenantId ?? ""}
            />
          </label>
        </div>
        <div>
          <label className="block text-sm text-slate-700">
            <span className="font-medium">{labels.form.logTypeLabel}</span>
            <select
              aria-label={labels.form.logTypeLabel}
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
        </div>
        <div>
          <label className="block text-sm text-slate-700">
            <span className="font-medium">{labels.form.severityLabel}</span>
            <select
              aria-label={labels.form.severityLabel}
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
          <label className="block text-sm text-slate-700">
            <span className="font-medium">{labels.form.redactPiiLabel}</span>
            <Input
              aria-label={labels.form.redactPiiLabel}
              className="mt-1"
              disabled
              readOnly
              value="true"
            />
          </label>
        </div>
        <div>
          <label className="block text-sm text-slate-700">
            <span className="font-medium">
              {labels.form.retentionDaysLabel}
            </span>
            <Input
              aria-label={labels.form.retentionDaysLabel}
              className="mt-1"
              inputMode="numeric"
              min={1}
              onChange={(e) => setRetentionDays(e.target.value)}
              value={retentionDays}
            />
          </label>
        </div>
        <div>
          <label className="block text-sm text-slate-700">
            <span className="font-medium">
              {labels.form.archiveAfterDaysLabel}
            </span>
            <Input
              aria-label={labels.form.archiveAfterDaysLabel}
              className="mt-1"
              inputMode="numeric"
              min={0}
              onChange={(e) => setArchiveAfterDays(e.target.value)}
              value={archiveAfterDays}
            />
          </label>
        </div>
        <div>
          <label className="block text-sm text-slate-700">
            <span className="font-medium">
              {labels.form.archiveStorageLabel}
            </span>
            <select
              aria-label={labels.form.archiveStorageLabel}
              className="mt-1 h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-clinic-500 focus:outline-none focus:ring-2 focus:ring-clinic-500/20"
              onChange={(e) =>
                setArchiveStorage(e.target.value as ArchiveStorage)
              }
              value={archiveStorage}
            >
              {ARCHIVE_STORAGES.map((s) => (
                <option key={s} value={s}>
                  {safeLabelLookup(labels.archiveStorage, s, s)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
        <dl className="grid gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-2">
          <div>
            <dt>{labels.policy.createdBy}</dt>
            <dd className="font-mono">{policy.createdById}</dd>
          </div>
          <div>
            <dt>{labels.policy.createdAt}</dt>
            <dd>{new Date(policy.createdAt).toLocaleString()}</dd>
          </div>
          {policy.updatedAt ? (
            <>
              <div>
                <dt>{labels.policy.updatedBy}</dt>
                <dd className="font-mono">{policy.updatedById ?? "—"}</dd>
              </div>
              <div>
                <dt>{labels.policy.updatedAt}</dt>
                <dd>{new Date(policy.updatedAt).toLocaleString()}</dd>
              </div>
            </>
          ) : null}
        </dl>
        <div className="flex items-center gap-2">
          <Button
            disabled={deleting}
            isLoading={deleting}
            onClick={() => void handleDelete()}
            size="md"
            type="button"
            variant="danger"
          >
            {labels.common.delete}
          </Button>
          <Button
            aria-busy={saving}
            disabled={saving}
            isLoading={saving}
            onClick={() => void handleSave()}
            size="md"
            type="button"
            variant="primary"
          >
            {labels.form.submitSave}
          </Button>
        </div>
      </div>
    </article>
  );
}
