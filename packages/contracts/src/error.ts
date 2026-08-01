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
 *
 * @since GOAL-004 (FAZ-0) hata kodu standardı
 * @see docs/errors/ERROR_CODE_STANDARD.md
 */

import { z } from "zod";

/**
 * Hata kodu. Format: `VET-<MODULE>-<NNN>`.
 *
 * - `VET` — sabit prefix (VetNiva).
 * - `<MODULE>` — büyük harf, 2-12 karakter (COMMON, AUTH, CLINIC, ...).
 * - `<NNN>` — 4 haneli sıra numarası.
 *
 * Katalog: docs/errors/ERROR_CATALOG.md.
 * Eski `TR_<DOMAIN>_<NNN>` formatı 6 ay boyunca alias olarak desteklenir.
 */
export const errorCodeSchema = z
  .string()
  .regex(/^VET-[A-Z]{2,12}-[0-9]{4}$/, "Invalid VET error code format");
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/**
 * Eski hata kodu formatı. Migration boyunca desteklenir; yeni kodlar
 * `errorCodeSchema` ile yazılmalıdır.
 *
 * Eski formatlar:
 * - `TR_<DOMAIN>_<NNN>` (ülke + domain + sıra)
 * - `EN_<DOMAIN>_<NNN>` (ülke + domain + sıra)
 * - `TR_<DOMAIN>_<NAME>` (validation aliases)
 */
export const legacyErrorCodeSchema = z.string().regex(
  // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, segment sayısı doğrusal ve her parça karakter sınıfıyla sınırlı hata kodu doğrulamasıdır.
  /^(TR|EN)_[A-Z]+(_[A-Z]+)*_[0-9]{1,4}$/,
  "Invalid legacy error code format",
);
export type LegacyErrorCode = z.infer<typeof legacyErrorCodeSchema>;

/**
 * Tüm desteklenen hata kodu formatları. Yeni kodlar için
 * `errorCodeSchema` kullanılır.
 */
export const anyErrorCodeSchema = z.union([
  errorCodeSchema,
  legacyErrorCodeSchema,
]);
export type AnyErrorCode = z.infer<typeof anyErrorCodeSchema>;

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
 * HTTP durumundan severity çıkarımı.
 */
export function severityForStatus(status: number): ErrorSeverity {
  if (status >= 500) return "error";
  if (status >= 400) return "warning";
  return "info";
}

/**
 * Bilinen modül listesi. Yeni modül eklemek için
 * `docs/errors/ERROR_CODE_STANDARD.md`'i de güncelleyin.
 */
export const errorModules = [
  "COMMON",
  "VALIDATION",
  "AUTH",
  "AUTHZ",
  "TENANT",
  "BRANCH",
  "USER",
  "ROLE",
  "COUNTRY",
  "CLINIC",
  "APPT",
  "EXAM",
  "SOAP",
  "VACC",
  "PRESC",
  "SURG",
  "ANESTH",
  "HOSP",
  "LAB",
  "IMAG",
  "STOCK",
  "PETSHOP",
  "PRODUCT",
  "SALE",
  "PAYMENT",
  "CASH",
  "CONSENT",
  "KVKK",
  "REPORT",
  "AUDIT",
  "FILE",
  "NOTIF",
  "PORTAL",
  "INTEGRATION",
  "JOB",
  "WORKER",
  "PRICING",
] as const;
export type ErrorModule = (typeof errorModules)[number];

export const errorModuleSchema = z.enum(errorModules);

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
  /**
   * Yönlendirme önerisi (varsa). Örn: 401 → "/login".
   */
  action_url: z
    .string()
    .url()
    .or(z.string().regex(/^\/[A-Za-z0-9/_-]+$/))
    .optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
