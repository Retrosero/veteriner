/**
 * @file Redis bağlantı (ioredis) singleton'ı.
 * @module @vetniva/worker/queues/connection
 *
 * @description BullMQ hem Queue (publisher) hem Worker (consumer)
 * için aynı `ConnectionOptions`'a ihtiyaç duyar. Bu modül tek bir
 * bağlantı örneği üretir; Queue ve Worker aynı bağlantıyı
 * paylaşır. Aynı Redis örneğine iki ayrı ioredis bağlantısı
 * açılması connection-quota sorunlarına yol açar.
 *
 * @security `maxRetriesPerRequest: null` BullMQ'nun bounded retry
 * davranışı için zorunludur. Aksi halde BullMQ kendi iç state
 * makinelerinde deadlock oluşur. Bu ayar güvenlik riski
 * oluşturmaz; yalnızca queue semantiğini doğru yansıtır.
 */

import { Redis, type RedisOptions } from "ioredis";

import { loadEnv } from "../env.js";

/**
 * BullMQ uyumlu Redis seçenekleri. `REDIS_URL` parse edilerek
 * `ioredis`'e geçirilir; ek seçenekler BullMQ best-practice'lerine
 * göre sabitlenir.
 */
function buildOptions(): RedisOptions {
  const env = loadEnv();
  return {
    // BullMQ: blocked bağlantılarda bounded-retry hatası fırlatmaz.
    maxRetriesPerRequest: null,
    // BullMQ: ready olmadan komut kuyruğa alınmaz; worker yanlış
    // durumda job çekmeye çalışmaz.
    enableReadyCheck: true,
    // Yeniden bağlanma stratejisi: üstel geri çekilme + jitter.
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5_000);
      return delay;
    },
    // İlk bağlantı zaman aşımı (ms). 10sn yeterli; production'da
    // healthcheck üzerinden retry yapılır.
    connectTimeout: 10_000,
    // Bağlantı etiketi (debug için).
    connectionName: `vetniva-worker:${env.APP_VERSION}`,
  };
}

let connection: Redis | null = null;

/**
 * Paylaşılan Redis bağlantısını al. İlk çağrıda bağlantı kurulur;
 * sonraki çağrılar aynı örneği döner.
 *
 * @returns Aktif `ioredis` bağlantısı.
 */
export function getRedisConnection(): Redis {
  if (connection === null) {
    const env = loadEnv();
    connection = new Redis(env.REDIS_URL, buildOptions());
  }
  return connection;
}

/**
 * Bağlantıyı kapat. Graceful shutdown sırasında çağrılır; birden
 * fazla kez çağrılırsa no-op.
 */
export async function closeRedisConnection(): Promise<void> {
  if (connection === null) {
    return;
  }
  try {
    await connection.quit();
  } finally {
    connection = null;
  }
}

/**
 * Test amaçlı: connection'ı dışarıdan enjekte etmek için.
 * Production kodundan çağrılmamalıdır.
 */
export function setRedisConnectionForTesting(instance: Redis | null): void {
  connection = instance;
}
