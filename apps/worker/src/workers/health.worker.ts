/**
 * @file Health worker tanımı.
 * @module @vetniva/worker/workers/health
 *
 * @description BullMQ `Worker` örneği: `health` queue'sunu dinler,
 * her job için `processHealthJob` processor'ını çalıştırır.
 * Concurrency 2'dir (aynı anda 2 job); lock duration 30s'dir
 * (uzun süren health check'leri için yeterli).
 *
 * @security Hatalar `failed` event'i ile loglanır; `failedReason`
 * içinde PII bulunmaz (Zod doğrulama hatası mesajları sadece alan
 * adı ve hata tipi içerir). Job tekrarı (retry) BullMQ
 * backoff ayarları ile kontrol edilir; 3 deneme sonrası job
 * `failed` state'e düşer.
 */

import { Worker, type Job } from "bullmq";

import { processHealthJob, type HealthJobPayload } from "../jobs/health-job.js";
import { logger } from "../logger.js";
import { getRedisConnection } from "../queues/connection.js";
import { HEALTH_QUEUE_NAME } from "../queues/health.queue.js";
import {
  finishJobRun,
  startJobRun,
} from "../observability/job-run-reporter.js";
import {
  maskWorkerPayload,
  maskWorkerString,
} from "../observability/pii-masker.js";

/**
 * Worker seçenekleri. Sabit kodlanmış: orchestrator bu değerleri
 * sonradan environment'a taşıyabilir, ancak GOAL-000 için
 * yeterli.
 */
const WORKER_OPTIONS = {
  concurrency: 2,
  lockDuration: 30_000,
  // Aynı jobId iki kez geldiğinde BullMQ otomatik skip eder.
  // (removeOnComplete ile birlikte çalışır.)
} as const;

let worker: Worker | null = null;

/**
 * Paylaşılan worker örneğini al. İlk çağrıda oluşturulur; event
 * handler'lar burada bağlanır.
 */
export function getHealthWorker(): Worker {
  if (worker === null) {
    worker = new Worker<HealthJobPayload>(
      HEALTH_QUEUE_NAME,
      async (job: Job<HealthJobPayload>) => {
        const correlationId = job.id ?? `unknown-${Date.now()}`;
        const attempt = job.attemptsMade + 1;
        const maxAttempts = job.opts.attempts ?? 1;
        const jobRunId = await startJobRun({
          queueName: HEALTH_QUEUE_NAME,
          jobName: job.name,
          jobKey: correlationId,
          attempt,
          maxAttempts,
          input: job.data,
        });
        const childLogger = logger.child({
          module: "worker",
          action: "health-worker",
          jobId: correlationId,
          correlationId,
        });
        childLogger.info(
          {
            attempt: job.attemptsMade + 1,
            data: maskWorkerPayload(job.data),
          },
          "health job işleniyor",
        );
        try {
          const result = await processHealthJob(job.data);
          await finishJobRun({
            id: jobRunId,
            succeeded: true,
            attempt,
            maxAttempts,
            output: result as unknown as Record<string, unknown>,
          });
          childLogger.info(
            { result: maskWorkerPayload(result) },
            "health job başarılı",
          );
          return result;
        } catch (error) {
          await finishJobRun({
            id: jobRunId,
            succeeded: false,
            attempt,
            maxAttempts,
            error,
          });
          const reason =
            error instanceof Error
              ? maskWorkerString(error.message)
              : "Bilinmeyen hata";
          childLogger.error(
            {
              errorName: error instanceof Error ? error.name : "UnknownError",
              failedReason: reason,
            },
            "health job başarısız",
          );
          // BullMQ'nun retry mekanizması için hatayı yeniden fırlat.
          throw error;
        }
      },
      {
        connection: getRedisConnection(),
        concurrency: WORKER_OPTIONS.concurrency,
        lockDuration: WORKER_OPTIONS.lockDuration,
      },
    );

    worker.on("ready", () => {
      logger.info({ queue: HEALTH_QUEUE_NAME }, "health worker hazır");
    });
    worker.on("failed", (job, error) => {
      logger.error(
        {
          jobId: job?.id,
          queue: HEALTH_QUEUE_NAME,
          attempts: job?.attemptsMade,
          failedReason: job?.failedReason
            ? maskWorkerString(job.failedReason)
            : undefined,
          errorName: error instanceof Error ? error.name : "UnknownError",
        },
        "health job kalıcı olarak başarısız",
      );
    });
    worker.on("error", (error) => {
      logger.error(
        {
          errorName: error instanceof Error ? error.name : "UnknownError",
          queue: HEALTH_QUEUE_NAME,
        },
        "worker runtime hatası",
      );
    });
  }
  return worker;
}

/**
 * Worker'ı kapat. Graceful shutdown sırasında çağrılır.
 */
export async function closeHealthWorker(): Promise<void> {
  if (worker === null) {
    return;
  }
  try {
    await worker.close();
  } finally {
    worker = null;
  }
}
