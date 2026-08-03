/**
 * @file StockMovement (stok hareketi) repository (in-memory).
 * @module apps/api/modules/stock-movements/stock-movements.repository
 *
 * @description GOAL-063 (FAZ-6) stok hareketleri ve sayım veri erişim
 * katmanı. DB migration sonraya bırakıldı; tenant-scoped in-memory
 * Map'ler kullanılır. Production'a geçişte Prisma repository'si ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * Veri yapıları:
 * - `byId` — hareket ID → record.
 * - `byProduct` — productId → Set<movementId> (ürün bazlı arama).
 * - `byLot` — lotId → Set<movementId> (lot bazlı arama).
 * - `bySource` — sourceType|sourceId → Set<movementId> (üst kayıt
 *   bağlantısı; ör. purchase order receive).
 * - `byReversal` — reversesMovementId → Set<movementId> (ters kayıt
 *   zinciri sorgusu).
 * - `counters` — tenant başına ID counter.
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-063 (FAZ-6) stok hareketleri ve sayım core
 */

import { Injectable, Optional } from "@nestjs/common";
import type { Prisma, StockMovementRecord as DbMovement } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

import type { StockMovementRecord } from "../../common/stock-movements/stock-movement.types.js";
import type { StockMovementType } from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Filtre & patch tipleri
 * -------------------------------------------------------------------------- */

/** Arama filtreleri. */
export interface StockMovementSearchFilters {
  productId?: string | undefined;
  lotId?: string | undefined;
  type?: StockMovementType | undefined;
  types?: StockMovementType[] | undefined;
  sourceType?: string | undefined;
  sourceId?: string | undefined;
  occurredFrom?: string | undefined;
  occurredTo?: string | undefined;
  search?: string | undefined;
  limit: number;
  offset: number;
}

/** Hareket üzerinde güncelleme patch. Append-only olduğu için yalnızca
 *  `notes`/`reason`/`unitCost`/`unitPrice` düzeltilebilir. Miktar/tip/
 *  lot/product düzeltme için `reversal` + yeni hareket kullanılır. */
export interface StockMovementPatch {
  notes?: string | null | undefined;
  reason?: string | null | undefined;
  unitCost?: string | null | undefined;
  unitPrice?: string | null | undefined;
}

/* --------------------------------------------------------------------------
 * Repository
 * -------------------------------------------------------------------------- */

@Injectable()
export class StockMovementsRepository {
  /** id → record. */
  private readonly byId = new Map<string, StockMovementRecord>();
  /** productId → Set<movementId>. */
  private readonly byProduct = new Map<string, Set<string>>();
  /** lotId → Set<movementId>. */
  private readonly byLot = new Map<string, Set<string>>();
  /** `${sourceType}|${sourceId}` → Set<movementId>. */
  private readonly bySource = new Map<string, Set<string>>();
  /** reversesMovementId → Set<movementId>. */
  private readonly byReversal = new Map<string, Set<string>>();
  /** tenantId → next sequence. */
  private readonly counters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  /* ---------- ID üretimi ---------- */

  public nextId(tenantId: string): string {
    if (this.prisma) return `stmv-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `stmv-${tenantId.slice(0, 8)}-${String(n).padStart(8, "0")}`;
  }

  /** Append-only hareketi tenant RLS bağlamında kaydeder. */
  public async persist(rec: StockMovementRecord): Promise<StockMovementRecord> {
    if (!this.prisma) return this.insert(rec);
    const row = await this.inTenant(rec.tenantId, (tx) =>
      tx.stockMovementRecord.create({
        data: {
          ...rec,
          occurredAt: new Date(rec.occurredAt),
          createdAt: new Date(rec.createdAt),
        },
      }),
    );
    this.insert(rec);
    return this.map(row);
  }
  public async persistedById(
    tenantId: string,
    id: string,
  ): Promise<StockMovementRecord | null> {
    if (!this.prisma) return this.findById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.stockMovementRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.map(row) : null;
  }
  public async persistedByReversal(
    tenantId: string,
    reversesMovementId: string,
  ): Promise<StockMovementRecord[]> {
    if (!this.prisma) return this.listByReversal(tenantId, reversesMovementId);
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.stockMovementRecord.findMany({
        where: { tenantId, reversesMovementId },
      }),
    );
    return rows.map((r) => this.map(r));
  }
  public async persistedSearch(
    tenantId: string,
    f: StockMovementSearchFilters,
  ): Promise<{ items: StockMovementRecord[]; total: number }> {
    if (!this.prisma) return this.search(tenantId, f);
    const where: Prisma.StockMovementRecordWhereInput = {
      tenantId,
      ...(f.productId ? { productId: f.productId } : {}),
      ...(f.lotId ? { lotId: f.lotId } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(f.types?.length ? { type: { in: f.types } } : {}),
      ...(f.sourceType ? { sourceType: f.sourceType } : {}),
      ...(f.sourceId ? { sourceId: f.sourceId } : {}),
      ...(f.occurredFrom || f.occurredTo
        ? {
            occurredAt: {
              ...(f.occurredFrom ? { gte: new Date(f.occurredFrom) } : {}),
              ...(f.occurredTo ? { lte: new Date(f.occurredTo) } : {}),
            },
          }
        : {}),
      ...(f.search
        ? {
            OR: [
              { notes: { contains: f.search, mode: "insensitive" } },
              { reason: { contains: f.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.inTenant(tenantId, (tx) =>
      Promise.all([
        tx.stockMovementRecord.findMany({
          where,
          orderBy: { occurredAt: "desc" },
          skip: f.offset,
          take: f.limit,
        }),
        tx.stockMovementRecord.count({ where }),
      ]),
    );
    return { items: rows.map((r) => this.map(r)), total };
  }
  public async persistedUpdate(
    tenantId: string,
    id: string,
    p: StockMovementPatch,
  ): Promise<StockMovementRecord | null> {
    if (!this.prisma) return this.update(tenantId, id, p);
    const data: Prisma.StockMovementRecordUpdateManyMutationInput = {
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
      ...(p.reason !== undefined ? { reason: p.reason } : {}),
      ...(p.unitCost !== undefined ? { unitCost: p.unitCost } : {}),
      ...(p.unitPrice !== undefined ? { unitPrice: p.unitPrice } : {}),
    };
    const out = await this.inTenant(tenantId, (tx) =>
      tx.stockMovementRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return out.count ? this.persistedById(tenantId, id) : null;
  }

  /* ---------- Insert ---------- */

  public insert(rec: StockMovementRecord): StockMovementRecord {
    this.byId.set(rec.id, rec);
    this.addToIndex(this.byProduct, rec.productId, rec.id);
    if (rec.lotId) this.addToIndex(this.byLot, rec.lotId, rec.id);
    if (rec.sourceType && rec.sourceId) {
      this.addToIndex(
        this.bySource,
        `${rec.sourceType}|${rec.sourceId}`,
        rec.id,
      );
    }
    if (rec.reversesMovementId) {
      this.addToIndex(this.byReversal, rec.reversesMovementId, rec.id);
    }
    return rec;
  }

  /* ---------- Basit sorgular ---------- */

  public findById(tenantId: string, id: string): StockMovementRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public listBySource(
    tenantId: string,
    sourceType: string,
    sourceId: string,
  ): StockMovementRecord[] {
    const ids = this.bySource.get(`${sourceType}|${sourceId}`);
    if (!ids) return [];
    const out: StockMovementRecord[] = [];
    for (const id of ids) {
      const r = this.byId.get(id);
      if (r && r.tenantId === tenantId) out.push(r);
    }
    return out;
  }

  public listByReversal(
    tenantId: string,
    reversesMovementId: string,
  ): StockMovementRecord[] {
    const ids = this.byReversal.get(reversesMovementId);
    if (!ids) return [];
    const out: StockMovementRecord[] = [];
    for (const id of ids) {
      const r = this.byId.get(id);
      if (r && r.tenantId === tenantId) out.push(r);
    }
    return out;
  }

  /* ---------- Arama ---------- */

  public search(
    tenantId: string,
    f: StockMovementSearchFilters,
  ): { items: StockMovementRecord[]; total: number } {
    const matched: StockMovementRecord[] = [];

    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (f.productId && rec.productId !== f.productId) continue;
      if (f.lotId && rec.lotId !== f.lotId) continue;
      if (f.type && rec.type !== f.type) continue;
      if (f.types && f.types.length > 0 && !f.types.includes(rec.type))
        continue;
      if (f.sourceType && rec.sourceType !== f.sourceType) continue;
      if (f.sourceId && rec.sourceId !== f.sourceId) continue;
      if (f.occurredFrom && rec.occurredAt < f.occurredFrom) continue;
      if (f.occurredTo && rec.occurredAt > f.occurredTo) continue;
      if (f.search) {
        const q = f.search.toLowerCase();
        const hay = `${rec.notes ?? ""} ${rec.reason ?? ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      matched.push(rec);
    }

    // occurredAt DESC (en yeni önce) — append-only log için tipik.
    matched.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

    const total = matched.length;
    const offset = f.offset;
    const limit = f.limit;
    const items = matched.slice(offset, offset + limit);
    return { items, total };
  }

  /* ---------- Patch (sınırlı alan) ---------- */

  public update(
    tenantId: string,
    id: string,
    patch: StockMovementPatch,
  ): StockMovementRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    if (patch.notes !== undefined) rec.notes = patch.notes;
    if (patch.reason !== undefined) rec.reason = patch.reason;
    if (patch.unitCost !== undefined) rec.unitCost = patch.unitCost;
    if (patch.unitPrice !== undefined) rec.unitPrice = patch.unitPrice;
    this.byId.set(id, rec);
    return rec;
  }

  /* ---------- Test yardımcıları ---------- */

  public clear(): void {
    this.byId.clear();
    this.byProduct.clear();
    this.byLot.clear();
    this.bySource.clear();
    this.byReversal.clear();
    this.counters.clear();
  }

  /* ---------- Private helpers ---------- */

  private addToIndex(
    map: Map<string, Set<string>>,
    key: string,
    id: string,
  ): void {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(id);
  }
  private map(row: DbMovement): StockMovementRecord {
    return {
      ...row,
      type: row.type as StockMovementRecord["type"],
      occurredAt: row.occurredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
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
