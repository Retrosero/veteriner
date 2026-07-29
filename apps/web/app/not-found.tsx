/**
 * @file 404 sayfası.
 * @module @vetniva/web/app/not-found
 *
 * @description Bilinmeyen route'lar için gösterilen kök 404. Locale
 * segmentine düşmeyen tüm yanlış yollar buraya yönlendirilir.
 */

import Link from "next/link";

export default function NotFound(): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold text-clinic-800">404</h1>
      <p className="max-w-sm text-sm text-gray-600">
        Aradığınız sayfa bulunamadı. Lütfen URL&apos;i kontrol edin veya ana
        sayfaya dönün.
      </p>
      <Link
        href="/tr-TR"
        className="inline-flex h-10 items-center justify-center rounded bg-clinic-700 px-4 text-sm font-medium text-white transition-colors hover:bg-clinic-800"
      >
        Ana sayfa
      </Link>
    </div>
  );
}
