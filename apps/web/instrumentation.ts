/**
 * @file Next.js instrumentation hook.
 * @module apps/web/instrumentation
 *
 * @description GOAL-101 (FAZ-10) global hata yakalama. Next.js 14
 * `instrumentation.ts` dosyası; uygulama başlatılırken bir kez
 * `register()` çağrılır (server + client runtime'larında).
 *
 * İş kuralları:
 * - **Client runtime (`window` mevcut)**: `window.onerror` ve
 *   `unhandledrejection` global hook'larını bağla; her yakalanan
 *   hata `errorReporter.captureError`'a yönlendirilir.
 * - **Server runtime**: `process.on('uncaughtException')` ve
 *   `process.on('unhandledRejection')` bağlanır; server-side
 *   render hataları da capture edilir (Node.js'te).
 *
 * @security Reporter PII sanitize + dedup + rate limit + token-bucket
 *   uygular; buradaki hook'lar yalnızca yakalama katmanıdır, her
 *   olayı olduğu gibi göndermez.
 *
 * @since GOAL-101 (FAZ-10) frontend hata yakalama next-tick
 */

import { errorReporter } from "./src/lib/error-reporter";

/**
 * Next.js tarafından çağrılan tek giriş noktası. `runtime` parametresi
 * ile server mi client mı olduğumuzu anlarız. Server tarafında
 * `instrumentation-node` yüklenir, client tarafında browser
 * runtime'ında çalışır.
 *
 * Detaylar:
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register(): Promise<void> {
  // `process` her ortamda mevcut; `window` yalnızca browser'da.
  // Server tarafında (Node.js) global hataları yakala.
  if (typeof window === "undefined") {
    bindServerHandlers();
    return;
  }
  // Client tarafında: window.onerror + unhandledrejection.
  bindClientHandlers();
}

/** Browser ortamında global hata yakalama hook'ları. */
function bindClientHandlers(): void {
  if (typeof window === "undefined") return;

  // Önceki yüklemelerden gelen listener'lar olabilir; replace et.
  // Reporter singleton olduğu için aynı sayfada birden fazla kez
  // çağrılmamalı, ancak HMR sırasında tekrar yüklenebilir.
  if ((window as unknown as { __vetniva_error_bound__: boolean })
    .__vetniva_error_bound__) {
    return;
  }
  (window as unknown as { __vetniva_error_bound__: boolean })
    .__vetniva_error_bound__ = true;

  window.addEventListener("error", (event) => {
    try {
      const err =
        event.error instanceof Error
          ? event.error
          : new Error(event.message || "Bilinmeyen hata");
      const route = window.location?.pathname ?? "CLIENT /unknown";
      errorReporter.captureError(err, {
        source: "window.onerror",
        route,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    } catch {
      // Reporter sessizce yutmalı; burada da herhangi bir hata oluşursa
      // yutulur (kullanıcı deneyimini etkilemez).
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reason = event.reason;
      const err =
        reason instanceof Error
          ? reason
          : new Error(
              typeof reason === "string"
                ? reason
                : "Unhandled promise rejection",
            );
      const route = window.location?.pathname ?? "CLIENT /unknown";
      errorReporter.captureError(err, {
        source: "unhandledrejection",
        route,
      });
    } catch {
      // sessiz
    }
  });
}

/**
 * Server (Node.js) ortamında global hata yakalama. Next.js kendi
 * hata yönetimi (error.tsx + global-error.tsx) ekran tarafını
 * kapsar; bu hook process-level hataları (uncaught exception,
 * unhandled rejection) reporter'a yönlendirir.
 */
function bindServerHandlers(): void {
  if (typeof process === "undefined") return;
  const g = process as NodeJS.Process;
  g.on("uncaughtException", (err: Error) => {
    try {
      errorReporter.captureError(err, { source: "process.uncaughtException" });
    } catch {
      // sessiz
    }
  });
  g.on("unhandledRejection", (reason: unknown) => {
    try {
      const err =
        reason instanceof Error
          ? reason
          : new Error(
              typeof reason === "string"
                ? reason
                : "Unhandled server-side rejection",
            );
      errorReporter.captureError(err, { source: "process.unhandledRejection" });
    } catch {
      // sessiz
    }
  });
}
