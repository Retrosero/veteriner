/**
 * @file Worker test ortamı kurulumu.
 * @module @vetniva/worker/tests/setup
 *
 * @description Test koşmadan önce zorunlu ortam değişkenlerini
 * sağlar. `loadEnv` Zod şeması `REDIS_URL` istediği için test
 * ortamında placeholder değer atanır.
 *
 * Not: Gerçek Redis bağlantısı sadece integration test'lerde
 * yapılır; unit test'lerde logger + env doğrulaması yeterlidir.
 *
 * @since GOAL-118 (FAZ-11) pilot temizliği — test çalıştırma düzeltmesi
 */

process.env["NODE_ENV"] = "test";
process.env["REDIS_URL"] = process.env["REDIS_URL"] ?? "redis://localhost:6379";
process.env["LOG_LEVEL"] = process.env["LOG_LEVEL"] ?? "silent";
process.env["APP_VERSION"] = process.env["APP_VERSION"] ?? "0.0.0-test";
