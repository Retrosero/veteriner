/**
 * @file Tarayıcı genel hata dinleyicisi.
 * @module @vetniva/web/components/observability/global-error-listener
 * @description GOAL-101 kapsamında React hata sınırlarının yakalayamadığı
 * tarayıcı `error` ve `unhandledrejection` olaylarını merkezi hata
 * raporlayıcısına iletir. Görünür arayüz üretmez.
 * @security Olay bağlamına form verisi eklenmez; raporlayıcı mesaj ve
 * bağlamı PII maskesinden geçirir. Dinleyici hiçbir hata için throw etmez.
 */

"use client";

import { useEffect } from "react";

import { errorReporter } from "@/lib/error-reporter";

/**
 * Browser'ın global hata kanallarını yaşam döngüsü boyunca dinler.
 * @description React error boundary kapsamı dışındaki çalışma zamanı
 * hataları ile yakalanmamış Promise reddini raporlar; bileşen temizlenince
 * dinleyicileri kaldırır.
 */
export function GlobalErrorListener(): null {
  useEffect(() => {
    const handleError = (event: ErrorEvent): void => {
      try {
        errorReporter.captureError(event.error ?? event.message, {
          source: "window.error",
          filename: event.filename,
          line: event.lineno,
          column: event.colno,
        });
      } catch {
        // Merkezi raporlama, uygulamanın hata yolunu asla bozmamalıdır.
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
      try {
        errorReporter.captureError(event.reason, {
          source: "window.unhandledrejection",
        });
      } catch {
        // Merkezi raporlama, uygulamanın hata yolunu asla bozmamalıdır.
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
    };
  }, []);

  return null;
}
