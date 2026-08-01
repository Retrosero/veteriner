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

import { Injectable } from "@nestjs/common";

import type {
  SupplierType,
  SupplierRecord,
} from "../../common/suppliers/supplier.types.js";

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

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `sup-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: SupplierRecord): SupplierRecord {
    this.byId.set(record.id, record);
    this.byCode.set(this.codeKey(record.tenantId, record.code), record.id);
    return record;
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
}
