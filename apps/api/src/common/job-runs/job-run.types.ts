/**
 * @file JobRun domain tipleri.
 * @module apps/api/common/job-runs/job-run.types
 *
 * @description GOAL-102 (FAZ-10) JobRun için iç kayıt tipleri.
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `JobRun` tablosu ile değiştirilecek (API sözleşmesi sabit kalır).
 *
 * `JobRunRecord` ile `JobRun` ayrılmıştır: record repository içi
 * tam yapı (startedAt/finishedAt raw, internal state alanları)
 * iken `JobRun` API'ye dönen public shape'tir.
 *
 * @security `input` ve `output` payload'ları `PiiMasker`'dan
 *   geçirilir; `errorStack` yalnızca failed/dead_letter için
 *   saklanır. PII mask'lenmemiş payload kabul edilmez.
 *
 * @since GOAL-102 (FAZ-10) background job ve entegrasyon logları core
 */

import type {
  ErrorEventActorType,
  ErrorEventCountry,
  AnyErrorCode,
  JobRun,
  JobRunSource,
  JobRunStatus,
  JobRunTriggeredBy,
} from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Persist edilmiş kayıt
 * --------------------------------------------------------------------------
 */

/** Repository içi tam kayıt. */
export interface JobRunRecord {
  id: string;
  queueName: string;
  jobName: string;
  jobKey: string;
  source: JobRunSource;
  status: JobRunStatus;
  attempt: number;
  maxAttempts: number;
  tenantId: string | null;
  branchId: string | null;
  correlationId: string;
  requestId: string | null;
  actorId: string | null;
  actorType: ErrorEventActorType;
  /** Job payload (PII mask'lı). */
  input: Record<string, unknown>;
  /** Sonuç (PII mask'lı; succeeded için). */
  output: Record<string, unknown>;
  errorCode: AnyErrorCode | null;
  errorMessage: string | null;
  errorStack: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  parentRunId: string | null;
  triggeredBy: JobRunTriggeredBy;
  country: ErrorEventCountry;
  release: string;
}

export type {
  JobRun,
  JobRunStatus,
  JobRunSource,
  JobRunTriggeredBy,
  ErrorEventCountry as JobRunCountry,
};

/* --------------------------------------------------------------------------
 * Record → public dönüşüm
 * --------------------------------------------------------------------------
 */

/**
 * Repository kaydını API'nin göreceği public shape'e dönüştürür.
 * Şu an birebir eşleşir; API sözleşmesi değişirse burası maskeleme
 * noktası olur.
 */
export function toJobRun(rec: JobRunRecord): JobRun {
  return {
    id: rec.id,
    queueName: rec.queueName,
    jobName: rec.jobName,
    jobKey: rec.jobKey,
    source: rec.source,
    status: rec.status,
    attempt: rec.attempt,
    maxAttempts: rec.maxAttempts,
    tenantId: rec.tenantId,
    branchId: rec.branchId,
    correlationId: rec.correlationId,
    requestId: rec.requestId,
    actorId: rec.actorId,
    actorType: rec.actorType,
    input: rec.input,
    output: rec.output,
    errorCode: rec.errorCode,
    errorMessage: rec.errorMessage,
    errorStack: rec.errorStack,
    startedAt: rec.startedAt,
    finishedAt: rec.finishedAt,
    durationMs: rec.durationMs,
    parentRunId: rec.parentRunId,
    triggeredBy: rec.triggeredBy,
    country: rec.country,
    release: rec.release,
  };
}

/* --------------------------------------------------------------------------
 * Idempotency / jobKey yardımcıları
 * --------------------------------------------------------------------------
 */

/**
 * Aynı `jobKey` için tüm run'ları sıralı döner (en eski → en yeni).
 * Repository tarafından kullanılır.
 */
export function buildJobKeyDedupIndex(
  records: ReadonlyArray<JobRunRecord>,
): Map<string, JobRunRecord[]> {
  const byKey = new Map<string, JobRunRecord[]>();
  for (const r of records) {
    const arr = byKey.get(r.jobKey);
    if (arr) {
      arr.push(r);
    } else {
      byKey.set(r.jobKey, [r]);
    }
  }
  for (const arr of byKey.values()) {
    arr.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }
  return byKey;
}
