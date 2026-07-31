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

import { Injectable } from "@nestjs/common";

import type {
  StockMovementRecord,
} from "../../common/stock-movements/stock-movement.types.js";
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

  /* ---------- ID üretimi ---------- */

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `stmv-${tenantId.slice(0, 8)}-${String(n).padStart(8, "0")}`;
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
      if (f.types && f.types.length > 0 && !f.types.includes(rec.type)) continue;
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
}
