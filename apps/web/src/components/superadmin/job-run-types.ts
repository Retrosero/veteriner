/**
 * @file Superadmin job runs paylaşılan tipleri ve sorgu
 * yardımcıları.
 * @module @vetniva/web/components/superadmin/job-run-types
 * @description List + detail + summary komponentleri arasında paylaşılan
 * TS tipleri, enum söylemi (5 status × 4 source × 4 triggeredBy) ve
 * API sorgu yolu kurucusu. Tek bir kaynaktan kontrol edilmesi
 * sayesinde yeni bir status eklendiğinde üç komponent ve i18n
 * sözlüğü aynı anda güncellenir.
 *
 * @security Filtre değerleri URL sorgu parametrelerine doğrudan
 * eklenir; burada yalnız izinli, sunucu tarafı whitelist ile eşleşen
 * alanlar kabul edilir. Kullanıcı tarafından serbest metin girilen
 * alanlar encode edilir. Tenant/branch/actor kimliği tarayıcıdan
 * türetilmez; yalnız SUPERADMIN oturum çerezi ile gönderilir.
 */

export const JOB_RUN_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead_letter",
] as const;

export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

export const JOB_RUN_SOURCES = ["queue", "adapter", "cron", "system"] as const;

export type JobRunSource = (typeof JOB_RUN_SOURCES)[number];

export const JOB_RUN_TRIGGERED_BY = [
  "user",
  "system",
  "schedule",
  "retry",
] as const;

export type JobRunTriggeredBy = (typeof JOB_RUN_TRIGGERED_BY)[number];

/**
 * Job run listesi için filtre state. Her alan ya whitelist'ten
 * (status/source/triggeredBy) ya da serbest metin (queueName,
 * jobName, jobKey, tenantId, branchId, country, search) olabilir.
 * `from`/`to` datetime-local formatında olup API'ye ISO-8601 olarak
 * gönderilir.
 */
export type JobRunFilterState = {
  queueName: string;
  jobName: string;
  jobKey: string;
  status: JobRunStatus | "";
  source: JobRunSource | "";
  triggeredBy: JobRunTriggeredBy | "";
  tenantId: string;
  branchId: string;
  country: string;
  from: string;
  to: string;
  search: string;
};

/**
 * List satırı; SUPERADMIN job-runs endpoint'inin standart projection'ı.
 * PII açısından tenant/branch ID'leri operasyonel izleme için
 * gösterilir; gerçek kişi PII'si (ad, telefon, e-posta) hiçbir zaman
 * bu kayıtta yer almaz.
 */
export type JobRunRow = {
  id: string;
  jobKey: string;
  queueName: string;
  jobName: string;
  attempt: number;
  status: JobRunStatus;
  source: JobRunSource;
  triggeredBy: JobRunTriggeredBy;
  errorCode: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  tenantId: string | null;
  branchId: string | null;
  country: string | null;
};

/**
 * Job run detay response şeması. `input` ve `output` PII mask'lı
 * JSON object; `errorStack` yalnızca failed/dead_letter için dolu.
 * `maxAttempts` queue yapılandırması; null ise sınırsız kabul edilir.
 */
export type JobRunDetailRecord = JobRunRow & {
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  errorStack: string | null;
  maxAttempts: number | null;
  triggeredByUserId: string | null;
  correlationId: string | null;
};

/**
 * Aynı jobKey için tüm attempt geçmişi satırı. attempts endpoint'i
 * yalnızca operasyonel özet döner; input/output detayı içermez.
 */
export type JobRunAttempt = {
  id: string;
  jobKey: string;
  attempt: number;
  status: JobRunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
};

/**
 * Job run summary (KPI) response şeması. Foundation page.tsx ile
 * uyumlu: total + status kırılımları + 24h dead-letter + oldest
 * running. Burada sade tutmak için yalnız `summary` altında
 * ihtiyaç duyulan alanlar tiplenir; diğer byStatus/byQueue kırılımları
 * opsiyoneldir.
 */
export type JobRunSummary = {
  total: number;
  succeeded: number;
  failed: number;
  deadLetter: number;
  running: number;
  pending: number;
  last24hDeadLetter: number;
  oldestRunning: { id: string; startedAt: string } | null;
  byStatus?: Array<{ status: JobRunStatus; count: number }>;
  byQueue?: Array<{
    queueName: string;
    succeeded: number;
    failed: number;
    deadLetter: number;
    running: number;
    pending: number;
  }>;
};

/**
 * Liste response sözleşmesi. Backend 50 limitli pagination döner;
 * UI ilk sayfayı gösterir, "Tümünü gör" linki ileride eklenebilir.
 */
export type JobRunListResponse = {
  items: JobRunRow[];
  total: number;
};

/**
 * Attempts list response sözleşmesi.
 */
export type JobRunAttemptsResponse = {
  items: JobRunAttempt[];
  total: number;
};

/**
 * List satırı için status rengi tonu. dead_letter durumu için
 * ekstra kenarlık uygulanır; failed ve dead_letter aynı
 * `danger` tonunu paylaşır.
 * @param status
 */
export function jobRunStatusTone(
  status: JobRunStatus,
): "success" | "warning" | "info" | "danger" | "neutral" {
  switch (status) {
    case "succeeded":
      return "success";
    case "pending":
      return "warning";
    case "running":
      return "info";
    case "failed":
    case "dead_letter":
      return "danger";
  }
}

/**
 * dead_letter durumu için ekstra görsel ipucu (kalın kenarlık +
 * arka plan tonu). Liste ve detay komponentlerinde Badge
 * `className` üzerinden uygulanır.
 * @param status
 */
export function jobRunStatusCriticalClass(status: JobRunStatus): string {
  if (status === "dead_letter") {
    return "border border-red-700 bg-red-100 text-red-900";
  }
  return "";
}

/**
 * Source için operasyonel ciddiyete göre ton.
 * @param source
 */
export function jobRunSourceTone(
  source: JobRunSource,
): "info" | "warning" | "danger" | "neutral" {
  switch (source) {
    case "queue":
    case "cron":
      return "neutral";
    case "adapter":
      return "info";
    case "system":
      return "warning";
  }
}

/**
 * TriggeredBy için ton. `retry` uyarı tonu alır çünkü
 * operasyonel müdahale işaretidir.
 * @param triggeredBy
 */
export function jobRunTriggeredByTone(
  triggeredBy: JobRunTriggeredBy,
): "info" | "warning" | "neutral" {
  switch (triggeredBy) {
    case "user":
    case "schedule":
      return "info";
    case "retry":
      return "warning";
    case "system":
      return "neutral";
  }
}

/**
 * Filtre state'inden API sorgu yolunu kurar. Yalnız whitelist
 * alanları eklenir; boş string'ler atlanır. `from` / `to`
 * datetime-local değerleri ISO formatına çevrilir. `view`
 * parametresi `list` (standart job-runs endpoint'i) veya
 * `dead-letter` (sadece dead-letter view'ı) seçer.
 * @param filters
 * @param view
 */
export function buildJobRunPath(
  filters: JobRunFilterState,
  view: "list" | "dead-letter" = "list",
): string {
  const basePath =
    view === "dead-letter"
      ? "/api/v1/superadmin/job-runs/dead-letter"
      : "/api/v1/superadmin/job-runs";
  const query = new URLSearchParams({ limit: "50", offset: "0" });
  const setIfPresent = (key: string, value: string): void => {
    const trimmed = value.trim();
    if (!trimmed) return;
    query.set(key, trimmed);
  };
  setIfPresent("queueName", filters.queueName);
  setIfPresent("jobName", filters.jobName);
  setIfPresent("jobKey", filters.jobKey);
  setIfPresent("status", filters.status);
  setIfPresent("source", filters.source);
  setIfPresent("triggeredBy", filters.triggeredBy);
  setIfPresent("tenantId", filters.tenantId);
  setIfPresent("branchId", filters.branchId);
  setIfPresent("country", filters.country);
  if (filters.from) query.set("from", new Date(filters.from).toISOString());
  if (filters.to) query.set("to", new Date(filters.to).toISOString());
  setIfPresent("search", filters.search);
  return `${basePath}?${query.toString()}`;
}

/**
 * Süreyi insan-okunabilir formata dönüştürür. < 1s için ms,
 * 1-60s için saniye, >= 60s için `Xm Ys` döner.
 * @param ms
 */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}
