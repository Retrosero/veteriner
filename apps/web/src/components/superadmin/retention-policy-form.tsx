/**
 * @file Retention policy oluşturma / düzenleme modal formu.
 * @module @vetniva/web/components/superadmin/retention-policy-form
 * @description SUPERADMIN Log Retention modülünde yeni bir policy
 * oluşturmak veya mevcut bir policy'yi düzenlemek için kullanılan
 * modal penceresi. (tenantId, logType, severity) üçlüsü kompozit
 * anahtarı temsil eder; tenantId alanı boş bırakılırsa global
 * override oluşturulur. `redactPii` her zaman `true` olarak
 * gönderilir; arayüzde read-only gösterilir çünkü backend
 * override kabul etmez (KVKK/UK GDPR uyumu).
 *
 * Erişilebilirlik:
 * - `role="dialog"` + `aria-modal="true"`
 * - `aria-labelledby` form başlığına bağlanır
 * - `FocusTrap` ile Tab/Shift+Tab klavye odağı kapsayıcı içinde
 *   hapsolur; kapatma sonrası tetikleyici butona geri döner.
 * - Escape tuşu modal'ı kapatır (kapsayıcı tarafından yönetilir)
 * - Hata mesajları `role="alert"` ile duyurulur
 * - Submit butonu loading sırasında `aria-busy="true"`
 * @security Tüm gönderilen payload yalnız whitelist edilmiş
 * alanları içerir. `redactPii` UI'dan override edilemez; backend
 * `audit:log_retention.policy_upsert` audit olayı üretir.
 */

"use client";

import { Button, Input } from "@vetniva/ui";
import { useState } from "react";

import { apiRequest } from "@/lib/api-client";
import { safeLabelLookup } from "@/lib/safe-lookup";

import { FocusTrap } from "./focus-trap";

import type { RetentionLabels } from "./retention-labels";

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

type UpsertPayload = {
  tenantId: string | null;
  logType: LogType;
  severity: Severity;
  retentionDays: number;
  archiveAfterDays: number;
  archiveStorage: ArchiveStorage;
};

export type RetentionPolicyFormProps = {
  labels: RetentionLabels;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Yeni veya düzenleme modunda açılabilen policy form modal'ı. Düzenleme
 * desteği şu anki scope dışı (ayrı route); bu nedenle modal yalnız
 * yeni oluşturma için kullanılır. Gelecekte `existing` prop'u ile
 * düzenleme varyantı eklenebilir.
 * @param root0
 * @param root0.labels
 * @param root0.onClose
 * @param root0.onSaved
 */
export function RetentionPolicyForm({
  labels,
  onClose,
  onSaved,
}: RetentionPolicyFormProps): JSX.Element {
  const [tenantId, setTenantId] = useState("");
  const [logType, setLogType] = useState<LogType>("error_event");
  const [severity, setSeverity] = useState<Severity>("critical");
  const [retentionDays, setRetentionDays] = useState<string>("365");
  const [archiveAfterDays, setArchiveAfterDays] = useState<string>("90");
  const [archiveStorage, setArchiveStorage] = useState<ArchiveStorage>("hot");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  /**
   * Form alanlarını validate eder; geçersizse hata mesajı döner.
   * Backend'in VET-VALIDATION-0001 kontrolü ile aynı mantık.
   * @returns Geçerliyse `null`; aksi halde UI'da gösterilecek hata
   *   mesajı.
   */
  const validate = (): string | null => {
    const r = Number(retentionDays);
    if (!Number.isFinite(r) || r < 1 || r > 3650) {
      return labels.form.validation.retentionRange;
    }
    const a = Number(archiveAfterDays);
    if (!Number.isFinite(a) || a < 0 || a > r) {
      return labels.form.validation.archiveRange;
    }
    return null;
  };

  /**
   * Submit handler. PUT /api/v1/superadmin/log-retention/policies
   * endpoint'ine tenantId/logType/severity/retentionDays/archiveAfterDays/archiveStorage
   * alanlarını gönderir; redactPii gönderilmez (backend her zaman true).
   */
  const handleSubmit = async (): Promise<void> => {
    setError(null);
    const v = validate();
    if (v) {
      setValidationError(v);
      return;
    }
    setValidationError(null);
    setSubmitting(true);
    const payload: UpsertPayload = {
      tenantId: tenantId.trim() ? tenantId.trim() : null,
      logType,
      severity,
      retentionDays: Number(retentionDays),
      archiveAfterDays: Number(archiveAfterDays),
      archiveStorage,
    };
    const result = await apiRequest<unknown>(
      "/api/v1/superadmin/log-retention/policies",
      {
        method: "PUT",
        credentials: "include",
        body: payload,
      },
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(labels.common.saveError);
      return;
    }
    onSaved();
  };

  return (
    <div
      aria-hidden="false"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onClose}
    >
      <FocusTrap active className="w-full max-w-lg">
        <div
          aria-labelledby="retention-policy-modal-title"
          aria-modal="true"
          className="rounded-[14px] border border-slate-200 bg-white p-6 shadow-xl"
          id="retention-policy-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
        >
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3
                className="text-lg font-semibold text-slate-900"
                id="retention-policy-modal-title"
              >
                {labels.form.titleNew}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {labels.form.tenantHint}
              </p>
            </div>
            <button
              aria-label={labels.common.close}
              className="rounded p-1 text-slate-400 hover:text-slate-700"
              onClick={onClose}
              type="button"
            >
              ✕
            </button>
          </div>

          {error ? (
            <p
              className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {validationError ? (
            <p
              className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
              role="alert"
            >
              {validationError}
            </p>
          ) : null}

          <form
            aria-label={labels.form.titleNew}
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <label className="block text-sm text-slate-700">
              <span className="font-medium">{labels.form.tenantLabel}</span>
              <Input
                aria-label={labels.form.tenantLabel}
                className="mt-1"
                onChange={(e) => setTenantId(e.target.value)}
                placeholder={labels.form.tenantPlaceholder}
                value={tenantId}
              />
            </label>
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
            <div className="grid grid-cols-2 gap-3">
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
            <p className="rounded bg-slate-50 p-2 text-xs text-slate-600">
              {labels.form.redactPiiLabel}
            </p>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
              <Button
                onClick={onClose}
                size="md"
                type="button"
                variant="secondary"
              >
                {labels.form.cancel}
              </Button>
              <Button
                aria-busy={submitting}
                disabled={submitting}
                isLoading={submitting}
                size="md"
                type="submit"
                variant="primary"
              >
                {labels.form.submitCreate}
              </Button>
            </div>
          </form>
        </div>
      </FocusTrap>
    </div>
  );
}
