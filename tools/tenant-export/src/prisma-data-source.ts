/**
 * @file Prisma-backed TenantDataSource implementasyonu.
 * @module @vetniva/tenant-export/prisma-data-source
 *
 * @description GOAL-125 (FAZ-12) tenant veri dışa aktarma kapsamında
 * production-grade veri kaynağı. `TenantDataSource` interface'ini
 * implemente eder; her dataset için Prisma modeline `withContext`
 * kalıbıyla (RLS transaction-yerel context) bağlanır.
 *
 * Geriye dönük uyumluluk: Mevcut `InMemoryTenantDataSource` ve
 * `TenantDataSource` sözleşmesi korunur. Bu sınıf sadece
 * opsiyonel bir adapter; CLI'lar ve `exportTenantData` core
 * mantığı değişmez.
 *
 * Akış:
 *   1. Her dataset için `prisma.$transaction` açılır.
 *   2. Transaction içinde `set_config('app.tenant_id', tenantId, true)`
 *      ve `set_config('app.is_superadmin', 'false', true)` çağrılır
 *      (RLS USING clause bu session değişkenlerine göre filtreler).
 *   3. `findMany({ where: { tenantId } })` defense-in-depth olarak
 *      hem RLS hem uygulama katmanında tenant filtresi uygular.
 *   4. Prisma Decimal ve Date alanları JSON uyumlu string/ISO'ya
 *      dönüştürülür (export pipeline'ı ham obje bekler).
 *
 * @security Tenant bilgisi yalnızca constructor veya
 *   `listForTenant` çağrısından alınır. Body/query'den
 *   tenantId kabul edilmez. Cross-tenant kaçak RLS + uygulama
 *   katmanı çift kontrolüyle engellenir.
 *
 * @since GOAL-125 (FAZ-12) tenant veri dışa aktarma
 */

import type { PrismaClient, Prisma } from "@prisma/client";

import type { ExportDataset, TenantDataSource } from "./types.js";

/**
 * Decimal ve Date gibi Prisma-özgü tipleri JSON uyumlu hale
 * getiren yardımcı tip. Dışa aktarılan veri JSON'a stringify
 * edileceği için Decimal string'e, Date ISO'ya dönüşür.
 */
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { [k: string]: JsonValue } | Array<JsonValue>;

/**
 * Bir satırı Prisma-özgü tiplerden arındırıp ham JSON objesine
 * çevirir. Decimal/BigInt/Date gibi tipleri string/ISO'ya dönüştürür;
 * nested objeler ve diziler recursive işlenir.
 */
function toPlainJson(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    if (typeof value === "number" && !Number.isFinite(value)) return null;
    return value;
  }
  // Prisma Decimal
  if (
    typeof value === "object" &&
    value !== null &&
    "toFixed" in value &&
    typeof (value as { toFixed?: unknown }).toFixed === "function"
  ) {
    try {
      return (value as { toFixed: (d?: number) => string }).toFixed(4);
    } catch {
      return String(value);
    }
  }
  // Date
  if (value instanceof Date) {
    return value.toISOString();
  }
  // Array
  if (Array.isArray(value)) {
    return value.map((v) => toPlainJson(v)) as JsonValue;
  }
  // Object
  if (typeof value === "object") {
    const out: { [k: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toPlainJson(v);
    }
    return out;
  }
  return String(value);
}

/**
 * Prisma-backed tenant data source. Her dataset için uygun
 * Prisma modeline tenant-scoped sorgu atar; RLS context'i
 * transaction içinde set eder.
 */
export class PrismaTenantDataSource implements TenantDataSource {
  private readonly prisma: PrismaClient;

  public constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  public async listForTenant(
    tenantId: string,
    dataset: ExportDataset,
  ): Promise<ReadonlyArray<Record<string, unknown>>> {
    if (!tenantId) {
      throw new Error("listForTenant: tenantId zorunlu");
    }
    return this.withContext({ tenantId }, async (tx) => {
      const rows = await this.query(tx, dataset, tenantId);
      return rows.map((r) => toPlainJson(r) as Record<string, unknown>);
    });
  }

  /**
   * Transaction-yerel RLS context'i kurar ve verilen fonksiyonu
   * transaction içinde çalıştırır. `set_config(..., true)` ile
   * session-level değil transaction-level değişken set edilir;
   * aynı bağlam içindeki sorgular RLS policy'sini doğru uygular.
   */
  private async withContext<T>(
    actor: { tenantId: string; isSuperadmin?: boolean },
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const isSuper = actor.isSuperadmin ? "true" : "false";
    const tenantId = actor.tenantId;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', ${isSuper}, true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  /**
   * Dataset için uygun Prisma modelini seçer ve tenant-scoped
   * sorgu atar. `where: { tenantId }` defense-in-depth olarak
   * uygulanır; RLS policy aynı bağlamda WHERE cümlesini zaten
   * sınırlandırır.
   */
  private async query(
    tx: Prisma.TransactionClient,
    dataset: ExportDataset,
    tenantId: string,
  ): Promise<ReadonlyArray<Record<string, unknown>>> {
    switch (dataset) {
      case "owners":
        return tx.owner.findMany({ where: { tenantId } });
      case "patients":
        return tx.patient.findMany({ where: { tenantId } });
      case "examinations":
        return tx.examination.findMany({ where: { tenantId } });
      case "vaccinations":
        // Şemada karşılığı `vaccine_applications` tablosu
        // (VaccineApplicationRecord modeli).
        return tx.vaccineApplicationRecord.findMany({
          where: { tenantId },
        });
      case "prescriptions":
        return tx.prescriptionRecord.findMany({ where: { tenantId } });
      case "sales":
        // Hem petshop hem clinic sale'leri tek "sales" dataset'i
        // altında topluyoruz; pilot için clinic yeterli.
        return tx.clinicSaleRecord.findMany({ where: { tenantId } });
      case "payments":
        return tx.paymentRecord.findMany({ where: { tenantId } });
      case "lab_results":
        return tx.labResult.findMany({ where: { tenantId } });
      case "imaging_orders":
        return tx.imagingOrder.findMany({ where: { tenantId } });
      case "files":
        return tx.fileMeta.findMany({ where: { tenantId } });
      default: {
        // Tüketilmeyen durum; TypeScript exhaustiveness kontrolü.
        const _exhaustive: never = dataset;
        throw new Error(
          `prisma-data-source: bilinmeyen dataset ${_exhaustive as string}`,
        );
      }
    }
  }
}
