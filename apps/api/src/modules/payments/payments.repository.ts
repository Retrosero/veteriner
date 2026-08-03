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

import { Injectable, Optional } from "@nestjs/common";
import type { PaymentRecord as DbPayment, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

import type { PaymentRecord } from "../../common/payments/payment.types.js";
import type { KasaEntryRecord } from "../../common/payments/kasa.types.js";
import type { PaymentReversalRecord } from "../../common/payments/payment-reversal.types.js";
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
  public constructor(@Optional() private readonly prisma?: PrismaService) {}
  public usesPersistence(): boolean {
    return this.prisma !== undefined;
  }

  public nextId(tenantId: string): string {
    if (this.prisma) return `pm-${tenantId.slice(0, 8)}-${randomUUID()}`;
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
  public async persist(record: PaymentRecord): Promise<PaymentRecord> {
    if (!this.prisma) return this.insert(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.paymentRecord.create({
        data: {
          ...record,
          amount: record.amount,
          reversedAmount: record.reversedAmount,
          effectiveAmount: record.effectiveAmount,
          paidAt: new Date(record.paidAt),
          reversedAt: record.reversedAt ? new Date(record.reversedAt) : null,
          createdAt: new Date(record.createdAt),
        },
      }),
    );
    return this.map(row);
  }
  public async persistedByIdempotencyKey(
    tenantId: string,
    key: string,
  ): Promise<PaymentRecord | null> {
    if (!this.prisma) return this.findByIdempotencyKey(tenantId, key);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.paymentRecord.findFirst({ where: { tenantId, idempotencyKey: key } }),
    );
    return row ? this.map(row) : null;
  }
  public async persistedById(
    tenantId: string,
    id: string,
  ): Promise<PaymentRecord | null> {
    if (!this.prisma) return this.findById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.paymentRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.map(row) : null;
  }
  public async persistedUpdate(
    tenantId: string,
    id: string,
    p: PaymentPatch,
  ): Promise<PaymentRecord | null> {
    if (!this.prisma) return this.update(tenantId, id, p);
    const data: Prisma.PaymentRecordUpdateManyMutationInput = {
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.reversedAmount !== undefined
        ? { reversedAmount: p.reversedAmount }
        : {}),
      ...(p.effectiveAmount !== undefined
        ? { effectiveAmount: p.effectiveAmount }
        : {}),
      ...(p.reversedAt !== undefined
        ? { reversedAt: p.reversedAt ? new Date(p.reversedAt) : null }
        : {}),
      ...(p.reversedBy !== undefined ? { reversedBy: p.reversedBy } : {}),
      ...(p.reverseReason !== undefined
        ? { reverseReason: p.reverseReason }
        : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
    };
    const changed = await this.inTenant(tenantId, (tx) =>
      tx.paymentRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return changed.count ? this.persistedById(tenantId, id) : null;
  }
  public async persistedSearch(
    tenantId: string,
    f: PaymentSearchFilters,
  ): Promise<{ items: PaymentRecord[]; total: number }> {
    if (!this.prisma) return this.search(tenantId, f);
    const needle = f.search?.trim();
    const where: Prisma.PaymentRecordWhereInput = {
      tenantId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.sourceType ? { sourceType: f.sourceType } : {}),
      ...(f.sourceId ? { sourceId: f.sourceId } : {}),
      ...(f.method ? { method: f.method } : {}),
      ...(needle
        ? {
            OR: [
              { id: { contains: needle } },
              { sourceId: { contains: needle } },
              { reference: { contains: needle, mode: "insensitive" } },
              { notes: { contains: needle, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    return this.inTenant(tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.paymentRecord.findMany({
          where,
          orderBy: { createdAt: f.sort ?? "desc" },
          skip: f.offset,
          take: f.limit,
        }),
        tx.paymentRecord.count({ where }),
      ]);
      return { items: items.map((row) => this.map(row)), total };
    });
  }
  public async persistPaymentWithKasa(
    payment: PaymentRecord,
    kasa: KasaEntryRecord | null,
  ): Promise<PaymentRecord> {
    if (!this.prisma) return this.persist(payment);
    const row = await this.inTenant(payment.tenantId, async (tx) => {
      const created = await tx.paymentRecord.create({
        data: {
          ...payment,
          amount: payment.amount,
          reversedAmount: payment.reversedAmount,
          effectiveAmount: payment.effectiveAmount,
          paidAt: new Date(payment.paidAt),
          reversedAt: payment.reversedAt ? new Date(payment.reversedAt) : null,
          createdAt: new Date(payment.createdAt),
        },
      });
      if (kasa)
        await tx.kasaEntryRecord.create({
          data: {
            ...kasa,
            amountSigned: kasa.amountSigned,
            occurredAt: new Date(kasa.occurredAt),
          },
        });
      return created;
    });
    return this.map(row);
  }
  public async persistReversalWithPaymentAndKasa(
    reversal: PaymentReversalRecord,
    paymentPatch: PaymentPatch,
    kasa: KasaEntryRecord | null,
  ): Promise<PaymentRecord> {
    if (!this.prisma)
      throw new Error(
        "Bu atomik finansal işlem için Prisma bağlantısı gerekli",
      );
    const row = await this.inTenant(reversal.tenantId, async (tx) => {
      await tx.paymentReversalRecord.create({
        data: {
          ...reversal,
          amount: reversal.amount,
          reversedAt: new Date(reversal.reversedAt),
          createdAt: new Date(reversal.createdAt),
        },
      });
      const data: Prisma.PaymentRecordUpdateManyMutationInput = {
        ...(paymentPatch.status !== undefined
          ? { status: paymentPatch.status }
          : {}),
        ...(paymentPatch.reversedAmount !== undefined
          ? { reversedAmount: paymentPatch.reversedAmount }
          : {}),
        ...(paymentPatch.effectiveAmount !== undefined
          ? { effectiveAmount: paymentPatch.effectiveAmount }
          : {}),
        ...(paymentPatch.reversedAt !== undefined
          ? {
              reversedAt: paymentPatch.reversedAt
                ? new Date(paymentPatch.reversedAt)
                : null,
            }
          : {}),
        ...(paymentPatch.reversedBy !== undefined
          ? { reversedBy: paymentPatch.reversedBy }
          : {}),
        ...(paymentPatch.reverseReason !== undefined
          ? { reverseReason: paymentPatch.reverseReason }
          : {}),
      };
      const updated = await tx.paymentRecord.updateMany({
        where: {
          tenantId: reversal.tenantId,
          id: reversal.paymentId,
          status: { in: ["completed", "partially_reversed"] },
        },
        data,
      });
      if (!updated.count) throw new Error("Tahsilat güncellenemedi");
      if (kasa)
        await tx.kasaEntryRecord.create({
          data: {
            ...kasa,
            amountSigned: kasa.amountSigned,
            occurredAt: new Date(kasa.occurredAt),
          },
        });
      const result = await tx.paymentRecord.findFirst({
        where: { tenantId: reversal.tenantId, id: reversal.paymentId },
      });
      if (!result) throw new Error("Tahsilat bulunamadı");
      return result;
    });
    return this.map(row);
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
  private map(row: DbPayment): PaymentRecord {
    return {
      ...row,
      sourceType: row.sourceType as PaymentRecord["sourceType"],
      method: row.method as PaymentRecord["method"],
      currency: row.currency as PaymentRecord["currency"],
      status: row.status as PaymentRecord["status"],
      amount: row.amount.toString(),
      reversedAmount: row.reversedAmount.toString(),
      effectiveAmount: row.effectiveAmount.toString(),
      paidAt: row.paidAt.toISOString(),
      reversedAt: row.reversedAt?.toISOString() ?? null,
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
