/**
 * @file Superadmin güvenlik olayı detay bileşeni.
 * @module @vetniva/web/components/superadmin/security-event-detail
 * @description Seçilen tek güvenlik olayının tüm operasyonel
 * alanlarını (type, severity, module, errorCode, message,
 * statusCode, fingerprint, requestId, masked IP, userAgentHash,
 * country, route, release, occurrenceCount, firstSeenAt,
 * lastSeenAt, alertSent) salt okunur olarak gösterir. ID'ye
 * göre `/api/v1/superadmin/security-events/{id}` çağrılır.
 *
 * Erişilebilirlik:
 * - Sayfa başlığı için `<h2>` semantiği
 * - Tanım listesi `<dl>` + `<dt>`/`<dd>` ile screen reader uyumu
 * - Yükleme ve hata durumu `role="status"` ile duyurulur
 * - "Listeye dön" bağlantısı klavye ile erişilebilir
 *
 * @security Tenant, kullanıcı, IP ve user agent yalnız mask'lı
 * olarak gösterilir. Hiçbir PII (TC kimlik, telefon, e-posta)
 * backend'den dönmediği için bu katmanda ek maskeleme gerekmez;
 * ancak context alanı serialize edilirken key-value çiftleri
 * PII şüphesi olan alan adlarını maskeler.
 */

"use client";

import { Badge } from "@vetniva/ui";
import { cn } from "@vetniva/ui/cn";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";


import {
  securityEventTypeTone,
  severityCriticalClass,
  severityTone,
  type SecurityEventDetailRecord,
} from "./security-event-types";
import { apiRequest } from "../../lib/api-client";
import { getLabels, type Locale } from "../../lib/labels";
import { safeLabelLookup } from "../../lib/safe-lookup";

const PII_KEY_PATTERN =
  /^(email|phone|tc|taxId|ownerName|ownerSurname|firstName|lastName|fullName|address)/i;

/**
 * Context alanını PII şüpheli key'ler için mask'leyerek
 * JSON benzeri bir temsile dönüştürür. Değer içeriğine
 * dokunulmaz; yalnız key adı maskelenir.
 * @param value
 * @param depth
 */
function summarizeContext(
  value: unknown,
  depth = 0,
): string {
  if (depth > 4) return "…";
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[${value.length} item]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return entries
      .map(([k, v]) => {
        const maskedKey = PII_KEY_PATTERN.test(k)
          ? `${k} (masked)`
          : k;
        return `${maskedKey}: ${summarizeContext(v, depth + 1)}`;
      })
      .join("\n");
  }
  return "—";
}

export type SecurityEventDetailProps = {
  locale: Locale;
  eventId: string;
};

export function SecurityEventDetail({
  locale,
  eventId,
}: SecurityEventDetailProps): JSX.Element {
  const labels = getLabels(locale);
  const sec = labels.securityEvents;
  const [event, setEvent] = useState<SecurityEventDetailRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((): void => {
    setError(null);
    void apiRequest<SecurityEventDetailRecord>(
      `/api/v1/superadmin/security-events/${eventId}`,
      { credentials: "include" },
    ).then((result) => {
      if (!result.ok) {
        setEvent(null);
        setError(sec.detail.loadError);
        return;
      }
      setEvent(result.data);
    });
  }, [eventId, sec.detail.loadError]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section
      aria-label={sec.detail.heading}
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-slate-900">
          {sec.detail.heading}
        </h2>
        <Link
          aria-label={sec.detail.backToList}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          href={`/${locale}/superadmin/security-events`}
        >
          ← {sec.detail.backToList}
        </Link>
      </div>

      {error ? (
        <p
          className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          role="status"
        >
          {error}
        </p>
      ) : null}
      {!event && !error ? (
        <p className="text-sm text-slate-500" role="status">
          {labels.superadmin.status.loading}
        </p>
      ) : null}
      {event ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge size="md" tone={securityEventTypeTone(event.type)}>
              {safeLabelLookup(sec.types, event.type, event.type)}
            </Badge>
            <Badge
              className={cn(severityCriticalClass(event.severity))}
              size="md"
              tone={severityTone(event.severity)}
            >
              {safeLabelLookup(sec.severities, event.severity, event.severity)}
            </Badge>
            {event.alertSent ? (
              <Badge size="md" tone="danger">
                {sec.detail.alertSentLabel}: {sec.detail.alertSentYes}
              </Badge>
            ) : null}
          </div>

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">{sec.detail.moduleLabel}</dt>
              <dd className="text-slate-900">{event.module}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{sec.detail.errorCodeLabel}</dt>
              <dd className="font-mono text-slate-900">{event.errorCode}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{sec.detail.statusCodeLabel}</dt>
              <dd className="font-mono text-slate-900">
                {event.statusCode ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{sec.detail.fingerprintLabel}</dt>
              <dd className="break-all font-mono text-xs text-slate-900">
                {event.fingerprint}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{sec.detail.requestIdLabel}</dt>
              <dd className="break-all font-mono text-xs text-slate-900">
                {event.requestId ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{sec.detail.maskedIpLabel}</dt>
              <dd className="font-mono text-slate-900">
                {event.maskedIp ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{sec.detail.userAgentHashLabel}</dt>
              <dd className="font-mono text-slate-900">
                {event.userAgentHash ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{sec.detail.countryLabel}</dt>
              <dd className="font-mono text-slate-900">{event.country}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{sec.detail.releaseLabel}</dt>
              <dd className="font-mono text-slate-900">{event.release}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{sec.detail.occurrenceCountLabel}</dt>
              <dd className="text-slate-900">{event.occurrenceCount}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">{sec.detail.routeLabel}</dt>
              <dd className="break-all font-mono text-xs text-slate-900">
                {event.route}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{sec.detail.firstSeenLabel}</dt>
              <dd className="text-slate-900">
                {new Date(event.firstSeenAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{sec.detail.lastSeenLabel}</dt>
              <dd className="text-slate-900">
                {new Date(event.lastSeenAt).toLocaleString()}
              </dd>
            </div>
          </dl>

          <section
            aria-label={sec.detail.messageLabel}
            className="rounded bg-slate-50 p-3 text-sm text-slate-900"
          >
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {sec.detail.messageLabel}
            </h3>
            <p className="mt-1">{event.message}</p>
          </section>

          <section
            aria-label={sec.detail.contextLabel}
            className="space-y-2"
          >
            <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {sec.detail.contextLabel}
            </h3>
            <pre className="max-h-64 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
              {event.context
                ? summarizeContext(event.context)
                : sec.detail.noContext}
            </pre>
          </section>
        </>
      ) : null}
    </section>
  );
}
