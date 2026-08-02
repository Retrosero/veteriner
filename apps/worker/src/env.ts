/**
 * @file Worker ortam değişkeni doğrulama modülü.
 * @module @vetniva/worker/env
 *
 * @description Süreç başlamadan önce Zod ile ortam değişkenlerini
 * doğrular. Hatalı yapılandırma durumunda süreç başlamaz; bu
 * sayede BullMQ'ya yanlış bağlantı bilgisi ile bağlanma riski
 * ortadan kalkar.
 *
 * @security Secret değerler (REDIS_URL içindeki parola dahil) bu
 * modülden geçer; loglanmaz. Sadece varlığı doğrulanır.
 */

import { z } from "zod";

/**
 * Zod şeması: zorunlu ve opsiyonel alanlar, format doğrulaması.
 * - `NODE_ENV`: standart üç değer.
 * - `REDIS_URL`: redis:// veya rediss:// şeması.
 * - `DATABASE_URL`: yalnız runtime uygulama rolüne ait PostgreSQL URL'si.
 * - `LOG_LEVEL`: pino'nun kabul ettiği seviyeler.
 * - `APP_VERSION`: semver benzeri string.
 * - `PORT_WORKER`: opsiyonel; ileride health endpoint için.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  REDIS_URL: z
    .string()
    .min(1, "REDIS_URL boş olamaz")
    .refine(
      (value) => value.startsWith("redis://") || value.startsWith("rediss://"),
      "REDIS_URL redis:// veya rediss:// şeması ile başlamalıdır",
    ),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL boş olamaz")
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL postgresql:// veya postgres:// şeması ile başlamalıdır",
    ),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  APP_VERSION: z.string().min(1, "APP_VERSION boş olamaz").default("0.0.0"),
  PORT_WORKER: z
    .string()
    .regex(/^\d{2,5}$/, "PORT_WORKER 2-5 haneli sayısal olmalıdır")
    .optional(),
});

/**
 * Doğrulanmış ortam değişkenleri. `parse()` Zod exception'ı
 * fırlatırsa çağıran taraf (main.ts) bunu yakalayıp pino ile
 * kritik hata loglar ve `process.exit(1)` yapar.
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Ortam değişkenlerini oku ve doğrula. Hata durumunda Zod
 * `ZodError` fırlatır; mesajlar konsola yazılabilir formatta
 * döner (fail-fast).
 *
 * @returns Doğrulanmış `Env` nesnesi.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(
        (issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`,
      )
      .join("\n");
    throw new Error(`Worker ortam değişkenleri geçersiz:\n${issues}`);
  }
  return parsed.data;
}
