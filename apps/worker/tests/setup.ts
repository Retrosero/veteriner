/**
 * @file Worker test ortamı kurulumu.
 * @module @vetniva/worker/tests/setup
 *
 * @description Test koşmadan önce zorunlu ortam değişkenlerini
 * sağlar. `loadEnv` Zod şeması Redis ve runtime PostgreSQL URL'si istediği
 * için test ortamında yalnız bağlantı kurulmadan kullanılan placeholder
 * değerler atanır.
 *
 * Not: Gerçek Redis bağlantısı sadece integration test'lerde
 * yapılır; unit test'lerde logger + env doğrulaması yeterlidir.
 *
 * @since GOAL-118 (FAZ-11) pilot temizliği — test çalıştırma düzeltmesi
 */

process.env["NODE_ENV"] = "test";
process.env["REDIS_URL"] = process.env["REDIS_URL"] ?? "redis://localhost:6379";
process.env["DATABASE_URL"] = process.env["DATABASE_URL"] ?? "postgresql://vetniva_app:vetniva_app@localhost:5432/vetniva?schema=public";
process.env["LOG_LEVEL"] = process.env["LOG_LEVEL"] ?? "silent";
process.env["APP_VERSION"] = process.env["APP_VERSION"] ?? "0.0.0-test";
