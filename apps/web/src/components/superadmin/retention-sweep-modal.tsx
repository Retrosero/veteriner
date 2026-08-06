/**
 * @file Manuel retention sweep tetikleme modalı.
 * @module @vetniva/web/components/superadmin/retention-sweep-modal
 * @description SUPERADMIN Log Retention modülünde "Sweep Başlat"
 * aksiyonu ile açılan modal. Effective policy çözümü üzerinden
 * tüm tenant × logType × severity bucket'ları için sweep başlatır;
 * `dryRun=true` seçildiğinde gerçek işlem yapılmadan yalnız
 * sayım döner. `logTypes` alanı boş bırakılırsa tüm logType'lar
 * için sweep tetiklenir; `tenantId` alanı boş bırakılırsa global
 * sweep tetiklenir.
 *
 * Erişilebilirlik:
 * - `role="dialog"` + `aria-modal="true"`
 * - `FocusTrap` ile Tab/Shift+Tab klavye odağı kapsayıcı içinde
 *   hapsolur; kapatma sonrası tetikleyici butona geri döner.
 * - Escape tuşu dış kapsayıcı (`retention-tabs`) tarafından
 *   yakalanır.
 * - Form alanları label/aria-label ile eşlenir
 * - Hata mesajı `role="alert"`
 * - Submit butonu loading sırasında `aria-busy`
 * @security Backend `audit:log_retention.sweep_trigger` audit
 * olayı üretir; triggeredBy oturum bilgisinden alınır, UI
 * tarafında set edilmez.
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

type LogType = (typeof LOG_TYPES)[number];

type SweepPayload = {
  dryRun: boolean;
  logTypes: LogType[];
  tenantId: string | null;
};

export type SweepTriggerModalProps = {
  labels: RetentionLabels;
  onClose: () => void;
  onTriggered: () => void;
};

/**
 * Sweep tetikleme modalı. POST /api/v1/superadmin/log-retention/sweeps
 * endpoint'ine body gönderir; başarılı response modal'ı kapatır ve
 * üst komponent (tabs) sayfayı tazeleyerek sweeps sekmesine geçer.
 * @param root0
 * @param root0.labels
 * @param root0.onClose
 * @param root0.onTriggered
 */
export function SweepTriggerModal({
  labels,
  onClose,
  onTriggered,
}: SweepTriggerModalProps): JSX.Element {
  const [tenantId, setTenantId] = useState("");
  const [logTypes, setLogTypes] = useState<LogType[]>([]);
  const [dryRun, setDryRun] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Log tipi seçimini toggle eder. Çoklu seçim; boş = hepsi.
   * @param lt
   */
  const toggleLogType = (lt: LogType): void => {
    setLogTypes((current) =>
      current.includes(lt) ? current.filter((x) => x !== lt) : [...current, lt],
    );
  };

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    setSubmitting(true);
    const payload: SweepPayload = {
      dryRun,
      logTypes,
      tenantId: tenantId.trim() ? tenantId.trim() : null,
    };
    const result = await apiRequest<unknown>(
      "/api/v1/superadmin/log-retention/sweeps",
      {
        method: "POST",
        credentials: "include",
        body: payload,
      },
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(labels.common.saveError);
      return;
    }
    onTriggered();
  };

  return (
    <div
      aria-hidden="false"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onClose}
    >
      <FocusTrap active className="w-full max-w-lg">
        <div
          aria-labelledby="retention-sweep-modal-title"
          aria-modal="true"
          className="rounded-[14px] border border-slate-200 bg-white p-6 shadow-xl"
          id="retention-sweep-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
        >
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3
                className="text-lg font-semibold text-slate-900"
                id="retention-sweep-modal-title"
              >
                {labels.modal.sweepTitle}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {labels.modal.sweepDescription}
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

          <form
            aria-label={labels.modal.sweepTitle}
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <label className="block text-sm text-slate-700">
              <span className="font-medium">{labels.modal.tenantLabel}</span>
              <Input
                aria-label={labels.modal.tenantLabel}
                className="mt-1"
                onChange={(e) => setTenantId(e.target.value)}
                placeholder={labels.modal.tenantPlaceholder}
                value={tenantId}
              />
            </label>

            <fieldset className="border-t border-slate-100 pt-3">
              <legend className="text-sm font-medium text-slate-700">
                {labels.modal.logTypesLabel}
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {LOG_TYPES.map((lt) => {
                  const checked = logTypes.includes(lt);
                  return (
                    <label
                      className="flex items-center gap-2 text-sm text-slate-700"
                      key={lt}
                    >
                      <input
                        aria-label={safeLabelLookup(labels.logType, lt, lt)}
                        checked={checked}
                        className="h-4 w-4 rounded border-slate-300"
                        onChange={() => toggleLogType(lt)}
                        type="checkbox"
                      />
                      <span>{safeLabelLookup(labels.logType, lt, lt)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <label className="flex items-center gap-2 rounded bg-slate-50 p-3 text-sm text-slate-700">
              <input
                aria-label={labels.modal.dryRunLabel}
                checked={dryRun}
                className="h-4 w-4 rounded border-slate-300"
                onChange={(e) => setDryRun(e.target.checked)}
                type="checkbox"
              />
              <span>{labels.modal.dryRunLabel}</span>
            </label>

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
                {labels.modal.submit}
              </Button>
            </div>
          </form>
        </div>
      </FocusTrap>
    </div>
  );
}
