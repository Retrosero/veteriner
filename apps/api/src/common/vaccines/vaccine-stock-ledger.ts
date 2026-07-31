/**
 * @file Vaccine stock ledger (aşı stok ledger'ı) — in-memory.
 * @module apps/api/common/vaccines/vaccine-stock-ledger
 *
 * @description GOAL-051 aşı uygulama kaydı için minimal in-memory
 * stok ledger'ı. Faz 6 (GOAL-061+) ile birlikte Prisma
 * `StockProduct` / `StockMovement` / `StockLot` tablolarına
 * geçilecek; bu sürüm yalnızca aşı uygulama akışının atomik
 * olmasını sağlar.
 *
 * Davranış:
 * - Her tenant için `stockProductId|lot|expiryDate` anahtarı
 *   ile miktar tutulur.
 * - `decrement` atomiktir: önce yeterlilik kontrolü, sonra
 *   düşüm + hareket kaydı. Yetersizse hareket oluşmaz.
 * - `reverse` bir hareketi (tipik olarak cancel) tersine çevirir:
 *   aynı lot'a geri ekler + ters hareket kaydı oluşturur.
 * - Tüm sorgular tenant-scoped; cross-tenant erişim mümkün değil.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-051 (FAZ-5) aşı uygulama kaydı core
 */

import { Injectable } from "@nestjs/common";

/** Stok hareket türü. */
export type StockMovementType = "decrement" | "reverse";

/** Stok hareketi (append-only). */
export interface StockMovement {
  id: string;
  tenantId: string;
  stockProductId: string;
  lot: string;
  expiryDate: string;
  /** Pozitif sayı: decrement → eksi, reverse → artı. */
  quantity: number;
  /** Bu hareketi oluşturan application ID (varsa). */
  applicationId: string | null;
  /** Reverse ise, hangi decrement hareketini tersine çevirdiği. */
  reversesMovementId: string | null;
  type: StockMovementType;
  createdAt: string;
  createdBy: string;
}

/** Lot başına mevcut miktar. */
interface LotBalance {
  tenantId: string;
  stockProductId: string;
  lot: string;
  expiryDate: string;
  /** Mevcut miktar (her zaman >= 0). */
  quantity: number;
}

@Injectable()
export class VaccineStockLedger {
  /** key: tenant|product|lot|expiry → LotBalance */
  private readonly balances = new Map<string, LotBalance>();
  /** Hareketler. */
  private readonly movements = new Map<string, StockMovement>();
  /** Tenant başına hareket ID counter. */
  private readonly counters = new Map<string, number>();

  /**
   * Test/admin yardımcısı: bir lot'a başlangıç stoğu ekler.
   * Faz 6'da bu doğrudan `StockProduct` create üzerinden
   * yapılacak; burada yalnızca test senaryoları için public.
   */
  public addStock(args: {
    tenantId: string;
    stockProductId: string;
    lot: string;
    expiryDate: string;
    quantity: number;
  }): LotBalance {
    if (args.quantity < 0) {
      throw new Error("quantity must be >= 0");
    }
    const key = this.balanceKey(args);
    const existing = this.balances.get(key);
    if (existing) {
      existing.quantity += args.quantity;
      this.balances.set(key, existing);
      return existing;
    }
    const bal: LotBalance = {
      tenantId: args.tenantId,
      stockProductId: args.stockProductId,
      lot: args.lot,
      expiryDate: args.expiryDate,
      quantity: args.quantity,
    };
    this.balances.set(key, bal);
    return bal;
  }

  /**
   * Lot için mevcut miktar. Lot yoksa 0 döner.
   */
  public getBalance(args: {
    tenantId: string;
    stockProductId: string;
    lot: string;
    expiryDate: string;
  }): number {
    const bal = this.balances.get(this.balanceKey(args));
    return bal?.quantity ?? 0;
  }

  /**
   * Atomik stok düşümü. Yeterli miktar yoksa null döner (hareket
   * oluşmaz). Başarılıysa oluşturulan hareket ID'sini döner.
   *
   * Miktar pozitif tam sayı olmalı (1+ doz). Ondalık değer kabul
   * edilmez (klinik pilot: aşı uygulaması "1 şişe/kutu" düzeyinde
   * sayılır; doz hesabı client tarafında yapılır).
   */
  public decrement(args: {
    tenantId: string;
    stockProductId: string;
    lot: string;
    expiryDate: string;
    quantity: number;
    applicationId: string;
    createdBy: string;
  }): StockMovement | null {
    if (args.quantity < 1 || !Number.isInteger(args.quantity)) {
      return null;
    }
    const key = this.balanceKey(args);
    const bal = this.balances.get(key);
    if (!bal) return null;
    if (bal.quantity < args.quantity) return null;

    bal.quantity -= args.quantity;
    this.balances.set(key, bal);

    const movement = this.recordMovement({
      ...args,
      type: "decrement",
      reversesMovementId: null,
    });
    return movement;
  }

  /**
   * Bir decrement hareketini tersine çevirir (iptal / stok iade).
   * Aynı lot'a geri ekler + yeni ters hareket kaydeder.
   * Orijinal hareket bulunamazsa null döner.
   */
  public reverse(
    tenantId: string,
    movementId: string,
    createdBy: string,
  ): StockMovement | null {
    const original = this.movements.get(movementId);
    if (!original || original.tenantId !== tenantId) return null;
    if (original.type !== "decrement") return null;

    const key = this.balanceKey({
      tenantId,
      stockProductId: original.stockProductId,
      lot: original.lot,
      expiryDate: original.expiryDate,
    });
    let bal = this.balances.get(key);
    if (!bal) {
      // Lot daha önce silinmiş; yeniden oluştur.
      bal = {
        tenantId,
        stockProductId: original.stockProductId,
        lot: original.lot,
        expiryDate: original.expiryDate,
        quantity: 0,
      };
    }
    bal.quantity += original.quantity;
    this.balances.set(key, bal);

    return this.recordMovement({
      tenantId,
      stockProductId: original.stockProductId,
      lot: original.lot,
      expiryDate: original.expiryDate,
      quantity: -original.quantity, // negative = iade
      applicationId: original.applicationId,
      reversesMovementId: original.id,
      type: "reverse",
      createdBy,
    });
  }

  /**
   * Tenant-scoped hareket listesi. applicationId filtresi
   * opsiyonel.
   */
  public listMovements(
    tenantId: string,
    applicationId?: string,
  ): StockMovement[] {
    const out: StockMovement[] = [];
    for (const m of this.movements.values()) {
      if (m.tenantId !== tenantId) continue;
      if (applicationId && m.applicationId !== applicationId) continue;
      out.push(m);
    }
    return out;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.balances.clear();
    this.movements.clear();
    this.counters.clear();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private balanceKey(args: {
    tenantId: string;
    stockProductId: string;
    lot: string;
    expiryDate: string;
  }): string {
    return `${args.tenantId}|${args.stockProductId}|${args.lot}|${args.expiryDate}`;
  }

  private recordMovement(args: {
    tenantId: string;
    stockProductId: string;
    lot: string;
    expiryDate: string;
    quantity: number;
    applicationId: string | null;
    reversesMovementId: string | null;
    type: StockMovementType;
    createdBy: string;
  }): StockMovement {
    const id = this.nextMovementId(args.tenantId);
    const m: StockMovement = {
      id,
      tenantId: args.tenantId,
      stockProductId: args.stockProductId,
      lot: args.lot,
      expiryDate: args.expiryDate,
      quantity: args.quantity,
      applicationId: args.applicationId,
      reversesMovementId: args.reversesMovementId,
      type: args.type,
      createdAt: new Date().toISOString(),
      createdBy: args.createdBy,
    };
    this.movements.set(id, m);
    return m;
  }

  private nextMovementId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `stmv-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }
}
