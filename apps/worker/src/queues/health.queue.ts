/**
 * @file Health queue tanımı ve enqueue helper.
 * @module @vetniva/worker/queues/health
 *
 * @description BullMQ `Queue` örneği üzerinden health job'larını
 * yayınlar. `jobId` parametresi idempotency için kullanılır: aynı
 * jobId ile ikinci çağrı BullMQ tarafından "already exists" olarak
 * reddedilir; tekrar işlenmez. Bu davranış dış finansal/hafıza
 * etkisi olan job'lar için kritik öneme sahiptir.
 *
 * @security API süreci bu helper'ı çağırırken jobId olarak
 * genelde `requestId` veya `Idempotency-Key` header'ı kullanır;
 * böylece duplicate istekler Redis üzerinde tek job olarak
 * temsil edilir.
 */

import { Queue, type JobsOptions } from "bullmq";

import { logger } from "../logger.js";
import { getRedisConnection } from "./connection.js";

/**
 * Queue adı. Sabit string; magic string kullanımını önlemek için
 * tek noktada tanımlıdır.
 */
export const HEALTH_QUEUE_NAME = "health";

/**
 * Varsayılan job seçenekleri. Job'lar:
 * - 3 denemeye kadar çalışır (exponential backoff).
 * - Tamamlanmış 100 job tutulur (izleme için).
 * - Başarısız 500 job tutulur (analiz için).
 */
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 1_000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

let queue: Queue | null = null;

/**
 * Paylaşılan queue örneğini al. İlk çağrıda oluşturulur.
 */
export function getHealthQueue(): Queue {
  if (queue === null) {
    queue = new Queue(HEALTH_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queue.on("error", (error) => {
      logger.error({ err: error, queue: HEALTH_QUEUE_NAME }, "Queue hatası");
    });
  }
  return queue;
}

/**
 * Health job'unu kuyruğa ekle. `jobId` verildiğinde idempotent
 * çalışır; aynı jobId ile ikinci çağrı BullMQ tarafından
 * "already exists" exception'ı fırlatır.
 *
 * @param payload Job payload'ı (Zod ile doğrulanır).
 * @param options Ek BullMQ seçenekleri; jobId burada geçilir.
 * @returns Eklenen job'un BullMQ id'si.
 */
export async function enqueueHealth(
  payload: { check: "db" | "redis" | "all"; requestId: string },
  options: JobsOptions = {},
): Promise<string> {
  const q = getHealthQueue();
  const job = await q.add(HEALTH_QUEUE_NAME, payload, {
    ...DEFAULT_JOB_OPTIONS,
    ...options,
  });
  logger.info(
    { jobId: job.id, check: payload.check, requestId: payload.requestId },
    "health job kuyruğa eklendi",
  );
  return job.id ?? "";
}

/**
 * Queue'yu kapat. Graceful shutdown sırasında çağrılır.
 */
export async function closeHealthQueue(): Promise<void> {
  if (queue === null) {
    return;
  }
  try {
    await queue.close();
  } finally {
    queue = null;
  }
}
