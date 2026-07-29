/**
 * @file Hata sözleşmesi.
 * @module @vetniva/contracts/error
 *
 * @description VetNiva'nın standart hata formatı. Backend ve frontend aynı
 * şemayı kullanır. Hata kodu (error_code) sabit ve katalogdadır; gövde
 * içeriği asla klinik/finansal içerik taşımaz.
 *
 * @security `correlation_id` log izleme için zorunludur. `details` alanında
 * PII bulunmaz; sadece yapısal hata bilgisi (alan adı, hata tipi) bulunur.
 */

import { z } from "zod";

/**
 * Hata kodu. ISO 3166-1 alpha-2 ülke kodu + domain + sıra numarası.
 * Örnek: `TR_AUTH_0001`, `TR_CLINIC_0042`, `EN_CLINIC_0001`.
 * Katalog: docs/errors/ERROR_CATALOG.md.
 */
export const errorCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}_[A-Z]+_[0-9]{4,}$/, "Invalid error code format");
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/**
 * Hata kaynağı. Frontend hataları için istemci, backend için sunucu.
 */
export const errorSourceSchema = z.enum([
  "client",
  "server",
  "integration",
  "unknown",
]);
export type ErrorSource = z.infer<typeof errorSourceSchema>;

/**
 * Hata ciddiyet seviyesi.
 */
export const errorSeveritySchema = z.enum([
  "info",
  "warning",
  "error",
  "critical",
]);
export type ErrorSeverity = z.infer<typeof errorSeveritySchema>;

/**
 * Standart hata gövdesi. Tüm API hata response'ları bu şema ile döner.
 */
export const errorResponseSchema = z.object({
  error_code: errorCodeSchema,
  message: z.string().min(1),
  source: errorSourceSchema,
  severity: errorSeveritySchema,
  correlation_id: z.string().min(1),
  timestamp: z.string().datetime(),
  details: z.record(z.unknown()).optional(),
  /**
   * i18n anahtarı (varsa). Frontend bu anahtarı kullanıcıya göstereceği
   * mesaj için kullanır; backend'den dönen `message` log için saklanır.
   */
  i18n_key: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
