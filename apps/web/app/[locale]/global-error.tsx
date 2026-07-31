"use client";

/**
 * @file Global error boundary (root layout'un hata sınırı).
 * @module @vetniva/web/app/[locale]/global-error
 *
 * @description GOAL-101 (FAZ-10) frontend hata yakalama — Next.js
 * App Router `global-error.tsx` convention. Root layout dahil
 * TÜM segmentlerde yakalanmamış hatalar buraya düşer. Bu dosya
 * kendi `<html>` ve `<body>` etiketlerini tanımlamak ZORUNDADIR
 * çünkü root layout başarısız olmuş olabilir.
 *
 * Davranış:
 * - Hata otomatik olarak `errorReporter`'a iletilir.
 * - Kullanıcıya minimal bir hata sayfası + sayfayı yeniden yükle
 *   butonu sunulur (Next.js `reset` bu seviyede çalışmaz; reload
 *   önerilir).
 * - Tüm CSS sıfırlanır (Tailwind sınıfları inline verilir).
 *
 * @security Hata detayı kullanıcıya gösterilmez; yalnızca generic
 *   mesaj + correlation ID paylaşılır.
 *
 * @since GOAL-101 (FAZ-10) frontend hata yakalama core
 */

import { useEffect } from "react";
import type { ReactElement } from "react";

import { errorReporter } from "@/lib/error-reporter";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({
  error,
  reset,
}: GlobalErrorProps): ReactElement {
  useEffect(() => {
    // global-error seviyesinde yakalanan hata büyük olasılıkla
    // root layout başarısız olmuş demektir; en azından log/reporter
    // çağrısı yapılır.
    errorReporter.captureError(error, {
      source: "next-global-error-boundary",
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="tr" dir="ltr">
      <body
        style={{
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', sans-serif",
          margin: 0,
          minHeight: "100vh",
          background: "#f9fafb",
          color: "#111827",
        }}
      >
        <div
          data-testid="global-error-boundary"
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "24px",
            textAlign: "center",
            gap: "12px",
          }}
        >
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 600,
              margin: 0,
            }}
          >
            Kritik hata
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "#4b5563",
              maxWidth: "480px",
              margin: 0,
            }}
          >
            VetNiva şu an yanıt veremiyor. Sayfayı yenilemek sorunu
            çözebilir; devam ederse destek ekibine bildirin.
          </p>
          {error.digest ? (
            <p
              data-testid="global-error-correlation"
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                fontSize: "12px",
                color: "#6b7280",
                margin: 0,
              }}
            >
              Hata kodu: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: 0,
              background: "#0359a1",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Tekrar dene
          </button>
        </div>
      </body>
    </html>
  );
}
