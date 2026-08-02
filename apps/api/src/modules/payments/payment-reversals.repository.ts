/**
 * @file Payment reversal repository (in-memory).
 * @module apps/api/modules/payments/payment-reversals.repository
 *
 * @description GOAL-073 (FAZ-7) tahsilat ters kayıt veri erişim
 * katmanı. DB migration sonraya bırakıldı; tenant-scoped
 * in-memory Map kullanılır.
 *
 * İndeksler:
 * - `byId` — `id` → record.
 * - `byPayment` — `tenantId|paymentId` → Set<reversalId>.
 * - `bySource` — `tenantId|sourceType|sourceId` → Set<reversalId>
 *   (raporlama: bir satışa bağlı tüm reversal'lar).
 * - `counters` — tenantId → sayı.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-073 (FAZ-7) tahsilat iptal ve ters kayıt core
 */

import { Injectable, Optional } from "@nestjs/common";
import type { PaymentReversalRecord as DbReversal, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

import {
  reversalAmountToScaled,
  scaledBigIntToReversalAmount,
} from "../../common/payments/payment-reversal.types.js";

import type { PaymentReversalRecord } from "../../common/payments/payment-reversal.types.js";
import type {
  PaymentReverseReason,
  PaymentSourceType,
} from "@vetniva/contracts";

/** Arama filtreleri. */
export interface PaymentReversalSearchFilters {
  paymentId?: string | undefined;
  sourceType?: PaymentSourceType | undefined;
  sourceId?: string | undefined;
  reason?: PaymentReverseReason | undefined;
  from?: string | undefined;
  to?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class PaymentReversalsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, PaymentReversalRecord>();
  /** key: tenantId|paymentId → Set<reversalId>. */
  private readonly byPayment = new Map<string, Set<string>>();
  /** key: tenantId|sourceType|sourceId → Set<reversalId>. */
  private readonly bySource = new Map<string, Set<string>>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  public nextId(tenantId: string): string {
    if(this.prisma)return `pr-${tenantId.slice(0,8)}-${randomUUID()}`;
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `pr-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: PaymentReversalRecord): PaymentReversalRecord {
    this.byId.set(record.id, record);
    const paymentKey = this.byPaymentMapKey(record.tenantId, record.paymentId);
    let set = this.byPayment.get(paymentKey);
    if (!set) {
      set = new Set<string>();
      this.byPayment.set(paymentKey, set);
    }
    set.add(record.id);
    const sourceKey = this.bySourceMapKey(
      record.tenantId,
      record.sourceType,
      record.sourceId,
    );
    let set2 = this.bySource.get(sourceKey);
    if (!set2) {
      set2 = new Set<string>();
      this.bySource.set(sourceKey, set2);
    }
    set2.add(record.id);
    return record;
  }
  public async persist(record:PaymentReversalRecord):Promise<PaymentReversalRecord>{if(!this.prisma)return this.insert(record);const row=await this.inTenant(record.tenantId,tx=>tx.paymentReversalRecord.create({data:{...record,amount:record.amount,reversedAt:new Date(record.reversedAt),createdAt:new Date(record.createdAt)}}));return this.map(row);}
  public async persistedById(tenantId:string,id:string):Promise<PaymentReversalRecord|null>{if(!this.prisma)return this.findById(tenantId,id);const row=await this.inTenant(tenantId,tx=>tx.paymentReversalRecord.findFirst({where:{tenantId,id}}));return row?this.map(row):null;}
  public async persistedSumReversedForPayment(tenantId:string,paymentId:string):Promise<string>{if(!this.prisma)return this.sumReversedForPayment(tenantId,paymentId);const rows=await this.inTenant(tenantId,tx=>tx.paymentReversalRecord.findMany({where:{tenantId,paymentId},select:{amount:true}}));return scaledBigIntToReversalAmount(rows.reduce((sum,row)=>sum+(reversalAmountToScaled(row.amount.toString())??BigInt(0)),BigInt(0)));}
  public async persistedSearch(tenantId:string,f:PaymentReversalSearchFilters):Promise<{items:PaymentReversalRecord[];total:number}>{if(!this.prisma)return this.search(tenantId,f);const where:Prisma.PaymentReversalRecordWhereInput={tenantId,...(f.paymentId?{paymentId:f.paymentId}:{}),...(f.sourceType?{sourceType:f.sourceType}:{}),...(f.sourceId?{sourceId:f.sourceId}:{}),...(f.reason?{reason:f.reason}:{}),...(f.from||f.to?{reversedAt:{...(f.from?{gte:new Date(f.from)}:{}),...(f.to?{lte:new Date(f.to)}:{})}}:{})};return this.inTenant(tenantId,async tx=>{const[items,total]=await Promise.all([tx.paymentReversalRecord.findMany({where,orderBy:{reversedAt:f.sort??"desc"},skip:f.offset,take:f.limit}),tx.paymentReversalRecord.count({where})]);return{items:items.map(row=>this.map(row)),total};});}

  public findById(tenantId: string, id: string): PaymentReversalRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Bir payment için tüm ters kayıtların kümülatif toplamını
   * döner (Decimal string, 4 ondalık). 0 → "0".
   */
  public sumReversedForPayment(tenantId: string, paymentId: string): string {
    const key = this.byPaymentMapKey(tenantId, paymentId);
    const set = this.byPayment.get(key);
    if (!set || set.size === 0) return "0";
    let total = BigInt(0);
    for (const reversalId of set.values()) {
      const rec = this.byId.get(reversalId);
      if (!rec) continue;
      const scaled = reversalAmountToScaled(rec.amount);
      if (scaled === null) continue;
      total = total + scaled;
    }
    return scaledBigIntToReversalAmount(total);
  }

  public search(
    tenantId: string,
    filters: PaymentReversalSearchFilters,
  ): { items: PaymentReversalRecord[]; total: number } {
    const all: PaymentReversalRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.paymentId && rec.paymentId !== filters.paymentId) continue;
      if (filters.sourceType && rec.sourceType !== filters.sourceType) continue;
      if (filters.sourceId && rec.sourceId !== filters.sourceId) continue;
      if (filters.reason && rec.reason !== filters.reason) continue;
      if (filters.from && rec.reversedAt < filters.from) continue;
      if (filters.to && rec.reversedAt > filters.to) continue;
      all.push(rec);
    }
    const sort = filters.sort ?? "desc";
    all.sort((a, b) => {
      const cmp = a.reversedAt.localeCompare(b.reversedAt);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.byPayment.clear();
    this.bySource.clear();
    this.counters.clear();
  }

  private byPaymentMapKey(tenantId: string, paymentId: string): string {
    return `${tenantId}|${paymentId}`;
  }

  private bySourceMapKey(
    tenantId: string,
    sourceType: PaymentSourceType,
    sourceId: string,
  ): string {
    return `${tenantId}|${sourceType}|${sourceId}`;
  }
  private map(row:DbReversal):PaymentReversalRecord{return{...row,sourceType:row.sourceType as PaymentReversalRecord["sourceType"],method:row.method as PaymentReversalRecord["method"],currency:row.currency as PaymentReversalRecord["currency"],reason:row.reason as PaymentReversalRecord["reason"],amount:row.amount.toString(),reversedAt:row.reversedAt.toISOString(),createdAt:row.createdAt.toISOString()};}
  private async inTenant<T>(tenantId:string,callback:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{if(!this.prisma)throw new Error("Prisma bağlantısı bulunamadı");return this.prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;return callback(tx);});}
}
