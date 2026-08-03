/**
 * @file Tenant veri disa aktarma giris modulu.
 * @module @vetniva/tenant-export
 *
 * @description GOAL-125 (FAZ-12) kapsaminda tenant veri disa
 * aktarma cekirdek motoru, PII masker ve data source
 * interface. Tenant izolasyonu, PII mask ve audit kurallarina
 * uyar; placeholder veri kimliksiz.
 *
 * @since GOAL-125 (FAZ-12) tenant veri disa aktarma
 */

export type {
  ExportDataset,
  ExportFormat,
  PiiCheckLevel,
  ExportRequest,
  ExportResult,
  ExportAuditEvent,
  TenantDataSource,
  PiiMasker,
} from "./types.js";

export {
  exportTenantData,
  ALL_DATASETS,
  InMemoryTenantDataSource,
  emptyDataSource,
} from "./export.js";
export type { ExportOptions } from "./export.js";

export { StandardPiiMasker, NoopPiiMasker } from "./pii-masker.js";
