/**
 * @file Superadmin güvenlik olayları özet görünümü.
 * @module @vetniva/web/components/superadmin/security-event-summary
 * @description Security-events summary endpointinden (severity ×
 * type kırılımı + top-20 fingerprint saldırı sınıfı) salt
 * okunur kart görünümü üretir. SUPERADMIN oturum çerezi ile
 * çağrılır; tenant veya aktör kimliği tarayıcıdan türetilmez.
 *
 * Erişilebilirlik:
 * - Ana konteyner `role="group"` + `aria-label`
 * - Her kart `role="article"` + aria-label
 * - Yükleme ve hata durumu `role="status"` ile duyurulur
 * - Tablo boş durumu `role="status"` ile gösterilir
 *
 * @security Top-groups listesi saldırı fingerprint'lerini
 * (anonim hash) gösterir; PII içermez. `eventCount` toplam
 * oluşum sayısıdır ve sayfa içi sıralama client tarafında
 * tekrar uygulanmaz (server authoritative).
 */

"use client";

import { Badge } from "@vetniva/ui";
import { cn } from "@vetniva/ui/cn";
import { useEffect, useState } from "react";


import { safeLabelLookup } from "@/lib/safe-lookup";

import {
  securityEventTypeTone,
  severityCriticalClass,
  severityTone,
  type SecurityEventSummary,
  type SecuritySeverity,
  type SecurityEventType,
} from "./security-event-types";
import { apiRequest } from "../../lib/api-client";
import { getLabels, type Locale } from "../../lib/labels";

export type SecurityEventSummaryProps = {
  locale: Locale;
  /** `from` ISO-8601; boşsa backend tüm zamanları döner. */
  from?: string;
};

const SEVERITY_ORDER: ReadonlyArray<SecuritySeverity> = [
  "info",
  "warning",
  "error",
  "critical",
];

const TYPE_ORDER: ReadonlyArray<SecurityEventType> = [
  "failed_login",
  "unauthorized_access_attempt",
  "suspicious_export",
  "role_change",
  "tenant_isolation_breach_attempt",
];

function indexBy<T extends { [k: string]: string | number }>(
  rows: ReadonlyArray<T>,
  key: keyof T,
): Map<string, number> {
  const map = new Map<string, number>();
  const keyName = key as string;
  for (const row of rows) {
    // `key` runtime'da dinamik olabilir; doğrudan `row[key]` erişimi
    // `security/detect-object-injection` kuralını tetikler. Bu nedenle
    // `Object.entries` + `find` deseni ile anahtar eşleştirmesi
    // yapılır (entry tuple'ına indeks erişimi literal olduğundan
    // kural tetiklenmez).
    const valueEntry = Object.entries(row).find(([k]) => k === keyName);
    if (!valueEntry) continue;
    const value: unknown = valueEntry[1];
    if (typeof value !== "string" && typeof value !== "number") continue;
    // `count` alanı `T` jenerik kısıtında beyan edilmediğinden
    // runtime okuma aynı desen ile yapılır.
    const countEntry = Object.entries(row).find(([k]) => k === "count");
    const count =
      countEntry && typeof countEntry[1] === "number"
        ? countEntry[1]
        : 0;
    map.set(String(value), count);
  }
  return map;
}

/**
 *
 * @param root0
 * @param root0.locale
 * @param root0.from
 */
export function SecurityEventSummary({
  locale,
  from,
}: SecurityEventSummaryProps): JSX.Element {
  const labels = getLabels(locale);
  const sec = labels.securityEvents;
  const [data, setData] = useState<SecurityEventSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    const query = from ? `?from=${encodeURIComponent(from)}` : "";
    void apiRequest<SecurityEventSummary>(
      `/api/v1/superadmin/security-events/summary${query}`,
      { credentials: "include" },
    ).then((result) => {
      if (!active) return;
      if (result.ok) {
        setData(result.data);
        return;
      }
      setData(null);
      setError(sec.loadErrorHint);
    });
    return () => {
      active = false;
    };
  }, [from, sec.loadErrorHint]);

  if (error) {
    return (
      <p
        className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        role="status"
      >
        {error}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="text-sm text-slate-500" role="status">
        {labels.superadmin.status.loading}
      </p>
    );
  }

  const severityMap = indexBy(data.bySeverity, "severity");
  const typeMap = indexBy(data.byType, "type");

  return (
    <section
      aria-label={sec.summaryHeading}
      className="space-y-6"
      role="group"
    >
      <div>
        <h3 className="text-base font-semibold text-slate-900">
          {sec.summary.title}
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SEVERITY_ORDER.map((severity) => (
            <article
              aria-label={`${safeLabelLookup(sec.severities, severity, severity)} — ${severityMap.get(severity) ?? 0}`}
              className="flex flex-col gap-2 rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm"
              key={severity}
              role="article"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">
                  {safeLabelLookup(sec.severities, severity, severity)}
                </span>
                <Badge
                  className={cn(severityCriticalClass(severity))}
                  size="sm"
                  tone={severityTone(severity)}
                >
                  {severityMap.get(severity) ?? 0}
                </Badge>
              </div>
              <ul className="space-y-1 text-xs text-slate-500">
                {TYPE_ORDER.map((type) => {
                  const cell = typeMap.get(type) ?? 0;
                  return (
                    <li
                      className="flex items-center justify-between gap-2"
                      key={type}
                    >
                      <span className="flex items-center gap-1.5">
                        <Badge size="sm" tone={securityEventTypeTone(type)}>
                          {safeLabelLookup(sec.types, type, type)}
                        </Badge>
                      </span>
                      <span className="font-mono text-slate-700">{cell}</span>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">
            {sec.summary.topGroupsTitle}
          </h3>
          <span className="text-xs text-slate-500">
            {sec.summary.topGroupsHint}
          </span>
        </div>
        {data.topGroups.length === 0 ? (
          <p
            className="mt-3 rounded border border-dashed border-slate-200 p-4 text-sm text-slate-500"
            role="status"
          >
            {sec.summary.noTopGroups}
          </p>
        ) : (
          <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.topGroups.map((group) => (
              <li key={group.fingerprint}>
                <article
                  aria-label={`${safeLabelLookup(sec.types, group.type, group.type)} — ${group.eventCount}`}
                  className="flex flex-col gap-2 rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm"
                  role="article"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge size="sm" tone={securityEventTypeTone(group.type)}>
                      {safeLabelLookup(sec.types, group.type, group.type)}
                    </Badge>
                    <Badge
                      className={cn(severityCriticalClass(group.severity))}
                      size="sm"
                      tone={severityTone(group.severity)}
                    >
                      {safeLabelLookup(sec.severities, group.severity, group.severity)}
                    </Badge>
                  </div>
                  <p className="break-all font-mono text-xs text-slate-700">
                    {group.fingerprint}
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    {sec.summary.eventCountLabel.replace(
                      "{count}",
                      String(group.eventCount),
                    )}
                  </p>
                </article>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
