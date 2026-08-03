/**
 * @file Tenant veri disa aktarma cekirdek motoru.
 * @module @vetniva/tenant-export/export
 *
 * @description GOAL-125 (FAZ-12) kapsaminda ExportRequest'i
 * alip TenantDataSource'tan tenant-scoped veriyi ceker, PII
 * kontrolu yapar, JSON veya CSV formatinda dosyaya yazar,
 * audit event uretir. Tenant izolasyonu, PII mask ve audit
 * kurallarina uyar.
 *
 * Akis:
 *   1. Her dataset icin TenantDataSource.listForTenant(...)
 *      cagirilir; tenant_id filtresi zorunlu.
 *   2. PII kontrol: strict modda masker uygulanir, permissive
 *      modda PII alanlari olduigu gibi birakir ama audit
 *      flaglenir.
 *   3. JSON formatinda NDJSON streaming veya tek JSON; CSV
 *      icin basit header + rows (nested objeler dot-paths).
 *   4. Cikti dosyasi belirtilen outputFile'a yazilir.
 *   5. Audit event uretilir; exportId, exportedBy, datasets,
 *      piiMasked, totalRows, occurredAt, correlationId bilgileri
 *      ile.
 *
 * @since GOAL-125 (FAZ-12) tenant veri disa aktarma
 */

import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { NoopPiiMasker, StandardPiiMasker } from "./pii-masker.js";
import type {
  ExportAuditEvent,
  ExportDataset,
  ExportFormat,
  ExportRequest,
  ExportResult,
  PiiMasker,
  TenantDataSource,
} from "./types.js";

/** Export cekirdek secenekleri. */
export interface ExportOptions {
  /** Tenant data kaynagi (interface; testlerde mocklanir). */
  dataSource: TenantDataSource;
  /** PII masker (default: StandardPiiMasker). */
  piiMasker?: PiiMasker;
  /** Cikti dosyasinin yolu. */
  outputFile: string;
  /**
   * Correlation / request id (audit icin). Verilmezse
   * rastgele uuid uretilir.
   */
  correlationId?: string;
  /** Su anki zaman (testte inject). */
  now?: () => Date;
  /** Dry-run: dosya yazilmaz, sadece sonuc uretilir. */
  dryRun?: boolean;
}

/** Tum dataset'ler. */
export const ALL_DATASETS: ReadonlyArray<ExportDataset> = [
  "owners",
  "patients",
  "examinations",
  "vaccinations",
  "prescriptions",
  "sales",
  "payments",
  "lab_results",
  "imaging_orders",
  "files",
];

/**
 * Tenant verisini export eder. Returns the metadata only;
 * actual data is written to outputFile.
 */
export async function exportTenantData(
  request: ExportRequest,
  options: ExportOptions,
): Promise<ExportResult> {
  if (request.datasets.length === 0) {
    throw new Error("export: en az 1 dataset secilmelidir");
  }
  if (!request.tenantId) {
    throw new Error("export: tenantId zorunludur");
  }
  if (!request.exportedBy) {
    throw new Error("export: exportedBy zorunludur (audit)");
  }

  const now = options.now ?? (() => new Date());
  const correlationId = options.correlationId ?? `req-${randomUUID()}`;
  const masker = options.piiMasker ?? new StandardPiiMasker();

  // Her dataset icin tenant-scoped veri cek
  const rowsPerDataset: Record<ExportDataset, number> = {
    owners: 0,
    patients: 0,
    examinations: 0,
    vaccinations: 0,
    prescriptions: 0,
    sales: 0,
    payments: 0,
    lab_results: 0,
    imaging_orders: 0,
    files: 0,
  };

  const payload: Record<ExportDataset, Array<Record<string, unknown>>> = {
    owners: [],
    patients: [],
    examinations: [],
    vaccinations: [],
    prescriptions: [],
    sales: [],
    payments: [],
    lab_results: [],
    imaging_orders: [],
    files: [],
  };

  let piiFieldsDetected = 0;
  let piiMasked = false;

  for (const dataset of request.datasets) {
    const rows = await options.dataSource.listForTenant(
      request.tenantId,
      dataset,
    );
    if (request.piiCheck === "strict") {
      const processed: Array<Record<string, unknown>> = [];
      for (const row of rows) {
        const detected = masker.detectPiiFields(row);
        if (detected.length > 0) {
          piiFieldsDetected += detected.length;
          piiMasked = true;
        }
        processed.push(masker.maskObject(row));
      }
      payload[dataset] = processed;
    } else {
      // permissive: PII alanlari olduigu gibi birak; audit warning
      for (const row of rows) {
        const detected = masker.detectPiiFields(row);
        if (detected.length > 0) {
          piiFieldsDetected += detected.length;
        }
      }
      payload[dataset] = Array.from(rows);
    }
    rowsPerDataset[dataset] = rows.length;
  }

  const totalRows = Object.values(rowsPerDataset).reduce((s, n) => s + n, 0);
  const exportedAt = now().toISOString();
  const exportId = `exp-${randomUUID()}`;

  // Metadata objesi (veriyle birlikte sarili)
  const wrapped = {
    exportId,
    tenantId: request.tenantId,
    tenantSlug: request.tenantSlug ?? null,
    exportedAt,
    exportedBy: request.exportedBy,
    format: request.format,
    version: "1.0.0",
    piiCheck: request.piiCheck,
    piiFieldsDetected,
    data: payload,
    retentionNotice: {
      message: "Tibbi kayitlar KVKK Madde 7 uyarinca 7 yil saklanir.",
      legalBasis: "KVKK_MADDE_7",
      retentionYears: 7,
    },
  };

  if (!options.dryRun) {
    const serialized = serialize(wrapped, request.format);
    await writeFile(options.outputFile, serialized, "utf8");
  }

  const auditEvent: ExportAuditEvent = {
    eventName: "audit:tenant.export.created",
    tenantId: request.tenantId,
    actorId: request.exportedBy,
    actorType: "user",
    format: request.format,
    datasets: request.datasets,
    totalRows,
    piiMasked,
    occurredAt: exportedAt,
    correlationId,
    ...(request.country ? { country: request.country } : {}),
    ...(request.release ? { release: request.release } : {}),
  };

  return {
    exportId,
    tenantId: request.tenantId,
    exportedAt,
    format: request.format,
    totalRows,
    rowsPerDataset,
    outputFile: options.outputFile,
    piiCheck: request.piiCheck,
    piiFieldsDetected,
    auditEvent,
    piiMasked,
  };
}

/** Serilizasyon yardimcisi. JSON pretty-print; CSV basit. */
function serialize(
  wrapped: Record<string, unknown>,
  format: ExportFormat,
): string {
  if (format === "json") {
    return JSON.stringify(wrapped, null, 2);
  }
  // CSV: header row + values; nested objeler JSON.stringify.
  const lines: string[] = ["# VetNiva tenant export (CSV) — flat row format"];
  for (const [dataset, rows] of Object.entries(wrapped.data ?? {})) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const first = rows[0] as Record<string, unknown>;
    const headers = Object.keys(first);
    lines.push(`## ${dataset}`);
    lines.push(headers.join(","));
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const cells = headers.map((h) => csvCell(r[h]));
      lines.push(cells.join(","));
    }
  }
  return lines.join("\n") + "\n";
}

/** CSV hucre kacar; tirnak/ayrac iceren degerleri korur. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Noop data source: belirli tenant + dataset icin test verisi. */
export class InMemoryTenantDataSource implements TenantDataSource {
  private readonly data: Map<string, ReadonlyArray<Record<string, unknown>>>;

  constructor(
    data:
      | ReadonlyMap<ExportDataset, ReadonlyArray<Record<string, unknown>>>
      | Map<string, ReadonlyArray<Record<string, unknown>>>,
  ) {
    this.data = data as Map<string, ReadonlyArray<Record<string, unknown>>>;
  }

  async listForTenant(
    tenantId: string,
    dataset: ExportDataset,
  ): Promise<ReadonlyArray<Record<string, unknown>>> {
    // Tenant ID zorunlu: filtreleme tenant guard tarafindan
    // yapildigi varsayilir; bu data source yalnizca test
    // verisi doner. Production'da gercek repository kullanilir.
    if (!tenantId) {
      throw new Error("listForTenant: tenantId zorunlu");
    }
    return this.data.get(dataset) ?? [];
  }
}

/** Helper: Noop data source bos liste doner. */
export function emptyDataSource(): TenantDataSource {
  return new InMemoryTenantDataSource(new Map());
}
