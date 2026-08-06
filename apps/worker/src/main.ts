/**
 * @file Worker süreci giriş noktası.
 * @module @vetniva/worker/main
 *
 * @description VetNiva worker sürecinin ana modülü. Sırasıyla:
 * 1. dotenv ile `.env` yükler,
 * 2. `env.ts` ile ortam değişkenlerini Zod ile doğrular,
 * 3. Pino logger başlatır,
 * 4. Health queue + worker oluşturur,
 * 5. SIGTERM/SIGINT sinyallerinde graceful shutdown yapar.
 *
 * @security Süreç içinde hiçbir secret veya PII loglanmaz. Sinyal
 * yakalayıcıları Pino üzerinden bilgilendirici log yazıp
 * worker'ı temiz biçimde kapatır; SIGKILL gibi zorunlu
 * durumlar dışında Redis bağlantısı sızdırılmaz.
 */

import "dotenv/config";

import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { closeRedisConnection } from "./queues/connection.js";
import { closeHealthQueue, getHealthQueue } from "./queues/health.queue.js";
import { closeHealthWorker, getHealthWorker } from "./workers/health.worker.js";
import {
  closeRagChunkQueue,
  getRagChunkQueue,
} from "./queues/rag-chunk.queue.js";
import {
  closeRagChunkWorker,
  getRagChunkWorker,
} from "./workers/rag-chunk.worker.js";
import { closeJobRunReporter } from "./observability/job-run-reporter.js";
import { startRagChunkScheduler } from "./scheduler/rag-chunk-scheduler.js";

/**
 * Süreci başlat. Hata durumunda logla ve exit(1).
 */
async function bootstrap(): Promise<void> {
  // 1) Env doğrulama. Hata varsa burada exception fırlatılır.
  const env = loadEnv();
  logger.info(
    { nodeEnv: env.NODE_ENV, version: env.APP_VERSION, level: env.LOG_LEVEL },
    "worker süreci başlıyor",
  );

  // 2) Queue + Worker oluştur. Sıralama önemli: queue önce
  // hazır olmalı, çünkü worker aynı bağlantıyı paylaşır.
  const healthQueue = getHealthQueue();
  const healthWorker = getHealthWorker();
  void healthQueue;
  void healthWorker;

  // 3) RAG chunk worker (GOAL-116). Queue + worker oluşturulur;
  // aynı Redis bağlantısı paylaşılır.
  const ragQueue = getRagChunkQueue();
  const ragWorker = getRagChunkWorker();
  void ragQueue;
  void ragWorker;

  // 4) RAG chunk scheduler (GOAL-116). Üretim davranışı: her
  // 6 saatte bir docs/* dizinlerini tarayıp AI_CHUNKS.yaml'ı
  // günceller. Orchestrator (Kubernetes CronJob) tercih edilir;
  // bu scheduler process-içi fallback'tir.
  if (env.NODE_ENV === "production") {
    startRagChunkScheduler();
  }

  logger.info("worker süreci hazır: sinyaller dinleniyor");
}

/**
 * Graceful shutdown: worker'ı durdur, queue'yu kapat, Redis
 * bağlantısını kapat. Her adım en iyi çaba ile çalışır; hata
 * olursa logla ama diğer adımları atla.
 */
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.warn({ signal }, "graceful shutdown başladı");
  try {
    await closeHealthWorker();
  } catch (error) {
    logger.error(
      { err: error, step: "closeHealthWorker" },
      "worker kapatılamadı",
    );
  }
  try {
    await closeRagChunkWorker();
  } catch (error) {
    logger.error(
      { err: error, step: "closeRagChunkWorker" },
      "rag-chunk worker kapatılamadı",
    );
  }
  try {
    await closeHealthQueue();
  } catch (error) {
    logger.error(
      { err: error, step: "closeHealthQueue" },
      "queue kapatılamadı",
    );
  }
  try {
    await closeRagChunkQueue();
  } catch (error) {
    logger.error(
      { err: error, step: "closeRagChunkQueue" },
      "rag-chunk queue kapatılamadı",
    );
  }
  try {
    await closeRedisConnection();
  } catch (error) {
    logger.error(
      { err: error, step: "closeRedisConnection" },
      "redis bağlantısı kapatılamadı",
    );
  }
  try {
    await closeJobRunReporter();
  } catch (error) {
    logger.error(
      { err: error, step: "closeJobRunReporter" },
      "JobRun PostgreSQL bağlantısı kapatılamadı",
    );
  }
  logger.info("graceful shutdown tamamlandı");
  // process.exit burada no-op olabilir; event loop'ta başka handle
  // kalmadığı için Node doğal olarak çıkar. Yine de açıkça
  // çağırmak orchestration için daha güvenilir.
  process.exit(0);
}

/**
 * Unhandled rejection ve uncaught exception yakalayıcıları.
 * Üretimde bu hatalar kritik kabul edilir; loglanır ve süreç
 * 1 kodu ile kapatılır (orchestrator restart eder).
 */
function registerProcessSafetyHooks(): void {
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "unhandledRejection");
  });
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "uncaughtException");
    process.exit(1);
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

registerProcessSafetyHooks();

bootstrap().catch((error: unknown) => {
  // Env doğrulama hatası burada yakalanır. Logger henüz bağlı
  // olmayabilir; bu yüzden hem logger hem stderr kullanılır.
  console.error("worker bootstrap başarısız:", error);
  process.exit(1);
});
