/**
 * @file Worker pino logger singleton'ı.
 * @module @vetniva/worker/logger
 *
 * @description Tüm worker modülleri tarafından paylaşılan tek
 * logger örneği. JSON loglar üretir; geliştirme ortamında
 * `pino-pretty` ile renkli/satır-bazlı çıktı sağlar.
 *
 * @security Logger'a `requestId`, `correlationId`, `module`,
 * `action` alanları child binding ile eklenir. Klinik içerik,
 * parola veya PII asla loglanmaz — bu kural zorunludur.
 */

import { pino, type Logger, type LoggerOptions } from "pino";

import { loadEnv } from "./env.js";

/**
 * `pino` seçenekleri. Seviye env'den, format ortamdan türetilir.
 * `base` alanı gereksiz `pid`/`hostname` üretmesin diye sıfırlanır
 * (konteyner ortamında zaten dışarıdan enjekte edilir).
 */
function buildOptions(): LoggerOptions {
  const env = loadEnv();
  const isDev = env.NODE_ENV === "development";
  return {
    level: env.LOG_LEVEL,
    base: {
      app: "vetniva-worker",
      version: env.APP_VERSION,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    ...(isDev
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:HH:MM:ss.l",
              ignore: "pid,hostname,app,version",
            },
          },
        }
      : {}),
  };
}

/**
 * Singleton logger. `pino()` her çağrıldığında yeni transport
 * bağlantısı açılır; bu yüzden uygulama boyunca tek örnek
 * paylaşılır.
 */
export const logger: Logger = pino(buildOptions());

/**
 * Test ortamı için sessiz logger üretir. CI ve unit testlerde
 * `console.log` çıktısı kirletmesin diye kullanılır.
 */
export function buildSilentLogger(): Logger {
  return pino({ level: "silent" });
}
