/**
 * @file PurchaseOrder (satın alma siparişi) repository (in-memory).
 * @module apps/api/modules/purchase-orders/purchase-orders.repository
 *
 * @description GOAL-062 satın alma siparişi veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 * Production'a geçişte Prisma repository'si ile değiştirilecek (API
 * sözleşmesi sabit kalır).
 *
 * İndeksler:
 * - `byId`        — id → record (header).
 * - `lineById`    — lineId → record (line).
 * - `linesByOrder`— orderId → lineId[].
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
 */

import { Injectable, Optional } from "@nestjs/common";
import type { Prisma, PurchaseOrderLineRecord as DbLine, PurchaseOrderRecord as DbOrder } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  PurchaseOrderLineRecord,
  PurchaseOrderRecord,
} from "../../common/purchase-orders/purchase-order.types.js";
import type { PurchaseOrderStatus } from "@vetniva/contracts";

/** Sipariş patch tipi. */
export interface PurchaseOrderPatch {
  status?: PurchaseOrderStatus | undefined;
  supplierId?: string | undefined;
  branchId?: string | null | undefined;
  currency?: string | undefined;
  expectedAt?: string | null | undefined;
  notes?: string | null | undefined;
  approvedAt?: string | null | undefined;
  approvedBy?: string | null | undefined;
  receivedAt?: string | null | undefined;
  receivedBy?: string | null | undefined;
  cancelledAt?: string | null | undefined;
  cancelledBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  totalAmount?: string | undefined;
  updatedAt?: string | undefined;
}

/** Satır patch tipi. */
export interface PurchaseOrderLinePatch {
  receivedQuantity?: string | undefined;
  unitCost?: string | null | undefined;
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface PurchaseOrderSearchFilters {
  status?: PurchaseOrderStatus | undefined;
  supplierId?: string | undefined;
  branchId?: string | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class PurchaseOrdersRepository {
  /** key: id → header record. */
  private readonly byId = new Map<string, PurchaseOrderRecord>();
  /** key: id → line record. */
  private readonly lineById = new Map<string, PurchaseOrderLineRecord>();
  /** key: orderId → lineId listesi (sıra korunur). */
  private readonly linesByOrder = new Map<string, string[]>();
  /** Her tenant için id counter (header). */
  private readonly counters = new Map<string, number>();
  /** Her tenant için id counter (line). */
  private readonly lineCounters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  public nextId(tenantId: string): string {
    if (this.prisma) return `po-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `po-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public nextLineId(tenantId: string): string {
    if (this.prisma) return `pol-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.lineCounters.get(tenantId) ?? 0) + 1;
    this.lineCounters.set(tenantId, n);
    return `pol-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: PurchaseOrderRecord): PurchaseOrderRecord {
    this.byId.set(record.id, record);
    this.linesByOrder.set(record.id, []);
    return record;
  }

  public async persistOrderWithLines(order: PurchaseOrderRecord, lines: PurchaseOrderLineRecord[]): Promise<void> {
    if (!this.prisma) { this.insert(order); for (const line of lines) this.insertLine(line); return; }
    await this.inTenant(order.tenantId, async (tx) => { await tx.purchaseOrderRecord.create({ data: this.orderCreateData(order) }); if (lines.length) await tx.purchaseOrderLineRecord.createMany({ data: lines.map((line) => this.lineCreateData(line)) }); });
  }
  public async persistedById(tenantId: string, id: string): Promise<PurchaseOrderRecord | null> { if (!this.prisma) return this.findById(tenantId, id); const row = await this.inTenant(tenantId, (tx) => tx.purchaseOrderRecord.findFirst({ where: { tenantId, id } })); return row ? this.mapOrder(row) : null; }
  public async persistedLines(tenantId: string, orderId: string): Promise<PurchaseOrderLineRecord[]> { if (!this.prisma) return this.listLinesByOrder(tenantId, orderId); const rows = await this.inTenant(tenantId, (tx) => tx.purchaseOrderLineRecord.findMany({ where: { tenantId, purchaseOrderId: orderId }, orderBy: { createdAt: "asc" } })); return rows.map((row) => this.mapLine(row)); }
  public async persistedSearch(tenantId: string, filters: PurchaseOrderSearchFilters): Promise<{ items: PurchaseOrderRecord[]; total: number }> { if (!this.prisma) return this.search(tenantId, filters); const where: Prisma.PurchaseOrderRecordWhereInput = { tenantId, ...(filters.status ? { status: filters.status } : {}), ...(filters.supplierId ? { supplierId: filters.supplierId } : {}), ...(filters.branchId ? { branchId: filters.branchId } : {}), ...(filters.search?.trim() ? { OR: [{ id: { contains: filters.search.trim() } }, { supplierId: { contains: filters.search.trim() } }, { notes: { contains: filters.search.trim(), mode: "insensitive" } }] } : {}) }; return this.inTenant(tenantId, async (tx) => { const [items,total] = await Promise.all([tx.purchaseOrderRecord.findMany({ where, orderBy: { createdAt: filters.sort ?? "desc" }, skip: filters.offset, take: filters.limit }), tx.purchaseOrderRecord.count({ where })]); return { items: items.map((row) => this.mapOrder(row)), total }; }); }
  public async persistedUpdate(tenantId: string, id: string, patch: PurchaseOrderPatch): Promise<PurchaseOrderRecord | null> { if (!this.prisma) return this.update(tenantId,id,patch); const data: Prisma.PurchaseOrderRecordUpdateManyMutationInput = { ...(patch.status !== undefined ? { status: patch.status } : {}), ...(patch.supplierId !== undefined ? { supplierId: patch.supplierId } : {}), ...(patch.branchId !== undefined ? { branchId: patch.branchId } : {}), ...(patch.currency !== undefined ? { currency: patch.currency } : {}), ...(patch.expectedAt !== undefined ? { expectedAt: patch.expectedAt ? new Date(patch.expectedAt) : null } : {}), ...(patch.notes !== undefined ? { notes: patch.notes } : {}), ...(patch.approvedAt !== undefined ? { approvedAt: patch.approvedAt ? new Date(patch.approvedAt) : null } : {}), ...(patch.approvedBy !== undefined ? { approvedBy: patch.approvedBy } : {}), ...(patch.receivedAt !== undefined ? { receivedAt: patch.receivedAt ? new Date(patch.receivedAt) : null } : {}), ...(patch.receivedBy !== undefined ? { receivedBy: patch.receivedBy } : {}), ...(patch.cancelledAt !== undefined ? { cancelledAt: patch.cancelledAt ? new Date(patch.cancelledAt) : null } : {}), ...(patch.cancelledBy !== undefined ? { cancelledBy: patch.cancelledBy } : {}), ...(patch.cancelReason !== undefined ? { cancelReason: patch.cancelReason } : {}), ...(patch.totalAmount !== undefined ? { totalAmount: patch.totalAmount } : {}), ...(patch.updatedAt !== undefined ? { updatedAt: new Date(patch.updatedAt) } : {}) }; const result = await this.inTenant(tenantId, (tx) => tx.purchaseOrderRecord.updateMany({ where: { tenantId,id }, data })); return result.count ? this.persistedById(tenantId,id) : null; }
  public async persistedUpdateLine(tenantId: string, lineId: string, patch: PurchaseOrderLinePatch): Promise<PurchaseOrderLineRecord | null> { if (!this.prisma) return this.updateLine(tenantId,lineId,patch); const data: Prisma.PurchaseOrderLineRecordUpdateManyMutationInput = { ...(patch.receivedQuantity !== undefined ? { receivedQuantity: patch.receivedQuantity } : {}), ...(patch.unitCost !== undefined ? { unitCost: patch.unitCost } : {}), ...(patch.notes !== undefined ? { notes: patch.notes } : {}), ...(patch.updatedAt !== undefined ? { updatedAt: new Date(patch.updatedAt) } : {}) }; const result = await this.inTenant(tenantId, (tx) => tx.purchaseOrderLineRecord.updateMany({where:{tenantId,id:lineId},data})); if (!result.count) return null; const row = await this.inTenant(tenantId, (tx) => tx.purchaseOrderLineRecord.findFirstOrThrow({where:{tenantId,id:lineId}})); return this.mapLine(row); }
  public async persistedReplaceLines(tenantId: string, orderId: string, lines: PurchaseOrderLineRecord[]): Promise<void> { if (!this.prisma) { this.linesByOrder.set(orderId, []); for (const line of lines) this.insertLine(line); return; } await this.inTenant(tenantId, async (tx) => { await tx.purchaseOrderLineRecord.deleteMany({ where: { tenantId, purchaseOrderId: orderId } }); if (lines.length) await tx.purchaseOrderLineRecord.createMany({ data: lines.map((line) => this.lineCreateData(line)) }); }); }

  public insertLine(record: PurchaseOrderLineRecord): PurchaseOrderLineRecord {
    this.lineById.set(record.id, record);
    const list = this.linesByOrder.get(record.purchaseOrderId) ?? [];
    list.push(record.id);
    this.linesByOrder.set(record.purchaseOrderId, list);
    return record;
  }

  public findById(tenantId: string, id: string): PurchaseOrderRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findLineById(
    tenantId: string,
    lineId: string,
  ): PurchaseOrderLineRecord | null {
    const rec = this.lineById.get(lineId);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findLineByOrderAndId(
    tenantId: string,
    orderId: string,
    lineId: string,
  ): PurchaseOrderLineRecord | null {
    const rec = this.findLineById(tenantId, lineId);
    if (!rec) return null;
    if (rec.purchaseOrderId !== orderId) return null;
    return rec;
  }

  public listLinesByOrder(
    tenantId: string,
    orderId: string,
  ): PurchaseOrderLineRecord[] {
    const ids = this.linesByOrder.get(orderId) ?? [];
    const out: PurchaseOrderLineRecord[] = [];
    for (const id of ids) {
      const rec = this.lineById.get(id);
      if (rec && rec.tenantId === tenantId) out.push(rec);
    }
    return out;
  }

  public update(
    tenantId: string,
    id: string,
    patch: PurchaseOrderPatch,
  ): PurchaseOrderRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.byId.set(id, rec);
    return rec;
  }

  public updateLine(
    tenantId: string,
    lineId: string,
    patch: PurchaseOrderLinePatch,
  ): PurchaseOrderLineRecord | null {
    const rec = this.findLineById(tenantId, lineId);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.lineById.set(lineId, rec);
    return rec;
  }

  /**
   * Tenant-scoped arama. En yeni kayıt üstte (default desc).
   */
  public search(
    tenantId: string,
    filters: PurchaseOrderSearchFilters,
  ): { items: PurchaseOrderRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();

    const all: PurchaseOrderRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.supplierId && rec.supplierId !== filters.supplierId) continue;
      if (filters.branchId && rec.branchId !== filters.branchId) continue;
      if (needle) {
        const hay = [rec.id, rec.supplierId, rec.notes ?? ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      all.push(rec);
    }
    const sort = filters.sort ?? "desc";
    all.sort((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.lineById.clear();
    this.linesByOrder.clear();
    this.counters.clear();
    this.lineCounters.clear();
  }
  private orderCreateData(order: PurchaseOrderRecord): Prisma.PurchaseOrderRecordUncheckedCreateInput { return { ...order, expectedAt: order.expectedAt ? new Date(order.expectedAt) : null, approvedAt: order.approvedAt ? new Date(order.approvedAt) : null, receivedAt: order.receivedAt ? new Date(order.receivedAt) : null, cancelledAt: order.cancelledAt ? new Date(order.cancelledAt) : null, createdAt: new Date(order.createdAt), updatedAt: new Date(order.updatedAt) }; }
  private lineCreateData(line: PurchaseOrderLineRecord): Prisma.PurchaseOrderLineRecordUncheckedCreateInput { return { ...line, createdAt: new Date(line.createdAt), updatedAt: new Date(line.updatedAt) }; }
  private mapOrder(row: DbOrder): PurchaseOrderRecord { return { ...row, status: row.status as PurchaseOrderStatus, currency: row.currency as PurchaseOrderRecord["currency"], expectedAt: row.expectedAt?.toISOString() ?? null, approvedAt: row.approvedAt?.toISOString() ?? null, receivedAt: row.receivedAt?.toISOString() ?? null, cancelledAt: row.cancelledAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
  private mapLine(row: DbLine): PurchaseOrderLineRecord { return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
  private async inTenant<T>(tenantId: string, callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> { if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı"); return this.prisma.$transaction(async (tx) => { await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`; await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`; return callback(tx); }); }
}
