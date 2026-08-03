/**
 * @file Tenant disa aktarma temel tipleri.
 * @module @vetniva/tenant-export/types
 *
 * @description GOAL-125 (FAZ-12) kapsaminda tenant veri
 * disa aktarma icin dataset, format ve audit tipleri. Tenant
 * izolasyonu, PII kontrolu ve audit kurallarina uyar. Placeholder
 * veri kimliksiz.
 *
 * @since GOAL-125 (FAZ-12) tenant veri disa aktarma
 */

/** Tenant disa aktarmada kullanilan dataset isimleri. */
export type ExportDataset =
  | "owners"
  | "patients"
  | "examinations"
  | "vaccinations"
  | "prescriptions"
  | "sales"
  | "payments"
  | "lab_results"
  | "imaging_orders"
  | "files";

/** Desteklenen format. CSV FAZ-13+ planlanmistir. */
export type ExportFormat = "json" | "csv";

/** PII kontrol seviyesi. */
export type PiiCheckLevel = "strict" | "permissive";

/**
 * Tek bir tenant export gorev tanimi. Operator veya
 * yetkili tenant yoneticisi tarafindan olusturulur.
 */
export interface ExportRequest {
  /** Tenant id (export bu tenant icin). */
  tenantId: string;
  /** Export eden kullanici (audit icin). */
  exportedBy: string;
  /** Tenant slug (metadata). */
  tenantSlug?: string;
  /** Dahil edilecek dataset listesi. */
  datasets: ReadonlyArray<ExportDataset>;
  /** Format. */
  format: ExportFormat;
  /**
   * PII kontrol seviyesi. Strict: PII alanlari mask'lenir ve
   * export dosyasinin audit log'unda flaglenir. Permissive:
   * PII (kendi verisi) oldugu gibi doner; audit warning uretir.
   */
  piiCheck: PiiCheckLevel;
  /** Tenant ulke kodu (TR/GB). Audit icin. */
  country?: "TR" | "GB";
  /** Uygulama surumu (audit icin). */
  release?: string;
}

/**
 * Export gorev sonucu. exportFn tarafindan uretilir; gercek
 * veriler burada yer almaz (dosyaya yazilir), yalnizca metadata
 * doner.
 */
export interface ExportResult {
  /** Benzersiz export id (uuid v4). */
  exportId: string;
  /** Tenant id (cross-check). */
  tenantId: string;
  /** Uretim zamani (ISO 8601). */
  exportedAt: string;
  /** Format. */
  format: ExportFormat;
  /** Toplam satir sayisi (dataset bazinda toplam). */
  totalRows: number;
  /** Dataset bazinda satir sayisi. */
  rowsPerDataset: Readonly<Record<ExportDataset, number>>;
  /** Cikti dosyasinin yolu. */
  outputFile: string;
  /** PII kontrol seviyesi. */
  piiCheck: PiiCheckLevel;
  /** PII tespit edilen alan sayisi (permissive modda). */
  piiFieldsDetected: number;
  /** Audit log entry (server'a yazilir). */
  auditEvent: ExportAuditEvent;
  /** PII masker uygulanmis mi? */
  piiMasked: boolean;
}

/** Audit log icin minimal event. */
export interface ExportAuditEvent {
  /** "audit:tenant.export.created" */
  eventName: string;
  /** Tenant context. */
  tenantId: string;
  /** Islemi yapan kullanici. */
  actorId: string;
  /** Aktör tipi. */
  actorType: "user" | "system" | "superadmin";
  /** Format. */
  format: ExportFormat;
  /** Dataset listesi. */
  datasets: ReadonlyArray<ExportDataset>;
  /** Toplam satir. */
  totalRows: number;
  /** PII kontrol sonucu. */
  piiMasked: boolean;
  /** Uretim zamani. */
  occurredAt: string;
  /** Correlation / request id. */
  correlationId: string;
  /** Tenant ulkesi (varsa). */
  country?: string;
  /** Uygulama surumu (varsa). */
  release?: string;
}

/** Tenant bazli dataset kaynagi. */
export interface TenantDataSource {
  /**
   * Tum dataset'ler icin tenant-scoped kayit doner. Tenant
   * izolasyonu bu noktada zorunludur; farkli tenant_id
   * filtreleme yapan saglayici reddedilir.
   */
  listForTenant(
    tenantId: string,
    dataset: ExportDataset,
  ): Promise<ReadonlyArray<Record<string, unknown>>>;
}

/** PII mask servisi. */
export interface PiiMasker {
  /** Object icindeki PII alanlarini mask'ler. */
  maskObject(value: Record<string, unknown>): Record<string, unknown>;
  /** PII alan tespiti. */
  detectPiiFields(value: Record<string, unknown>): ReadonlyArray<string>;
}
