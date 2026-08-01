/**
 * @file Ortam değişkeni doğrulama modülü.
 * @module apps/api/env
 * @description API'nin çalışması için gerekli ortam değişkenlerini Zod
 * ile doğrular. Yanlış veya eksik değerlerde uygulama başlamaz.
 * Zorunlu değişkenler: `NODE_ENV`, `APP_VERSION`, `DATABASE_URL`,
 * `LOG_LEVEL`. Opsiyonel: port, redis, locale, vb.
 * Güvenlik: Secret değerler bu modülde loglanmaz; yalnızca anahtarlar ve
 * varlık kontrolü yapılır. PII taşıyan env değişkenleri desteklenmez.
 */

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  APP_VERSION: z.string().min(1).default("0.0.0"),
  APP_NAME: z.string().default("vetniva-api"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .default("info"),
  PORT_API: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_BASE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL zorunlu"),
  DATABASE_SHADOW_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  DEFAULT_LOCALE: z.enum(["tr-TR", "en-GB"]).default("tr-TR"),
  SUPPORTED_LOCALES: z.string().default("tr-TR,en-GB"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Ortam değişkenlerini doğrular ve aynı süreçte sonucu önbelleğe alır.
 * @param {object} source Doğrulanacak ortam değişkenleri.
 * @returns {Env} Doğrulanmış uygulama yapılandırması.
 */
export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Ortam değişkeni doğrulaması başarısız:\n${issues}`);
  }
  cached = result.data;
  return cached;
}
