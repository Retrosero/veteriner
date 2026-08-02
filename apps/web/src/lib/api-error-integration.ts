/**
 * @file API client hata entegrasyonu.
 * @module @vetniva/web/lib/api-error-integration
 * @description GOAL-101 (FAZ-10) frontend hata yakalama — API
 * istemcisinin döndürdüğü `ApiFailure` sonuçlarını otomatik olarak
 * `errorReporter`'a yönlendirir.
 *
 * - `wrapApiRequest` mevcut `apiRequest` çağrısını sarar; başarısız
 *   sonuçları severity'e göre raporlar (5xx → error, 4xx → warning).
 * - `reportApiFailure` doğrudan bir `ApiFailure` alıp raporlar
 *   (örn. kendi fetch sarmalayıcıları için).
 *
 * Tüm metotlar no-throw; hata raporlama sırasında oluşan sorun
 * kullanıcı deneyimini engellemez.
 * @security API'den dönen hata response'u zaten mask'lıdır (PII
 *   içermez). Reporter context'e `route + errorCode + statusCode`
 *   ekler; backend de ek bir PII masker'ından geçirir.
 *
 * @since GOAL-101 (FAZ-10) frontend hata yakalama core
 */

import { errorReporter, type ErrorSeverity } from "./error-reporter";

import type { ApiFailure, ApiResult } from "./api-client";

/* --------------------------------------------------------------------------
 * Severity mapping
 * --------------------------------------------------------------------------
 */

/**
 * API hata kodundan severity tahmin eder. 5xx → error, 4xx → warning,
 * network/abort → warning. 401/403 gibi auth hataları warning; 5xx
 * sunucu hataları error.
 * @param failure
 */
export function severityForApiFailure(failure: ApiFailure): ErrorSeverity {
  const code = failure.error.error_code;
  // Bilinen ağ hata kodu her zaman warning.
  if (code === "VET-COMMON-0001") return "warning";
  // 5xx (status code mesaj içinde) → error; 4xx → warning.
  if (/5\d\d/.test(failure.error.message)) return "error";
  // error_code "VET-AUTHZ-*" veya "TR_AUTH_*" genelde 403/401.
  if (code.startsWith("VET-AUTHZ") || code.startsWith("TR_AUTH")) {
    return "warning";
  }
  return "warning";
}

/* --------------------------------------------------------------------------
 * reportApiFailure
 * --------------------------------------------------------------------------
 */

/**
 * Tek bir `ApiFailure`'ı reporter'a gönderir. `requestId` varsa
 * merkezi hata kaydına `X-Request-Id` header'ı ile aktarılır; context'te de
 * tanısal görünürlük için tutulur.
 * @param failure
 */
export function reportApiFailure(failure: ApiFailure): void {
  if (!failure) return;
  try {
    const severity = severityForApiFailure(failure);
    errorReporter.captureMessage(
      `API hata: ${failure.error.error_code} — ${failure.error.message}`,
      severity,
      {
        errorCode: failure.error.error_code,
        severity_backend: failure.error.severity,
        correlationId: failure.requestId,
        source: failure.error.source,
      },
      failure.requestId,
    );
  } catch {
    // sessiz
  }
}

/* --------------------------------------------------------------------------
 * wrapApiRequest
 * --------------------------------------------------------------------------
 */

/**
 * `apiRequest` çağrısını sarar. Sonuç hata ise otomatik olarak
 * raporlar; aksi halde sonucu aynen döner. Orijinal `apiRequest`
 * fonksiyonu parametre olarak alınır; bu sayede test'lerde mock
 * ile değiştirilebilir.
 * @param caller
 */
export async function wrapApiRequest<T>(
  caller: () => Promise<ApiResult<T>>,
): Promise<ApiResult<T>> {
  const result = await caller();
  if (!result.ok) {
    reportApiFailure(result);
  }
  return result;
}
