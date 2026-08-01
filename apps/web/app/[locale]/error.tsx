"use client";

/**
 * @file [locale] route segment error boundary.
 * @module @vetniva/web/app/[locale]/error
 * @description GOAL-101 (FAZ-10) frontend hata yakalama — Next.js
 * App Router `error.tsx` convention. Bu sınır, aynı segment
 * altındaki server component'lerde yakalanmamış hataları ele alır
 * ve kullanıcıya anlaşılır bir geri dönüş sunar.
 *
 * Davranış:
 * - Hata otomatik olarak `errorReporter`'a iletilir (server-side
 *   render hatası bile olsa).
 * - Kullanıcıya correlation ID + "tekrar dene" butonu sunulur.
 * - Layout ve global hata sınırı sağlam kaldığı için sayfa geri
 *   kalan UI bozulmaz.
 * @security Hata mesajı kullanıcıya gösterilirken PII içermez;
 *   yalnızca generic bir metin + correlation ID paylaşılır.
 * @since GOAL-101 (FAZ-10) frontend hata yakalama core
 */

import { useEffect } from "react";

import { errorReporter } from "@/lib/error-reporter";

import type { ReactElement } from "react";

type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 *
 * @param root0
 * @param root0.error
 * @param root0.reset
 */
export default function LocaleErrorBoundary({
  error,
  reset,
}: ErrorBoundaryProps): ReactElement {
  useEffect(() => {
    // Hata sınırına düşen server hatasını da raporla. Server tarafı
    // logu zaten mevcut, ancak client tarafında yaşanan yan etkileri
    // (ör. cache bozulması) de görmek istiyoruz.
    errorReporter.captureError(error, {
      source: "next-error-boundary",
      digest: error.digest,
    });
  }, [error]);

  return (
    <div
      data-testid="locale-error-boundary"
      role="alert"
      className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold text-gray-900">
        Beklenmeyen bir hata oluştu
      </h1>
      <p className="text-sm text-gray-600">
        İsteğinizi şu an karşılayamıyoruz. Lütfen tekrar deneyin; sorun devam
        ederse destek ekibiyle iletişime geçin.
      </p>
      {error.digest ? (
        <p
          data-testid="error-correlation"
          className="font-mono text-xs text-gray-500"
        >
          Hata kodu: {error.digest}
        </p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
      >
        Tekrar dene
      </button>
    </div>
  );
}
