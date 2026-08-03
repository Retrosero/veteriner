/**
 * @file Superadmin hata olayları canlı liste bileşeni.
 * @module @vetniva/web/components/superadmin
 * @description Yetkili error-events endpointinden yalnız görüntüleme için
 * özet kayıtları alır. Tenant bağlamı istemciden gönderilmez; backend
 * SUPERADMIN oturumunu ve erişim sınırını uygular.
 */

"use client";

import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "../../lib/api-client";
import { ErrorEventDetail } from "./error-event-detail";

type ErrorEventRow = {
  id: string;
  severity: string;
  errorCode: string;
  message: string;
  status: string;
  module: string;
  lastSeenAt: string;
  occurrenceCount: number;
};

type ErrorEventList = { items: ErrorEventRow[]; total: number };

type FilterState = { status: string; severity: string; search: string };

const INITIAL_FILTERS: FilterState = { status: "", severity: "", search: "" };

function buildPath(filters: FilterState): string {
  const query = new URLSearchParams({ limit: "50", offset: "0" });
  if (filters.status) query.set("status", filters.status);
  if (filters.severity) query.set("severity", filters.severity);
  if (filters.search.trim()) query.set("search", filters.search.trim());
  return `/api/v1/superadmin/error-events?${query.toString()}`;
}

/** Kalıcı hata olaylarının ilk sayfasını yükler ve güvenli durum metni gösterir. */
export function ErrorEventList(): JSX.Element {
  const [data, setData] = useState<ErrorEventList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const path = useMemo(() => buildPath(filters), [filters]);

  useEffect(() => {
    let active = true;
    setError(null);
    void apiRequest<ErrorEventList>(path, { credentials: "include" }).then(
      (result) => {
        if (!active) return;
        if (result.ok) setData(result.data);
        else setError("Hata kayıtları şu anda yüklenemiyor.");
      },
    );
    return () => {
      active = false;
    };
  }, [path]);

  const updateFilter = (field: keyof FilterState, value: string): void => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  return (
    <section className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
        <label className="text-sm text-slate-700">
          Durum
          <select
            aria-label="Durum filtresi"
            className="mt-1 w-full rounded border p-2"
            value={filters.status}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            <option value="">Tümü</option>
            <option value="new">Yeni</option>
            <option value="investigating">İnceleniyor</option>
            <option value="resolved">Çözüldü</option>
            <option value="reopened">Yeniden açıldı</option>
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Şiddet
          <select
            aria-label="Şiddet filtresi"
            className="mt-1 w-full rounded border p-2"
            value={filters.severity}
            onChange={(event) => updateFilter("severity", event.target.value)}
          >
            <option value="">Tümü</option>
            <option value="critical">Kritik</option>
            <option value="error">Hata</option>
            <option value="warning">Uyarı</option>
            <option value="info">Bilgi</option>
          </select>
        </label>
        <label className="text-sm text-slate-700">
          Ara
          <input
            aria-label="Hata ara"
            className="mt-1 w-full rounded border p-2"
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Kod, mesaj veya modül"
          />
        </label>
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </p>
      ) : null}
      {!data && !error ? (
        <p className="text-slate-500">Hata kayıtları yükleniyor…</p>
      ) : null}
      {data ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3 text-sm text-slate-600">
            Toplam {data.total} olay
          </div>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-3">Durum</th>
                <th className="p-3">Şiddet</th>
                <th className="p-3">Kod</th>
                <th className="p-3">Modül</th>
                <th className="p-3">Tekrar</th>
                <th className="p-3">Son görülme</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((event) => (
                <tr className="border-t border-slate-100" key={event.id}>
                  <td className="p-3">
                    <button
                      className="text-left underline decoration-slate-300 underline-offset-2 hover:text-blue-700"
                      onClick={() => setSelectedEventId(event.id)}
                      type="button"
                    >
                      {event.status}
                    </button>
                  </td>
                  <td className="p-3">{event.severity}</td>
                  <td className="p-3 font-mono">{event.errorCode}</td>
                  <td className="p-3">{event.module}</td>
                  <td className="p-3">{event.occurrenceCount}</td>
                  <td className="p-3">
                    {new Date(event.lastSeenAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {selectedEventId ? <ErrorEventDetail eventId={selectedEventId} /> : null}
    </section>
  );
}
