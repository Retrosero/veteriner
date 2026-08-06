/**
 * @file Superadmin güvenlik olayları paylaşılan tipleri ve
 * sorgu yardımcıları.
 * @module @vetniva/web/components/superadmin/security-event-types
 * @description List + detail + summary komponentleri arasında
 * paylaşılan TS tipleri, enum söylemi (5 type × 4 severity) ve
 * API sorgu yolu kurucusu. Tek bir kaynaktan kontrol edilmesi
 * sayesinde yeni bir type eklendiğinde üç komponent ve i18n
 * sözlüğü aynı anda güncellenir.
 *
 * @security Filtre değerleri URL sorgu parametrelerine
 * doğrudan eklenir; burada yalnız izinli, sunucu tarafı
 * whitelist ile eşleşen alanlar kabul edilir. Kullanıcı
 * tarafından serbest metin girilen alanlar encode edilir.
 */

export const SECURITY_EVENT_TYPES = [
  "failed_login",
  "unauthorized_access_attempt",
  "suspicious_export",
  "role_change",
  "tenant_isolation_breach_attempt",
] as const;

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export const SECURITY_SEVERITIES = [
  "info",
  "warning",
  "error",
  "critical",
] as const;

export type SecuritySeverity = (typeof SECURITY_SEVERITIES)[number];

export type SecurityEventFilterState = {
  type: SecurityEventType | "";
  severity: SecuritySeverity | "";
  module: string;
  tenantId: string;
  branchId: string;
  userId: string;
  country: string;
  release: string;
  route: string;
  from: string;
  to: string;
  search: string;
};

export type SecurityEventRow = {
  id: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  module: string;
  errorCode: string;
  message: string;
  route: string;
  country: string;
  occurrenceCount: number;
  lastSeenAt: string;
  alertSent: boolean;
};

export type SecurityEventDetailRecord = SecurityEventRow & {
  statusCode: number | null;
  fingerprint: string;
  requestId: string | null;
  maskedIp: string | null;
  userAgentHash: string | null;
  release: string;
  firstSeenAt: string;
  context: Record<string, unknown> | null;
  tenantId: string | null;
  branchId: string | null;
  userId: string | null;
};

export type SecurityEventSummary = {
  total: number;
  bySeverity: Array<{ severity: SecuritySeverity; count: number }>;
  byType: Array<{ type: SecurityEventType; count: number }>;
  topGroups: Array<{
    fingerprint: string;
    type: SecurityEventType;
    severity: SecuritySeverity;
    eventCount: number;
  }>;
};

export type SecurityEventListResponse = {
  items: SecurityEventRow[];
  total: number;
};

/**
 * Bir güvenlik olayı türü için Badge renk tonunu döner. Renk
 * seçimi operasyonel ciddiyetle hizalanır: failed_login ve
 * suspicious_export warning (sarı); unauthorized_access_attempt
 * ve tenant_isolation_breach_attempt danger (kırmızı);
 * role_change info (mavi). Badge primitive `critical` adında
 * bir tone desteklemediğinden tenant_isolation_breach_attempt
 * için en yakın ton `danger` seçilir; görsel yoğunluk
 * `severityCriticalClass` ile artırılır.
 * @param type
 */
export function securityEventTypeTone(
  type: SecurityEventType,
): "warning" | "danger" | "info" {
  switch (type) {
    case "failed_login":
      return "warning";
    case "unauthorized_access_attempt":
      return "danger";
    case "suspicious_export":
      return "warning";
    case "role_change":
      return "info";
    case "tenant_isolation_breach_attempt":
      return "danger";
  }
}

/**
 * Severity seviyesini Badge tone söylemine eşler. Badge primitive
 * `critical` adında bir tone desteklemediğinden en yüksek
 * seviye `danger` ile gösterilir ve `className` üzerinden ekstra
 * görsel ipucu (koyu kırmızı kenarlık) uygulanır.
 * @param severity
 */
export function severityTone(
  severity: SecuritySeverity,
): "info" | "warning" | "danger" {
  switch (severity) {
    case "info":
      return "info";
    case "warning":
      return "warning";
    case "error":
    case "critical":
      return "danger";
  }
}

/**
 * `danger` + `critical` durumlarında görsel ipucu: koyu kırmızı
 * kenarlık ve arka plan. List + summary komponentlerinde
 * `Badge className` üzerinden uygulanır.
 * @param severity
 */
export function severityCriticalClass(severity: SecuritySeverity): string {
  if (severity === "critical") {
    return "border border-red-700 bg-red-100 text-red-900";
  }
  return "";
}

/**
 * Bir datetime-local string değerini ISO-8601 formatına dönüştürür.
 * Geçersiz veya boş değer için `null` döner; bu sayede çağıran
 * taraf `query.set("from", iso)` çağrısını koşulsuz yapabilir ve
 * beklenmeyen `RangeError: Invalid time value` istisnalarından
 * kaçınılır. `datetime-local` input'ları boş bırakıldığında
 * `filters.from === ""` döner; bu durum da `null` ile sonuçlanır.
 *
 * @param value `datetime-local` input değeri (örn. `2026-08-01T00:00`).
 * @returns Geçerli ISO string veya `null`.
 */
export function safeParseDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Bir ISO-8601 string değerini locale uygun görüntüleme string'ine
 * dönüştürür. Geçersiz değer için `—` döner; `RangeError` /
 * `Invalid Date` render istisnalarını yakalar. API'den dönen
 * `lastSeenAt` gibi alanlar beklenen formatta olsa da, kontrat
 * değişikliğine karşı savunmacı biçimde sarılır.
 * @param value ISO-8601 datetime string (örn. `2026-08-05T10:00:00.000Z`).
 * @param locale Active locale, `toLocaleString`'e iletilir.
 * @returns Locale uygun format veya `—` fallback.
 */
export function safeFormatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale);
}

/**
 * Filtre state'inden API sorgu yolunu kurar. Yalnız whitelist
 * alanları eklenir; boş string'ler atlanır. `from` / `to`
 * datetime-local değerleri `safeParseDate` üzerinden ISO
 * formatına çevrilir; geçersiz değerler atlanır.
 * @param filters
 */
export function buildSecurityEventPath(
  filters: SecurityEventFilterState,
): string {
  const query = new URLSearchParams({ limit: "50", offset: "0" });
  const setIfPresent = (key: string, value: string): void => {
    const trimmed = value.trim();
    if (!trimmed) return;
    query.set(key, trimmed);
  };
  setIfPresent("type", filters.type);
  setIfPresent("severity", filters.severity);
  setIfPresent("module", filters.module);
  setIfPresent("tenantId", filters.tenantId);
  setIfPresent("branchId", filters.branchId);
  setIfPresent("userId", filters.userId);
  setIfPresent("country", filters.country);
  setIfPresent("release", filters.release);
  setIfPresent("route", filters.route);
  const fromIso = safeParseDate(filters.from);
  if (fromIso) query.set("from", fromIso);
  const toIso = safeParseDate(filters.to);
  if (toIso) query.set("to", toIso);
  setIfPresent("search", filters.search);
  return `/api/v1/superadmin/security-events?${query.toString()}`;
}
