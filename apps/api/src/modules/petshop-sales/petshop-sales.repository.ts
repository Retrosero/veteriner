/**
 * @file PetshopSale (POS) repository (in-memory).
 * @module apps/api/modules/petshop-sales/petshop-sales.repository
 *
 * @description GOAL-064 petshop POS veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-064 (FAZ-6) petshop POS core
 */

import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  PetshopSaleLineRecord,
  PetshopSaleRecord,
} from "../../common/petshop-sales/petshop-sale.types.js";
import type {
  Prisma,
  PetshopSaleLineRecord as DbLine,
  PetshopSaleRecord as DbSale,
} from "@prisma/client";
import type {
  PetshopSaleStatus,
  PetshopPaymentMethod,
} from "@vetniva/contracts";

/** Sale patch tipi. */
export interface PetshopSalePatch {
  status?: PetshopSaleStatus | undefined;
  customerOwnerId?: string | null | undefined;
  customerPatientId?: string | null | undefined;
  paymentMethod?: PetshopPaymentMethod | undefined;
  paidAmount?: string | undefined;
  totalAmount?: string | undefined;
  globalDiscountPercent?: number | undefined;
  netAmount?: string | undefined;
  notes?: string | null | undefined;
  completedAt?: string | null | undefined;
  completedBy?: string | null | undefined;
  cancelledAt?: string | null | undefined;
  cancelledBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Line patch tipi. */
export interface PetshopSaleLinePatch {
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface PetshopSaleSearchFilters {
  status?: PetshopSaleStatus | undefined;
  customerOwnerId?: string | undefined;
  customerPatientId?: string | undefined;
  paymentMethod?: PetshopPaymentMethod | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class PetshopSalesRepository {
  /** key: id → header record. */
  private readonly byId = new Map<string, PetshopSaleRecord>();
  /** key: id → line record. */
  private readonly lineById = new Map<string, PetshopSaleLineRecord>();
  /** key: saleId → lineId[]. */
  private readonly linesBySale = new Map<string, string[]>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  /** Her tenant için line id counter. */
  private readonly lineCounters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  public nextId(tenantId: string): string {
    if (this.prisma) return `ps-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `ps-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public nextLineId(tenantId: string): string {
    if (this.prisma) return `psl-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.lineCounters.get(tenantId) ?? 0) + 1;
    this.lineCounters.set(tenantId, n);
    return `psl-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: PetshopSaleRecord): PetshopSaleRecord {
    this.byId.set(record.id, record);
    this.linesBySale.set(record.id, []);
    return record;
  }
  public async persistSaleWithLines(
    sale: PetshopSaleRecord,
    lines: PetshopSaleLineRecord[],
  ): Promise<void> {
    if (!this.prisma) {
      this.insert(sale);
      for (const line of lines) this.insertLine(line);
      return;
    }
    await this.inTenant(sale.tenantId, async (tx) => {
      await tx.petshopSaleRecord.create({ data: this.saleData(sale) });
      if (lines.length)
        await tx.petshopSaleLineRecord.createMany({
          data: lines.map((line) => this.lineData(line)),
        });
    });
  }
  public async persistedById(
    tenantId: string,
    id: string,
  ): Promise<PetshopSaleRecord | null> {
    if (!this.prisma) return this.findById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.petshopSaleRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.mapSale(row) : null;
  }
  public async persistedLines(
    tenantId: string,
    saleId: string,
  ): Promise<PetshopSaleLineRecord[]> {
    if (!this.prisma) return this.listLinesBySale(tenantId, saleId);
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.petshopSaleLineRecord.findMany({
        where: { tenantId, saleId },
        orderBy: { createdAt: "asc" },
      }),
    );
    return rows.map((row) => this.mapLine(row));
  }
  public async persistedSearch(
    tenantId: string,
    filters: PetshopSaleSearchFilters,
  ): Promise<{ items: PetshopSaleRecord[]; total: number }> {
    if (!this.prisma) return this.search(tenantId, filters);
    const where: Prisma.PetshopSaleRecordWhereInput = {
      tenantId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.customerOwnerId
        ? { customerOwnerId: filters.customerOwnerId }
        : {}),
      ...(filters.customerPatientId
        ? { customerPatientId: filters.customerPatientId }
        : {}),
      ...(filters.paymentMethod
        ? { paymentMethod: filters.paymentMethod }
        : {}),
      ...(filters.search?.trim()
        ? {
            OR: [
              { id: { contains: filters.search.trim() } },
              {
                notes: { contains: filters.search.trim(), mode: "insensitive" },
              },
            ],
          }
        : {}),
    };
    return this.inTenant(tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.petshopSaleRecord.findMany({
          where,
          orderBy: { createdAt: filters.sort ?? "desc" },
          skip: filters.offset,
          take: filters.limit,
        }),
        tx.petshopSaleRecord.count({ where }),
      ]);
      return { items: items.map((row) => this.mapSale(row)), total };
    });
  }
  public async persistedUpdate(
    tenantId: string,
    id: string,
    patch: PetshopSalePatch,
  ): Promise<PetshopSaleRecord | null> {
    if (!this.prisma) return this.update(tenantId, id, patch);
    const data: Prisma.PetshopSaleRecordUpdateManyMutationInput = {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.customerOwnerId !== undefined
        ? { customerOwnerId: patch.customerOwnerId }
        : {}),
      ...(patch.customerPatientId !== undefined
        ? { customerPatientId: patch.customerPatientId }
        : {}),
      ...(patch.paymentMethod !== undefined
        ? { paymentMethod: patch.paymentMethod }
        : {}),
      ...(patch.paidAmount !== undefined
        ? { paidAmount: patch.paidAmount }
        : {}),
      ...(patch.totalAmount !== undefined
        ? { totalAmount: patch.totalAmount }
        : {}),
      ...(patch.globalDiscountPercent !== undefined
        ? { globalDiscountPercent: patch.globalDiscountPercent }
        : {}),
      ...(patch.netAmount !== undefined ? { netAmount: patch.netAmount } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.completedAt !== undefined
        ? {
            completedAt: patch.completedAt ? new Date(patch.completedAt) : null,
          }
        : {}),
      ...(patch.completedBy !== undefined
        ? { completedBy: patch.completedBy }
        : {}),
      ...(patch.cancelledAt !== undefined
        ? {
            cancelledAt: patch.cancelledAt ? new Date(patch.cancelledAt) : null,
          }
        : {}),
      ...(patch.cancelledBy !== undefined
        ? { cancelledBy: patch.cancelledBy }
        : {}),
      ...(patch.cancelReason !== undefined
        ? { cancelReason: patch.cancelReason }
        : {}),
      ...(patch.updatedAt !== undefined
        ? { updatedAt: new Date(patch.updatedAt) }
        : {}),
    };
    const r = await this.inTenant(tenantId, (tx) =>
      tx.petshopSaleRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return r.count ? this.persistedById(tenantId, id) : null;
  }
  public async persistedReplaceLines(
    tenantId: string,
    saleId: string,
    lines: PetshopSaleLineRecord[],
  ): Promise<void> {
    if (!this.prisma) {
      this.linesBySale.set(saleId, []);
      for (const line of lines) this.insertLine(line);
      return;
    }
    await this.inTenant(tenantId, async (tx) => {
      await tx.petshopSaleLineRecord.deleteMany({
        where: { tenantId, saleId },
      });
      if (lines.length)
        await tx.petshopSaleLineRecord.createMany({
          data: lines.map((line) => this.lineData(line)),
        });
    });
  }

  public insertLine(record: PetshopSaleLineRecord): PetshopSaleLineRecord {
    this.lineById.set(record.id, record);
    const list = this.linesBySale.get(record.saleId) ?? [];
    list.push(record.id);
    this.linesBySale.set(record.saleId, list);
    return record;
  }

  public findById(tenantId: string, id: string): PetshopSaleRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findLineById(
    tenantId: string,
    lineId: string,
  ): PetshopSaleLineRecord | null {
    const rec = this.lineById.get(lineId);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public listLinesBySale(
    tenantId: string,
    saleId: string,
  ): PetshopSaleLineRecord[] {
    const ids = this.linesBySale.get(saleId) ?? [];
    const out: PetshopSaleLineRecord[] = [];
    for (const id of ids) {
      const rec = this.lineById.get(id);
      if (rec && rec.tenantId === tenantId) out.push(rec);
    }
    return out;
  }

  public update(
    tenantId: string,
    id: string,
    patch: PetshopSalePatch,
  ): PetshopSaleRecord | null {
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
    patch: PetshopSaleLinePatch,
  ): PetshopSaleLineRecord | null {
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

  public search(
    tenantId: string,
    filters: PetshopSaleSearchFilters,
  ): { items: PetshopSaleRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();

    const all: PetshopSaleRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (
        filters.customerOwnerId &&
        rec.customerOwnerId !== filters.customerOwnerId
      )
        continue;
      if (
        filters.customerPatientId &&
        rec.customerPatientId !== filters.customerPatientId
      )
        continue;
      if (filters.paymentMethod && rec.paymentMethod !== filters.paymentMethod)
        continue;
      if (needle) {
        const hay = [rec.id, rec.notes ?? ""].join(" ").toLowerCase();
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
    this.linesBySale.clear();
    this.counters.clear();
    this.lineCounters.clear();
  }
  private saleData(
    s: PetshopSaleRecord,
  ): Prisma.PetshopSaleRecordUncheckedCreateInput {
    return {
      ...s,
      completedAt: s.completedAt ? new Date(s.completedAt) : null,
      cancelledAt: s.cancelledAt ? new Date(s.cancelledAt) : null,
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
    };
  }
  private lineData(
    l: PetshopSaleLineRecord,
  ): Prisma.PetshopSaleLineRecordUncheckedCreateInput {
    return {
      ...l,
      createdAt: new Date(l.createdAt),
      updatedAt: new Date(l.updatedAt),
    };
  }
  private mapSale(r: DbSale): PetshopSaleRecord {
    return {
      ...r,
      status: r.status as PetshopSaleStatus,
      paymentMethod: r.paymentMethod as PetshopPaymentMethod,
      completedAt: r.completedAt?.toISOString() ?? null,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  private mapLine(r: DbLine): PetshopSaleLineRecord {
    return {
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  private async inTenant<T>(
    tenantId: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;
      return callback(tx);
    });
  }
}
