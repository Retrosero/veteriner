/**
 * @file Payment repository (in-memory).
 * @module apps/api/modules/payments/payments.repository
 *
 * @description GOAL-072 tahsilat veri erişim katmanı. DB migration
 * sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-072 (FAZ-7) tahsilat core
 */

import { Injectable } from "@nestjs/common";

import type { PaymentRecord } from "../../common/payments/payment.types.js";
import type {
  PaymentMethod,
  PaymentSourceType,
  PaymentStatus,
} from "@vetniva/contracts";

/** Patch tipi. */
export interface PaymentPatch {
  status?: PaymentStatus | undefined;
  reversedAmount?: string | undefined;
  effectiveAmount?: string | undefined;
  reversedAt?: string | null | undefined;
  reversedBy?: string | null | undefined;
  reverseReason?: string | null | undefined;
  notes?: string | null | undefined;
}

/** Arama filtreleri. */
export interface PaymentSearchFilters {
  status?: PaymentStatus | undefined;
  sourceType?: PaymentSourceType | undefined;
  sourceId?: string | undefined;
  method?: PaymentMethod | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class PaymentsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, PaymentRecord>();
  /**
   * key: tenantId|idempotencyKey → record id. null key kullanılmaz.
   */
  private readonly byIdempotencyKey = new Map<string, string>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `pm-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: PaymentRecord): PaymentRecord {
    this.byId.set(record.id, record);
    if (record.idempotencyKey !== null) {
      this.byIdempotencyKey.set(
        this.idempotencyKeyMapKey(record.tenantId, record.idempotencyKey),
        record.id,
      );
    }
    return record;
  }

  public findById(tenantId: string, id: string): PaymentRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findByIdempotencyKey(
    tenantId: string,
    key: string,
  ): PaymentRecord | null {
    const id = this.byIdempotencyKey.get(
      this.idempotencyKeyMapKey(tenantId, key),
    );
    if (!id) return null;
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Belirli bir source (sale) için tüm (ters kayıt hariç) tahsilat
   * toplamı. Sale toplamı ile karşılaştırmak için kullanılabilir.
   */
  public sumActiveForSource(
    tenantId: string,
    sourceType: PaymentSourceType,
    sourceId: string,
  ): string {
    let total = "0";
    for (const rec of this.byId.values()) {
      if (
        rec.tenantId === tenantId &&
        rec.sourceType === sourceType &&
        rec.sourceId === sourceId &&
        rec.status === "completed"
      ) {
        const normalized = normalizeSimple(rec.amount);
        if (normalized === null) continue;
        // BigInt toplama (4 ondalık ölçekte).
        const a = scaledBigInt(total);
        const b = scaledBigInt(normalized);
        total = bigIntToScaledString(a + b);
      }
    }
    return total;
  }

  public update(
    tenantId: string,
    id: string,
    patch: PaymentPatch,
  ): PaymentRecord | null {
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

  public search(
    tenantId: string,
    filters: PaymentSearchFilters,
  ): { items: PaymentRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();

    const all: PaymentRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.sourceType && rec.sourceType !== filters.sourceType) continue;
      if (filters.sourceId && rec.sourceId !== filters.sourceId) continue;
      if (filters.method && rec.method !== filters.method) continue;
      if (needle) {
        const hay = [rec.id, rec.sourceId, rec.reference ?? "", rec.notes ?? ""]
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
    this.byIdempotencyKey.clear();
    this.counters.clear();
  }

  private idempotencyKeyMapKey(tenantId: string, key: string): string {
    return `${tenantId}|${key}`;
  }
}

/* --------------------------------------------------------------------------
 * Dahili decimal yardımcıları (sumActiveForSource için)
 * -------------------------------------------------------------------------- */

function normalizeSimple(value: string): string | null {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return null;
  return value;
}

function scaledBigInt(value: string): bigint {
  const parts = value.split(".");
  const intPart = parts[0] ?? "0";
  const fracPart = (parts[1] ?? "").padEnd(4, "0").slice(0, 4);
  return BigInt(intPart) * BigInt(10000) + BigInt(fracPart);
}

function bigIntToScaledString(scaled: bigint): string {
  const negative = scaled < BigInt(0);
  const abs = negative ? -scaled : scaled;
  const intPart = abs / BigInt(10000);
  const fracPart = abs % BigInt(10000);
  const intStr = intPart.toString();
  const fracStr = fracPart.toString().padStart(4, "0").replace(/0+$/, "");
  const body = fracStr.length > 0 ? `${intStr}.${fracStr}` : intStr;
  return negative && body !== "0" ? `-${body}` : body;
}
