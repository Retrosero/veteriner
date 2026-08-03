/**
 * @file RAG chunk uretimi periyodik scheduler.
 * @module @vetniva/worker/scheduler/rag-chunk
 *
 * @description `rag-chunk` queue'sunu periyodik olarak tetikler.
 * BullMQ `Queue.add()` ile her periyotta bir job eklenir;
 * worker tarafi otomatik olarak alir ve isler.
 *
 * Uretim davranisi:
 * - Her 6 saatte bir (cron formati 6-saatlik aralikla) `docs/workflows` +
 *   `docs/pages` + `docs/errors` + `docs/permissions` + `docs/fields`
 *   + `docs/user-education` + `docs/domain` dizinlerini sirayla
 *   taramasi icin birer job eklenir.
 * - Scheduler job eklerken jobId = `cron:<source>:<timestamp-hour>`
 *   formati kullanir; ayni saat dilimi icinde ikinci bir tetik
 *   BullMQ tarafindan reddedilir (idempotency).
 *
 * @security Scheduler yalnizca system context'te job uretir;
 * tenant filtresi gerekmez (uretim tum dokumanlari kapsar).
 * PII tasimaz.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk production pipeline
 */

import { logger } from "../logger.js";
import {
  enqueueRagChunk,
  RAG_CHUNK_CRON_SCHEDULE,
} from "../queues/rag-chunk.queue.js";

/**
 * Scheduler tarafindan taranacak kaynak dizinler. Her biri icin
 * ayri bir job uretilir; uretim source'lari genisletilebilir.
 * `defaultLocale: "tr-TR"` — Faz 12+ ile cift dilli uretim.
 */
const SCHEDULED_SOURCES: ReadonlyArray<{
  source: string;
  output: string;
}> = [
  { source: "docs/workflows", output: "docs/ai/AI_CHUNKS.yaml" },
  { source: "docs/pages", output: "docs/ai/AI_CHUNKS.yaml" },
  { source: "docs/errors", output: "docs/ai/AI_CHUNKS.yaml" },
  { source: "docs/permissions", output: "docs/ai/AI_CHUNKS.yaml" },
  { source: "docs/fields", output: "docs/ai/AI_CHUNKS.yaml" },
  { source: "docs/user-education", output: "docs/ai/AI_CHUNKS.yaml" },
  { source: "docs/domain", output: "docs/ai/AI_CHUNKS.yaml" },
];

/**
 * Mevcut saatin bucket anahtari (UTC). Ayni saat icinde birden
 * fazla scheduler tick'i olursa jobId cakismasi ile idempotent
 * davranis saglanir.
 */
function hourBucket(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}`;
}

/**
 * Scheduler tick'ini calistirir. Tum `SCHEDULED_SOURCES` icin
 * idempotent job ekler. Hata durumunda loglar ve devam eder;
 * bir job'un eklenememesi digerlerini engellemez.
 *
 * Bu fonksiyon iki sekilde cagrilabilir:
 * 1) `setInterval` ile periyodik (cron yerine lightweight).
 * 2) `node-cron` veya benzeri ile cron expression tabanli.
 *
 * GOAL-116 kapsaminda interval-based yaklasim benimsenmistir;
 * worker process tek bir scheduler instance calistirir. Uretim
 * ortaminda ise orchestrator (Kubernetes CronJob) tercih edilir.
 */
export async function runRagChunkSchedulerTick(
  now: Date = new Date(),
): Promise<{
  enqueued: number;
  skipped: number;
  errors: number;
}> {
  const bucket = hourBucket(now);
  let enqueued = 0;
  let skipped = 0;
  let errors = 0;

  for (const entry of SCHEDULED_SOURCES) {
    const jobId = `cron:${entry.source}:${bucket}`;
    try {
      await enqueueRagChunk(
        {
          source: entry.source,
          output: entry.output,
          defaultLocale: "tr-TR",
          requestId: `cron-${bucket}-${entry.source.replace(/[^\w-]+/g, "_")}`,
        },
        { jobId },
      );
      enqueued += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bilinmeyen hata";
      // Ayni jobId mevcutsa BullMQ "already exists" firlatir; bu
      // beklenen bir durumdur ve hata olarak sayilmaz.
      if (/already exists/i.test(message)) {
        skipped += 1;
        logger.debug(
          { source: entry.source, jobId },
          "rag-chunk job idempotent skip",
        );
      } else {
        errors += 1;
        logger.error(
          { err, source: entry.source, jobId },
          "rag-chunk scheduler job eklenemedi",
        );
      }
    }
  }

  logger.info(
    {
      enqueued,
      skipped,
      errors,
      cron: RAG_CHUNK_CRON_SCHEDULE,
      bucket,
    },
    "rag-chunk scheduler tick tamamlandi",
  );

  return { enqueued, skipped, errors };
}

/**
 * Periyodik scheduler'i baslatir. Worker process icinde cagrilir;
 * `setInterval` ile her 6 saatte bir tick tetiklenir.
 *
 * Uretim davranisi: `setInterval` yerine orchestrator-driven
 * (Kubernetes CronJob, AWS EventBridge vb.) tercih edilir; bu
 * fonksiyon hafif bir fallback'tir.
 */
export function startRagChunkScheduler(
  intervalMs: number = 6 * 60 * 60 * 1000,
): NodeJS.Timeout {
  const handle = setInterval(() => {
    void runRagChunkSchedulerTick().catch((err: unknown) => {
      logger.error(
        { err },
        "rag-chunk scheduler tick fatal hatasi",
      );
    });
  }, intervalMs);
  // Worker process tek scheduler instance calistirmali.
  if (typeof handle.unref === "function") {
    handle.unref();
  }
  logger.info(
    { intervalMs, cron: RAG_CHUNK_CRON_SCHEDULE },
    "rag-chunk scheduler baslatildi",
  );
  return handle;
}
