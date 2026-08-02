/**
 * @file Superadmin hata merkezi başlangıç ekranı.
 * @module @vetniva/web/app/superadmin/error-center
 * @description GOAL-103 için kalıcı backend hata olaylarının yönetim yüzü.
 * Ekran yalnız SUPERADMIN oturumunda backend'in yetki kontrolünden veri alır;
 * tenant veya kullanıcı kimliği tarayıcıdan türetilmez.
 */

import Link from "next/link";

import { ErrorEventList } from "../../../../src/components/superadmin/error-event-list";

/** Hata merkezi route'u. Detay ve filtre etkileşimleri sonraki client katmanında
 * aynı yetkili API endpointlerine bağlanır; bu ilk ekran güvenli giriş noktasıdır. */
export default function ErrorCenterPage({
  params,
}: {
  params: { locale: string };
}): JSX.Element {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <p className="text-sm text-slate-500">Superadmin</p>
        <h1 className="text-2xl font-semibold text-slate-900">Hata merkezi</h1>
        <p className="mt-2 text-slate-600">
          Kalıcı hata olaylarını, fingerprint gruplarını ve çözüm durumlarını
          yönetin.
        </p>
      </header>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-medium text-slate-900">İzleme uçları</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-slate-700">
          <li>
            Tenant, şube, modül, severity, hata kodu, release ve durum
            filtreleri
          </li>
          <li>Fingerprint grupları ve ilk/son görülme bilgisi</li>
          <li>new → investigating → resolved → reopened durum akışı</li>
        </ul>
        <p className="mt-4 text-sm text-slate-500">
          Veri erişimi yalnız <code>/api/v1/superadmin/error-events</code>{" "}
          yetkili endpointi üzerinden yapılır.
        </p>
      </section>
      <ErrorEventList />
      <Link
        className="text-sm font-medium text-blue-700 underline"
        href={`/${params.locale}/dashboard`}
      >
        Dashboard&apos;a dön
      </Link>
    </main>
  );
}
