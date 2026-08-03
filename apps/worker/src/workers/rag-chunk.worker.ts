/**
 * @file RAG chunk worker tanımı.
 * @module @vetniva/worker/workers/rag-chunk
 *
 * @description BullMQ `Worker` örneği: `rag-chunk` queue'sunu dinler,
 * her job için `processRagChunkJob` processor'ını çalıştırır.
 * Concurrency 1'dir (dosya sistemi erişimi sıralı olmalı); lock
 * duration 5 dakikadır (büyük docs seti için yeterli).
 *
 * @security Hatalar `failed` event'i ile loglanır; `failedReason`
 * içinde PII bulunmaz. Job tekrarı (retry) BullMQ backoff
 * ayarları ile kontrol edilir; 3 deneme sonrası job `failed`
 * state'e düşer.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk production pipeline
 */

import { Worker, type Job } from "bullmq";

import {
  processRagChunkJob,
  type RagChunkJobPayload,
} from "../jobs/rag-chunk-job.js";
import { logger } from "../logger.js";
import { getRedisConnection } from "../queues/connection.js";
import { RAG_CHUNK_QUEUE_NAME } from "../queues/rag-chunk.queue.js";
import { finishJobRun, startJobRun } from "../observability/job-run-reporter.js";

/**
 * Worker seçenekleri. Concurrency 1: docs dosya sistemi aynı
 * anda birden fazla process tarafından yazılırsa race condition
 * oluşabilir. Lock duration 5 dakika büyük döküman setlerinde
 * (10K+ chunk) pipeline'ın tamamlanması için yeterlidir.
 */
const WORKER_OPTIONS = {
  concurrency: 1,
  lockDuration: 300_000,
} as const;

let worker: Worker | null = null;

/**
 * Paylaşılan worker örneğini al. İlk çağrıda oluşturulur; event
 * handler'lar burada bağlanır.
 */
export function getRagChunkWorker(): Worker {
  if (worker === null) {
    worker = new Worker<RagChunkJobPayload>(
      RAG_CHUNK_QUEUE_NAME,
      async (job: Job<RagChunkJobPayload>) => {
        const correlationId = job.id ?? `unknown-${Date.now()}`;
        const attempt = job.attemptsMade + 1;
        const maxAttempts = job.opts.attempts ?? 1;
        const jobRunId = await startJobRun({
          queueName: RAG_CHUNK_QUEUE_NAME,
          jobName: job.name,
          jobKey: correlationId,
          attempt,
          maxAttempts,
          input: job.data,
        });
        const childLogger = logger.child({
          module: "worker",
          action: "rag-chunk-worker",
          jobId: correlationId,
          correlationId,
        });
        childLogger.info(
          { attempt, source: job.data.source },
          "rag-chunk job işleniyor",
        );
        try {
          const result = await processRagChunkJob(job.data);
          await finishJobRun({
            id: jobRunId,
            succeeded: true,
            attempt,
            maxAttempts,
            output: result as unknown as Record<string, unknown>,
          });
          childLogger.info(
            {
              total: result.total,
              added: result.added,
              skipped: result.skipped,
              duration_ms: result.duration_ms,
            },
            "rag-chunk job başarılı",
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
            error instanceof Error ? error.message : "Bilinmeyen hata";
          childLogger.error(
            { err: error, failedReason: reason },
            "rag-chunk job başarısız",
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
      logger.info(
        { queue: RAG_CHUNK_QUEUE_NAME },
        "rag-chunk worker hazır",
      );
    });
    worker.on("failed", (job, error) => {
      logger.error(
        {
          jobId: job?.id,
          queue: RAG_CHUNK_QUEUE_NAME,
          attempts: job?.attemptsMade,
          failedReason: job?.failedReason,
          err: error,
        },
        "rag-chunk job kalıcı olarak başarısız",
      );
    });
    worker.on("error", (error) => {
      logger.error(
        { err: error, queue: RAG_CHUNK_QUEUE_NAME },
        "worker runtime hatası",
      );
    });
  }
  return worker;
}

/**
 * Worker'ı kapat. Graceful shutdown sırasında çağrılır.
 */
export async function closeRagChunkWorker(): Promise<void> {
  if (worker === null) {
    return;
  }
  try {
    await worker.close();
  } finally {
    worker = null;
  }
}
