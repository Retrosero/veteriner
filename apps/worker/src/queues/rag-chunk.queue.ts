/**
 * @file RAG chunk queue tanımı ve enqueue helper.
 * @module @vetniva/worker/queues/rag-chunk
 *
 * @description BullMQ `Queue` örneği üzerinden RAG chunk production
 * job'larını yayınlar. `jobId` parametresi idempotency için
 * kullanılır; aynı jobId ile ikinci çağrı BullMQ tarafından
 * "already exists" olarak reddedilir.
 *
 * @security API süreci bu helper'ı çağırırken jobId olarak genelde
 * `requestId` veya `Idempotency-Key` header'ı kullanır; böylece
 * duplicate istekler Redis üzerinde tek job olarak temsil edilir.
 * RAG chunk üretimi periyodik scheduler tarafından tetiklendiğinde
 * jobId olarak `cron:<timestamp>` kullanılır; aynı dakika içinde
 * ikinci bir cron tetiklense tek job oluşur.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk production pipeline
 */

import { Queue, type JobsOptions } from "bullmq";

import { logger } from "../logger.js";
import { getRedisConnection } from "./connection.js";

/**
 * Queue adı. Sabit string; magic string kullanımını önlemek için
 * tek noktada tanımlıdır.
 */
export const RAG_CHUNK_QUEUE_NAME = "rag-chunk";

/**
 * Cron schedule (standard cron format). Her 6 saatte bir çalışır.
 * Üretimde orchestration ihtiyacına göre env değişkeni ile override
 * edilebilir; bu değişiklik `RAG_CHUNK_CRON_SCHEDULE` constant'ı
 * yerine scheduler registration sırasında yapılmalıdır.
 */
export const RAG_CHUNK_CRON_SCHEDULE = "0 */6 * * *";

/**
 * Varsayılan job seçenekleri. Job'lar:
 * - 3 denemeye kadar çalışır (exponential backoff).
 * - Tamamlanmış 50 job tutulur (izleme için).
 * - Başarısız 200 job tutulur (analiz için).
 */
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5_000,
  },
  removeOnComplete: 50,
  removeOnFail: 200,
};

let queue: Queue | null = null;

/**
 * Paylaşılan queue örneğini al. İlk çağrıda oluşturulur.
 */
export function getRagChunkQueue(): Queue {
  if (queue === null) {
    queue = new Queue(RAG_CHUNK_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queue.on("error", (error) => {
      logger.error(
        { err: error, queue: RAG_CHUNK_QUEUE_NAME },
        "Queue hatası",
      );
    });
  }
  return queue;
}

/**
 * RAG chunk job'unu kuyruğa ekle. `jobId` verildiğinde idempotent
 * çalışır; aynı jobId ile ikinci çağrı BullMQ tarafından
 * "already exists" exception'ı fırlatır.
 *
 * @param payload Job payload'ı (Zod ile doğrulanır).
 * @param options Ek BullMQ seçenekleri; jobId burada geçilir.
 * @returns Eklenen job'un BullMQ id'si.
 */
export async function enqueueRagChunk(
  payload: {
    source: string;
    output: string;
    defaultLocale: "tr-TR" | "en-GB";
    requestId: string;
  },
  options: JobsOptions = {},
): Promise<string> {
  const q = getRagChunkQueue();
  const job = await q.add(RAG_CHUNK_QUEUE_NAME, payload, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
  });
  logger.info(
    {
      jobId: job.id,
      source: payload.source,
      requestId: payload.requestId,
    },
    "rag-chunk job kuyruğa eklendi",
  );
  return job.id ?? "";
}

/**
 * Queue'yu kapat. Graceful shutdown sırasında çağrılır.
 */
export async function closeRagChunkQueue(): Promise<void> {
  if (queue === null) {
    return;
  }
  try {
    await queue.close();
  } finally {
    queue = null;
  }
}
