/**
 * @file JobRun service.
 * @module apps/api/modules/job-runs/job-runs.service
 *
 * @description GOAL-102 (FAZ-10) background job ve entegrasyon
 * logları iş kuralları. Worker kayıtları kalıcı Prisma `JobRun`
 * tablosundan uygulama başlangıcında okunur; API'nin yönetim aksiyonları
 * için kalıcı yazma adaptörü sonraki uygulama adımında tamamlanacaktır.
 *
 * - `startRun`: yeni bir JobRun kaydı açar. `attempt=1` ve
 *   `status='running'` ile başlar. `correlationId` zorunludur;
 *   `tenantId` opsiyonel (system job'lar null). Audit
 *   `audit:job_run.start` (info).
 * - `finishRun`: çalışan run'ı sonuçlandırır. `succeeded` için
 *   `output` zorunlu, `failed`/`dead_letter` için `errorCode`
 *   zorunlu (zod refine). `attempt < maxAttempts` olan failed
 *   run'lar `failed` kalır; `attempt >= maxAttempts` ise
 *   otomatik `dead_letter`'a terfi eder (caller override
 *   edebilir). `durationMs` = finishedAt - startedAt.
 *   Audit `audit:job_run.finish`.
 * - `retryRun`: failed/dead_letter run'dan yeni deneme başlatır.
 *   Yeni run `parentRunId` ile eski run'a bağlanır; `attempt`
 *   bir artırılır. Eski run'ın durumu değişmez (geçmiş kaydı).
 *   Yeni deneme hemen `running` olarak açılır. Audit
 *   `audit:job_run.retry`.
 * - `getJobRunDetail`: id bazlı tekil kayıt.
 * - `listJobRuns`: filtreli arama (SUPERADMIN).
 * - `listAttemptsByJobKey`: aynı `jobKey` için tüm retry
 *   geçmişi (en eski → en yeni).
 * - `listDeadLetter`: yalnızca dead-letter view.
 * - `getJobRunSummary`: status + queue + dead-letter-24h +
 *   oldestRunning aggregate.
 *
 * @security Tenant filtresi opsiyonel; SUPERADMIN cross-tenant
 *   görür. Ancak PII zaten mask'lı gelir; ek bir sanitization
 *   gerekmez. `input` ve `output` PiiMasker'dan geçirilir.
 *
 * @since GOAL-102 (FAZ-10) background job ve entegrasyon logları core
 */

import { Injectable, Logger } from "@nestjs/common";

import { JobRunsRepository } from "./job-runs.repository.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toJobRun,
  type JobRunRecord,
} from "../../common/job-runs/job-run.types.js";
import { PiiMasker } from "../../common/logging/pii-masker.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  JobRun,
  JobRunAttemptsByKeyResponse,
  JobRunCountry,
  JobRunFinishInput,
  JobRunListResponse,
  JobRunRetryInput,
  JobRunSource,
  JobRunStartInput,
  JobRunStatus,
  JobRunSummary,
  JobRunSummaryQuery,
  JobRunTriggeredBy,
} from "@vetniva/contracts";

/** Uygulama sürümü. `APP_VERSION` env ya da sabit. */
const APP_RELEASE = process.env["APP_VERSION"] ?? "0.0.0-dev";

/** Dead-letter 24h penceresi için sabit. */
const DEAD_LETTER_WINDOW_HOURS = 24;

/** Job run'larının maksimum tutulabilecek input/output boyutu. */
const MAX_PAYLOAD_KEYS = 100;

@Injectable()
export class JobRunsService {
  private readonly logger = new Logger(JobRunsService.name);
  private readonly masker = new PiiMasker();

  public constructor(private readonly repo: JobRunsRepository) {}

  // -------------------------------------------------------------------------
  // startRun — bir iş denemesi başlat
  // -------------------------------------------------------------------------

  /**
   * Yeni bir JobRun kaydı açar. `attempt=1`, `status='running'`,
   * `finishedAt=null` ile başlar. `correlationId` verilmediyse
   * yeni bir requestId üretilir.
   *
   * Audit `audit:job_run.start` (info).
   */
  public startRun(input: JobRunStartInput): JobRun {
    const id = this.repo.nextId();
    const startedAt = new Date().toISOString();
    const record: JobRunRecord = {
      id,
      queueName: input.queueName,
      jobName: input.jobName,
      jobKey: input.jobKey,
      source: input.source,
      status: "running",
      attempt: 1,
      maxAttempts: input.maxAttempts,
      tenantId: input.tenantId ?? null,
      branchId: input.branchId ?? null,
      correlationId: input.correlationId ?? this.makeCorrelationId(),
      requestId: input.requestId ?? null,
      actorId: input.actorId ?? null,
      actorType: input.actorType,
      input: this.maskPayload(input.input ?? {}),
      output: {},
      errorCode: null,
      errorMessage: null,
      errorStack: null,
      startedAt,
      finishedAt: null,
      durationMs: null,
      parentRunId: null,
      triggeredBy: input.triggeredBy,
      country: input.country,
      release: input.release ?? APP_RELEASE,
    };
    this.repo.insert(record);
    this.logger.debug({
      msg: "job_run.start",
      id: record.id,
      queue: record.queueName,
      job: record.jobName,
      jobKey: record.jobKey,
      attempt: record.attempt,
    });
    return toJobRun(record);
  }

  // -------------------------------------------------------------------------
  // finishRun — denemeyi sonuçlandır
  // -------------------------------------------------------------------------

  /**
   * Çalışan run'ı sonuçlandırır. Aşağıdaki kurallar uygulanır:
   *
   * - Status 'succeeded' ise `output` zorunlu (zod refine).
   *   `errorCode`/`errorMessage`/`errorStack` temizlenir.
   * - Status 'failed' veya 'dead_letter' ise `errorCode` zorunlu.
   *   `output` temizlenir; `errorStack` saklanır.
   * - `attempt >= maxAttempts` olan bir `failed` çağrısı otomatik
   *   `dead_letter`'a terfi eder; caller açıkça `succeeded` veya
   *   `dead_letter` gönderdiyse override edilmez.
   * - `finishedAt` = now(); `durationMs` = finishedAt - startedAt.
   * - Idempotent: zaten terminal (succeeded/failed/dead_letter)
   *   olan run'a ikinci kez finish çağrılırsa 409 VET-JOBRUN-0002.
   *
   * Audit `audit:job_run.finish` (info / warning).
   */
  public finishRun(id: string, input: JobRunFinishInput): JobRun {
    const rec = this.repo.findById(id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-JOBRUN-0001",
        message: "Job run bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-JOBRUN-0001",
        details: { id },
      });
    }
    if (
      rec.status === "succeeded" ||
      rec.status === "failed" ||
      rec.status === "dead_letter"
    ) {
      throw new DomainError({
        errorCode: "VET-JOBRUN-0002",
        message: "Job run zaten sonuçlandırılmış",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-JOBRUN-0002",
        details: { id, status: rec.status },
      });
    }

    // Status resolve: failed → dead_letter terfisi.
    let finalStatus: JobRunStatus = input.status;
    if (input.status === "failed" && rec.attempt >= rec.maxAttempts) {
      finalStatus = "dead_letter";
    }

    const finishedAt = new Date().toISOString();
    const startMs = new Date(rec.startedAt).getTime();
    const endMs = new Date(finishedAt).getTime();
    const durationMs = Math.max(0, endMs - startMs);

    const patch: Partial<JobRunRecord> = {
      status: finalStatus,
      finishedAt,
      durationMs,
    };
    if (input.status === "succeeded") {
      patch.output = this.maskPayload(input.output ?? {});
      patch.errorCode = null;
      patch.errorMessage = null;
      patch.errorStack = null;
    } else {
      // failed / dead_letter
      patch.errorCode = input.errorCode ?? null;
      patch.errorMessage = input.errorMessage ?? null;
      patch.errorStack = input.errorStack ?? null;
      patch.output = {};
    }
    this.repo.update(id, patch);
    const updated = this.repo.findById(id);
    if (!updated) {
      // Defensive: update null dönemez; ama TS için.
      throw new DomainError({
        errorCode: "VET-JOBRUN-0001",
        message: "Job run güncellenemedi",
        httpStatus: 500,
        severity: "critical",
        i18nKey: "error.VET-JOBRUN-0001",
        details: { id },
      });
    }
    this.logger.debug({
      msg: "job_run.finish",
      id,
      status: finalStatus,
      durationMs,
      attempt: updated.attempt,
      maxAttempts: updated.maxAttempts,
    });
    return toJobRun(updated);
  }

  // -------------------------------------------------------------------------
  // retryRun — failed/dead_letter'dan yeni deneme
  // -------------------------------------------------------------------------

  /**
   * `failed` veya `dead_letter` run'dan yeni deneme başlatır.
   * - Eski run'ın durumu değişmez (geçmiş kaydı olarak kalır).
   * - Yeni run `parentRunId` ile eski run'a bağlanır.
   * - Yeni `attempt` = eski `attempt + 1`.
   * - `triggeredBy` = "manual_retry".
   * - Yeni run hemen `running` olarak açılır (caller başlatacak).
   *
   * `failed` run'dan retry normal akıştır; `dead_letter`'dan
   * retry ise operatör müdahalesi gerektirir. `succeeded` veya
   * hala `running`/`pending` olan run'dan retry yapılamaz.
   * (VET-JOBRUN-0003 / VET-JOBRUN-0004)
   */
  public retryRun(
    id: string,
    actor: ActorContext,
    input: JobRunRetryInput = {},
  ): JobRun {
    const rec = this.repo.findById(id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-JOBRUN-0001",
        message: "Job run bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-JOBRUN-0001",
        details: { id },
      });
    }
    if (rec.status !== "failed" && rec.status !== "dead_letter") {
      throw new DomainError({
        errorCode: "VET-JOBRUN-0003",
        message: "Yalnızca failed/dead_letter run'lardan retry yapılabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-JOBRUN-0003",
        details: { id, status: rec.status },
      });
    }
    if (rec.attempt >= rec.maxAttempts && rec.status === "dead_letter") {
      // dead_letter durumda attempt == maxAttempts; yine de retry
      // yapılabilir (operatör kararı). maxAttempts override edilir.
    }

    const newId = this.repo.nextId();
    const startedAt = new Date().toISOString();
    const newRecord: JobRunRecord = {
      id: newId,
      queueName: rec.queueName,
      jobName: rec.jobName,
      jobKey: rec.jobKey,
      source: rec.source,
      status: "running",
      attempt: rec.attempt + 1,
      maxAttempts: input.maxAttempts ?? rec.maxAttempts,
      tenantId: rec.tenantId,
      branchId: rec.branchId,
      correlationId: actor.correlationId ?? rec.correlationId,
      requestId: rec.requestId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      input: this.maskPayload(input.input ?? rec.input),
      output: {},
      errorCode: null,
      errorMessage: null,
      errorStack: null,
      startedAt,
      finishedAt: null,
      durationMs: null,
      parentRunId: rec.id,
      triggeredBy: "manual_retry",
      country: rec.country,
      release: rec.release,
    };
    this.repo.insert(newRecord);
    this.logger.debug({
      msg: "job_run.retry",
      fromId: rec.id,
      newId,
      attempt: newRecord.attempt,
      maxAttempts: newRecord.maxAttempts,
      reason: input.reason,
    });
    return toJobRun(newRecord);
  }

  // -------------------------------------------------------------------------
  // getJobRunDetail
  // -------------------------------------------------------------------------

  public getJobRunDetail(id: string, actor: ActorContext): JobRun {
    this.requireSuperadmin(actor);
    const rec = this.repo.findById(id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-JOBRUN-0001",
        message: "Job run bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-JOBRUN-0001",
        details: { id },
      });
    }
    return toJobRun(rec);
  }

  // -------------------------------------------------------------------------
  // listJobRuns
  // -------------------------------------------------------------------------

  public listJobRuns(
    filters: {
      queueName?: string | undefined;
      jobName?: string | undefined;
      jobKey?: string | undefined;
      status?: JobRunStatus | undefined;
      source?: JobRunSource | undefined;
      tenantId?: string | undefined;
      branchId?: string | undefined;
      correlationId?: string | undefined;
      country?: JobRunCountry | undefined;
      triggeredBy?: JobRunTriggeredBy | undefined;
      from?: string | undefined;
      to?: string | undefined;
      search?: string | undefined;
      sort?: "asc" | "desc" | undefined;
      limit: number;
      offset: number;
    },
    actor: ActorContext,
  ): JobRunListResponse {
    this.requireSuperadmin(actor);
    const result = this.repo.search({
      queueName: filters.queueName,
      jobName: filters.jobName,
      jobKey: filters.jobKey,
      status: filters.status,
      source: filters.source,
      tenantId: filters.tenantId,
      branchId: filters.branchId,
      correlationId: filters.correlationId,
      country: filters.country,
      triggeredBy: filters.triggeredBy,
      from: filters.from,
      to: filters.to,
      search: filters.search,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map(toJobRun),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // listAttemptsByJobKey — aynı işin tüm denemeleri
  // -------------------------------------------------------------------------

  public listAttemptsByJobKey(
    jobKey: string,
    actor: ActorContext,
  ): JobRunAttemptsByKeyResponse {
    this.requireSuperadmin(actor);
    const records = this.repo.findByJobKey(jobKey);
    const items = records.map(toJobRun);
    const last = records[records.length - 1] ?? null;
    const allFailed =
      records.length > 0 && records.every((r) => r.status === "failed");
    return {
      jobKey,
      items,
      total: items.length,
      allFailed,
      lastStatus: last ? last.status : null,
    };
  }

  // -------------------------------------------------------------------------
  // listDeadLetter
  // -------------------------------------------------------------------------

  public listDeadLetter(
    filters: {
      tenantId?: string | undefined;
      queueName?: string | undefined;
      jobName?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
      limit: number;
      offset: number;
    },
    actor: ActorContext,
  ): JobRunListResponse {
    this.requireSuperadmin(actor);
    const result = this.repo.listDeadLetter({
      tenantId: filters.tenantId,
      queueName: filters.queueName,
      jobName: filters.jobName,
      from: filters.from,
      to: filters.to,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map(toJobRun),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getJobRunSummary
  // -------------------------------------------------------------------------

  public getJobRunSummary(
    filters: JobRunSummaryQuery,
    actor: ActorContext,
  ): JobRunSummary {
    this.requireSuperadmin(actor);

    // Queue filtresi uygulanmışsa yalnızca o queue'nun kayıtları
    // üzerinden özet çıkarılır; aksi halde tüm queue'lar.
    const all = this.repo.all().filter((r) => {
      if (filters.queueName && r.queueName !== filters.queueName) return false;
      if (filters.from && r.startedAt < filters.from) return false;
      if (filters.to && r.startedAt > filters.to) return false;
      return true;
    });

    // Status sayımı.
    const byStatus = new Map<JobRunStatus, number>();
    for (const r of all) {
      byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    }

    // Queue sayımı (tüm queue'lar dahil; queue filtresi uygulansa
    // bile aynı set içinde).
    const byQueueMap = new Map<
      string,
      {
        queueName: string;
        total: number;
        succeeded: number;
        failed: number;
        deadLetter: number;
        running: number;
        pending: number;
      }
    >();
    for (const r of all) {
      let e = byQueueMap.get(r.queueName);
      if (!e) {
        e = {
          queueName: r.queueName,
          total: 0,
          succeeded: 0,
          failed: 0,
          deadLetter: 0,
          running: 0,
          pending: 0,
        };
        byQueueMap.set(r.queueName, e);
      }
      e.total += 1;
      switch (r.status) {
        case "succeeded":
          e.succeeded += 1;
          break;
        case "failed":
          e.failed += 1;
          break;
        case "dead_letter":
          e.deadLetter += 1;
          break;
        case "running":
          e.running += 1;
          break;
        case "pending":
          e.pending += 1;
          break;
      }
    }

    // Dead-letter 24h penceresi (tüm tenant'lar dahil).
    const cutoff = new Date(
      Date.now() - DEAD_LETTER_WINDOW_HOURS * 3600_000,
    ).toISOString();
    const deadLetterLast24h = this.repo.countDeadLetterSince(cutoff);

    const oldestRunningAt = this.repo.oldestActiveStartedAt();

    const statusOrder: JobRunStatus[] = [
      "pending",
      "running",
      "succeeded",
      "failed",
      "dead_letter",
    ];
    return {
      total: all.length,
      byStatus: statusOrder
        .filter((s) => byStatus.has(s))
        .map((s) => ({ status: s, count: byStatus.get(s) ?? 0 })),
      byQueue: Array.from(byQueueMap.values()).sort(
        (a, b) => b.total - a.total,
      ),
      deadLetterLast24h,
      oldestRunningAt,
      windowFrom: filters.from ?? null,
      windowTo: filters.to ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * SUPERADMIN kontrolü. error-events modülüyle aynı kalıp.
   */
  private requireSuperadmin(actor: ActorContext): void {
    if (actor.role === "SUPERADMIN" || actor.isSuperadmin) return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem yalnızca SUPERADMIN için",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }

  /**
   * Payload'ı PII mask'ler. Çok büyük payload'lar truncate edilir.
   * Null/undefined korunur.
   */
  private maskPayload(
    payload: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    if (!payload) return {};
    try {
      const masked = this.masker.mask(payload);
      const keys = Object.keys(masked);
      if (keys.length <= MAX_PAYLOAD_KEYS) return masked;
      const trimmed: Record<string, unknown> = {};
      for (const k of keys.slice(0, MAX_PAYLOAD_KEYS)) {
        Object.defineProperty(trimmed, k, {
          configurable: true,
          enumerable: true,
          value: Reflect.get(masked, k),
          writable: true,
        });
      }
      trimmed["__truncated__"] = true;
      return trimmed;
    } catch {
      return {};
    }
  }

  /**
   * Yeni correlation ID üretir. `req-<timestamp>-<counter>`.
   */
  private makeCorrelationId(): string {
    return `jobrun-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
