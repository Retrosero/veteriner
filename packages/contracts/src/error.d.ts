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
export declare const errorCodeSchema: z.ZodString;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
/**
 * Hata kaynağı. Frontend hataları için istemci, backend için sunucu.
 */
export declare const errorSourceSchema: z.ZodEnum<
  ["client", "server", "integration", "unknown"]
>;
export type ErrorSource = z.infer<typeof errorSourceSchema>;
/**
 * Hata ciddiyet seviyesi.
 */
export declare const errorSeveritySchema: z.ZodEnum<
  ["info", "warning", "error", "critical"]
>;
export type ErrorSeverity = z.infer<typeof errorSeveritySchema>;
/**
 * Standart hata gövdesi. Tüm API hata response'ları bu şema ile döner.
 */
export declare const errorResponseSchema: z.ZodObject<
  {
    error_code: z.ZodString;
    message: z.ZodString;
    source: z.ZodEnum<["client", "server", "integration", "unknown"]>;
    severity: z.ZodEnum<["info", "warning", "error", "critical"]>;
    correlation_id: z.ZodString;
    timestamp: z.ZodString;
    details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    /**
     * i18n anahtarı (varsa). Frontend bu anahtarı kullanıcıya göstereceği
     * mesaj için kullanır; backend'den dönen `message` log için saklanır.
     */
    i18n_key: z.ZodOptional<z.ZodString>;
  },
  "strip",
  z.ZodTypeAny,
  {
    message: string;
    timestamp: string;
    error_code: string;
    source: "unknown" | "client" | "server" | "integration";
    severity: "info" | "warning" | "error" | "critical";
    correlation_id: string;
    details?: Record<string, unknown> | undefined;
    i18n_key?: string | undefined;
  },
  {
    message: string;
    timestamp: string;
    error_code: string;
    source: "unknown" | "client" | "server" | "integration";
    severity: "info" | "warning" | "error" | "critical";
    correlation_id: string;
    details?: Record<string, unknown> | undefined;
    i18n_key?: string | undefined;
  }
>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
//# sourceMappingURL=error.d.ts.map
