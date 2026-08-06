/**
 * @file Supplier (tedarikçi) repository (in-memory).
 * @module apps/api/modules/suppliers/suppliers.repository
 *
 * @description GOAL-062 tedarikçi kataloğu veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 * Production'a geçişte Prisma repository'si ile değiştirilecek (API
 * sözleşmesi sabit kalır).
 *
 * Üç yardımcı index tutulur:
 * - `byId`   — id → record (tenant scope'lu erişim).
 * - `byCode` — tenantId|code → record id (code unique per tenant).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
 */

import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  SupplierType,
  SupplierRecord,
} from "../../common/suppliers/supplier.types.js";
import type { Prisma, SupplierRecord as DbSupplier } from "@prisma/client";

/** Patch tipi: kısmi güncelleme için izin verilen alanlar. */
export interface SupplierPatch {
  name?: string | undefined;
  code?: string | undefined;
  type?: SupplierType | undefined;
  taxId?: string | null | undefined;
  contactName?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  address?: string | null | undefined;
  notes?: string | null | undefined;
  active?: boolean | undefined;
  updatedAt?: string | undefined;
  archivedAt?: string | null | undefined;
  archivedBy?: string | null | undefined;
  archiveReason?: string | null | undefined;
}

/** Arama filtreleri. */
export interface SupplierSearchFilters {
  type?: SupplierType | undefined;
  active?: boolean | undefined;
  search?: string | undefined;
  includeArchived?: boolean | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class SuppliersRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, SupplierRecord>();
  /** key: tenantId|code → record id (code unique per tenant). */
  private readonly byCode = new Map<string, string>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  public nextId(tenantId: string): string {
    if (this.prisma) return `sup-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `sup-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: SupplierRecord): SupplierRecord {
    this.byId.set(record.id, record);
    this.byCode.set(this.codeKey(record.tenantId, record.code), record.id);
    return record;
  }

  public async persist(record: SupplierRecord): Promise<SupplierRecord> {
    if (!this.prisma) return this.insert(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.supplierRecord.create({
        data: {
          ...record,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt),
          archivedAt: record.archivedAt ? new Date(record.archivedAt) : null,
        },
      }),
    );
    return this.map(row);
  }
  public async persistedById(
    tenantId: string,
    id: string,
  ): Promise<SupplierRecord | null> {
    if (!this.prisma) return this.findById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.supplierRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.map(row) : null;
  }
  public async persistedByCode(
    tenantId: string,
    code: string,
  ): Promise<SupplierRecord | null> {
    if (!this.prisma) return this.findByCode(tenantId, code);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.supplierRecord.findUnique({
        where: { tenantId_code: { tenantId, code } },
      }),
    );
    return row ? this.map(row) : null;
  }
  public async persistedSearch(
    tenantId: string,
    filters: SupplierSearchFilters,
  ): Promise<{ items: SupplierRecord[]; total: number }> {
    if (!this.prisma) return this.search(tenantId, filters);
    const where: Prisma.SupplierRecordWhereInput = {
      tenantId,
      ...(!filters.includeArchived ? { archivedAt: null } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      ...(filters.search?.trim()
        ? {
            OR: ["name", "code", "taxId", "email"].map((field) => ({
              [field]: {
                contains: filters.search!.trim(),
                mode: "insensitive",
              },
            })),
          }
        : {}),
    };
    return this.inTenant(tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.supplierRecord.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: filters.offset,
          take: filters.limit,
        }),
        tx.supplierRecord.count({ where }),
      ]);
      return { items: items.map((row) => this.map(row)), total };
    });
  }
  public async persistedUpdate(
    tenantId: string,
    id: string,
    patch: SupplierPatch,
  ): Promise<SupplierRecord | null> {
    if (!this.prisma) return this.update(tenantId, id, patch);
    const data: Prisma.SupplierRecordUpdateManyMutationInput = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.code !== undefined ? { code: patch.code } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.taxId !== undefined ? { taxId: patch.taxId } : {}),
      ...(patch.contactName !== undefined
        ? { contactName: patch.contactName }
        : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.address !== undefined ? { address: patch.address } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.updatedAt !== undefined
        ? { updatedAt: new Date(patch.updatedAt) }
        : {}),
      ...(patch.archivedAt !== undefined
        ? { archivedAt: patch.archivedAt ? new Date(patch.archivedAt) : null }
        : {}),
      ...(patch.archivedBy !== undefined
        ? { archivedBy: patch.archivedBy }
        : {}),
      ...(patch.archiveReason !== undefined
        ? { archiveReason: patch.archiveReason }
        : {}),
    };
    const updated = await this.inTenant(tenantId, (tx) =>
      tx.supplierRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return updated.count ? this.persistedById(tenantId, id) : null;
  }

  public findById(tenantId: string, id: string): SupplierRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /** Code'a göre tenant-scoped arama. */
  public findByCode(tenantId: string, code: string): SupplierRecord | null {
    const id = this.byCode.get(this.codeKey(tenantId, code));
    if (!id) return null;
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Kısmi güncelleme. `undefined` alanlar atlanır; `null` alanlar
   * açıkça null yapılır. Code değişirse index güncellenir.
   */
  public update(
    tenantId: string,
    id: string,
    patch: SupplierPatch,
  ): SupplierRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    if (patch.code !== undefined && patch.code !== rec.code) {
      this.byCode.delete(this.codeKey(rec.tenantId, rec.code));
      this.byCode.set(this.codeKey(rec.tenantId, patch.code), rec.id);
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.byId.set(id, rec);
    return rec;
  }

  /**
   * Tenant-scoped arama. Arşivlenmiş kayıtlar `includeArchived=true`
   * olmadıkça dönmez. `active` filtresi default=true ise arşivlenmişleri
   * yine de dışlar.
   */
  public search(
    tenantId: string,
    filters: SupplierSearchFilters,
  ): { items: SupplierRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();

    const all: SupplierRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (!filters.includeArchived && rec.archivedAt !== null) continue;
      if (filters.type && rec.type !== filters.type) continue;
      if (filters.active !== undefined && rec.active !== filters.active)
        continue;
      if (needle) {
        const hay = [rec.name, rec.code, rec.taxId ?? "", rec.email ?? ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      all.push(rec);
    }
    // En yeni kayıt üstte.
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.byCode.clear();
    this.counters.clear();
  }

  /** Record oluşturmak için yardımcı (service kullanır). */
  public toRecord(args: SupplierRecord): SupplierRecord {
    return { ...args };
  }

  private codeKey(tenantId: string, code: string): string {
    return `${tenantId}|${code}`;
  }
  private map(row: DbSupplier): SupplierRecord {
    return {
      ...row,
      type: row.type as SupplierType,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
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
