/**
 * @file API istemcisi (fetch wrapper).
 * @module @vetniva/web/lib/api-client
 * @description Sunucu tarafında API çağrılarını standart hale getiren
 * ince sarmalayıcı. Her istek:
 *   - `X-Request-Id` başlığı taşır (yoksa UUID üretir),
 *   - 5 saniye timeout uygular,
 *   - hata response'larını `@vetniva/contracts` `errorResponseSchema`
 *     ile doğrular,
 *   - network hatalarını sabit kodlu `VET-COMMON-0001` `ErrorResponse`'a
 *     dönüştürür.
 * @security Hassas içerik taşıyan isteklerde `X-Request-Id` ile
 * correlation sağlanır; bu sayede backend logları frontend logları
 * ile eşleştirilebilir. PII (TC kimlik, telefon vb.) bu fonksiyondan
 * geçirilirken masked/log kurallarına dikkat edilmelidir.
 */

import { errorResponseSchema, type ErrorResponse } from "@vetniva/contracts";

/** API taban URL'i. NEXT_PUBLIC öneki olmadan yalnızca server tarafında okunur. */
const API_BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:3001";

/** İstek zaman aşımı (ms). */
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * Ağ hataları için sabit hata kodu. Kullanıcıya gösterilecek mesaj
 * i18n kataloğundan çözümlenir; koda dayalı karar destek sisteminde
 * alınır.
 */
const NETWORK_ERROR_CODE = "VET-COMMON-0001";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  status: number;
  requestId: string | null;
};

export type ApiFailure = {
  ok: false;
  error: ErrorResponse;
  requestId: string | null;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

/**
 * Yeni bir request ID üretir. Crypto.randomUUID() modern ortamlarda
 * mevcuttur; fallback olarak Math.random tabanlı ID kullanılır.
 */
function generateRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Standart hata response üretir. Network hatası veya parse hatası
 * durumlarında bu fonksiyon çağrılır; hata kodu sabit kalır.
 * @param message
 * @param requestId
 */
function buildNetworkError(
  message: string,
  requestId: string | null,
): ErrorResponse {
  return {
    error_code: NETWORK_ERROR_CODE,
    message,
    source: "unknown",
    severity: "error",
    correlation_id: requestId ?? generateRequestId(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * API'ye JSON isteği gönderir. Body opsiyoneldir; verilirse JSON
 * olarak serialize edilir. Response her zaman iki koldan birine düşer:
 * başarı (T döner) veya hata (ErrorResponse döner). Hiçbir koşulda
 * throw etmez.
 * @param path
 * @param init
 */
export async function apiRequest<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<ApiResult<T>> {
  const requestId = init.headers ? extractRequestId(init.headers) : null;
  const finalRequestId = requestId ?? generateRequestId();

  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  const headers = new Headers(init.headers);
  headers.set("X-Request-Id", finalRequestId);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      body: init.body === undefined ? null : JSON.stringify(init.body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutHandle);
    const isAbort = err instanceof Error && err.name === "AbortError";
    const message = isAbort
      ? "API isteği zaman aşımına uğradı"
      : "API bağlantısı kurulamadı";
    // Network/abort hataları konsola yazılmaz; merkezi hata sistemi
    // henüz kurulmadığı için burada sadece bilinçli olarak sessiz bırakılır.
    return {
      ok: false,
      error: buildNetworkError(message, finalRequestId),
      requestId: finalRequestId,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }

  const headerRequestId = response.headers.get("x-request-id");

  if (!response.ok) {
    const parsedError = await safeParseError(response);
    return {
      ok: false,
      error:
        parsedError ??
        buildNetworkError(`HTTP ${response.status}`, finalRequestId),
      requestId: headerRequestId,
    };
  }

  try {
    const json = (await response.json()) as unknown;
    return {
      ok: true,
      data: json as T,
      status: response.status,
      requestId: headerRequestId,
    };
  } catch {
    return {
      ok: false,
      error: buildNetworkError(
        "Yanıt JSON olarak çözümlenemedi",
        finalRequestId,
      ),
      requestId: headerRequestId,
    };
  }
}

/**
 * Hatalı response gövdesini `ErrorResponse` şeması ile doğrular.
 * Şemayla eşleşmezse (ör. Backend yanlış formatta döndüyse) null
 * döner; çağıran taraf network hatasına düşer.
 * @param response
 */
async function safeParseError(
  response: Response,
): Promise<ErrorResponse | null> {
  try {
    const body = (await response.json()) as unknown;
    const parsed = errorResponseSchema.safeParse(body);
    if (parsed.success) {
      // Backend'den gelen correlation_id üzerine yazılmaz; frontend
      // burada yalnızca response header'ına güvenir.
      return parsed.data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * İlk çağrıda gelen headers içinden (varsa) X-Request-Id başlığını
 * çıkarır. Aynı ID upstream ve downstream'de taşınır; bu sayede
 * server logları frontend logları ile eşleşir.
 * @param headers
 */
function extractRequestId(headers: HeadersInit): string | null {
  if (headers instanceof Headers) {
    return headers.get("x-request-id");
  }
  if (Array.isArray(headers)) {
    const entry = headers.find(([key]) => key.toLowerCase() === "x-request-id");
    return entry?.[1] ?? null;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "x-request-id" && typeof value === "string") {
      return value;
    }
  }
  return null;
}

export const apiClient = {
  baseUrl: API_BASE_URL,
  request: apiRequest,
};
