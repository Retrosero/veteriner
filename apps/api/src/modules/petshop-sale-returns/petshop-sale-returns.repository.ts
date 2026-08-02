/**
 * @file PetshopSaleReturn repository (in-memory).
 * @module apps/api/modules/petshop-sale-returns/petshop-sale-returns.repository
 *
 * @description GOAL-065 petshop satış iadesi veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-065 (FAZ-6) petshop satış iadesi core
 */

import { Injectable, Optional } from "@nestjs/common";
import type { Prisma, PetshopSaleReturnLineRecord as DbLine, PetshopSaleReturnRecord as DbReturn } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  PetshopSaleReturnLineRecord,
  PetshopSaleReturnRecord,
} from "../../common/petshop-sale-returns/petshop-sale-return.types.js";
import type {
  PetshopPaymentMethod,
  PetshopSaleReturnStatus,
} from "@vetniva/contracts";

/** Return patch tipi. */
export interface PetshopSaleReturnPatch {
  status?: PetshopSaleReturnStatus | undefined;
  refundMethod?: PetshopPaymentMethod | undefined;
  totalAmount?: string | undefined;
  globalDiscountPercent?: number | undefined;
  refundAmount?: string | undefined;
  notes?: string | null | undefined;
  completedAt?: string | null | undefined;
  completedBy?: string | null | undefined;
  cancelledAt?: string | null | undefined;
  cancelledBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Line patch tipi. */
export interface PetshopSaleReturnLinePatch {
  reason?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface PetshopSaleReturnSearchFilters {
  status?: PetshopSaleReturnStatus | undefined;
  originalSaleId?: string | undefined;
  customerOwnerId?: string | undefined;
  customerPatientId?: string | undefined;
  refundMethod?: PetshopPaymentMethod | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class PetshopSaleReturnsRepository {
  /** key: id → header record. */
  private readonly byId = new Map<string, PetshopSaleReturnRecord>();
  /** key: id → line record. */
  private readonly lineById = new Map<string, PetshopSaleReturnLineRecord>();
  /** key: returnId → lineId[]. */
  private readonly linesByReturn = new Map<string, string[]>();
  /** key: originalSaleId → returnId[] (tenant-scoped arama için). */
  private readonly byOriginalSale = new Map<string, string[]>();
  /** Her tenant için return id counter. */
  private readonly counters = new Map<string, number>();
  /** Her tenant için line id counter. */
  private readonly lineCounters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  public nextId(tenantId: string): string {
    if (this.prisma) return `psr-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `psr-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public nextLineId(tenantId: string): string {
    if (this.prisma) return `psrl-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.lineCounters.get(tenantId) ?? 0) + 1;
    this.lineCounters.set(tenantId, n);
    return `psrl-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: PetshopSaleReturnRecord): PetshopSaleReturnRecord {
    this.byId.set(record.id, record);
    this.linesByReturn.set(record.id, []);
    const list = this.byOriginalSale.get(record.originalSaleId) ?? [];
    list.push(record.id);
    this.byOriginalSale.set(record.originalSaleId, list);
    return record;
  }
  public async persistReturnWithLines(ret: PetshopSaleReturnRecord, lines: PetshopSaleReturnLineRecord[]): Promise<void> { if (!this.prisma) { if (!this.byId.has(ret.id)) this.insert(ret); for (const line of lines) { if (!this.lineById.has(line.id)) this.insertLine(line); } return; } await this.inTenant(ret.tenantId, async (tx) => { await tx.petshopSaleReturnRecord.create({ data: this.returnData(ret) }); if (lines.length) await tx.petshopSaleReturnLineRecord.createMany({ data: lines.map((line) => this.lineData(line)) }); }); }
  public async persistedById(tenantId:string,id:string):Promise<PetshopSaleReturnRecord|null>{if(!this.prisma)return this.findById(tenantId,id);const row=await this.inTenant(tenantId,tx=>tx.petshopSaleReturnRecord.findFirst({where:{tenantId,id}}));return row?this.mapReturn(row):null;}
  public async persistedLines(tenantId:string,returnId:string):Promise<PetshopSaleReturnLineRecord[]>{if(!this.prisma)return this.listLinesByReturn(tenantId,returnId);const rows=await this.inTenant(tenantId,tx=>tx.petshopSaleReturnLineRecord.findMany({where:{tenantId,returnId},orderBy:{createdAt:"asc"}}));return rows.map(row=>this.mapLine(row));}
  public async persistedByOriginalSale(tenantId:string,originalSaleId:string):Promise<PetshopSaleReturnRecord[]>{if(!this.prisma)return this.listReturnsByOriginalSale(tenantId,originalSaleId);const rows=await this.inTenant(tenantId,tx=>tx.petshopSaleReturnRecord.findMany({where:{tenantId,originalSaleId},orderBy:{createdAt:"asc"}}));return rows.map(row=>this.mapReturn(row));}
  public async persistedSearch(tenantId:string,f:PetshopSaleReturnSearchFilters):Promise<{items:PetshopSaleReturnRecord[];total:number}>{if(!this.prisma)return this.search(tenantId,f);const where:Prisma.PetshopSaleReturnRecordWhereInput={tenantId,...(f.status?{status:f.status}:{}),...(f.originalSaleId?{originalSaleId:f.originalSaleId}:{}),...(f.customerOwnerId?{customerOwnerId:f.customerOwnerId}:{}),...(f.customerPatientId?{customerPatientId:f.customerPatientId}:{}),...(f.refundMethod?{refundMethod:f.refundMethod}:{}),...(f.search?.trim()?{OR:[{id:{contains:f.search.trim()}},{originalSaleId:{contains:f.search.trim()}},{reason:{contains:f.search.trim(),mode:"insensitive"}}]}:{})};return this.inTenant(tenantId,async tx=>{const[items,total]=await Promise.all([tx.petshopSaleReturnRecord.findMany({where,orderBy:{createdAt:f.sort??"desc"},skip:f.offset,take:f.limit}),tx.petshopSaleReturnRecord.count({where})]);return{items:items.map(r=>this.mapReturn(r)),total};});}
  public async persistedUpdate(tenantId:string,id:string,p:PetshopSaleReturnPatch):Promise<PetshopSaleReturnRecord|null>{if(!this.prisma)return this.update(tenantId,id,p);const data:Prisma.PetshopSaleReturnRecordUpdateManyMutationInput={...(p.status!==undefined?{status:p.status}:{}),...(p.refundMethod!==undefined?{refundMethod:p.refundMethod}:{}),...(p.totalAmount!==undefined?{totalAmount:p.totalAmount}:{}),...(p.globalDiscountPercent!==undefined?{globalDiscountPercent:p.globalDiscountPercent}:{}),...(p.refundAmount!==undefined?{refundAmount:p.refundAmount}:{}),...(p.notes!==undefined?{notes:p.notes}:{}),...(p.completedAt!==undefined?{completedAt:p.completedAt?new Date(p.completedAt):null}:{}),...(p.completedBy!==undefined?{completedBy:p.completedBy}:{}),...(p.cancelledAt!==undefined?{cancelledAt:p.cancelledAt?new Date(p.cancelledAt):null}:{}),...(p.cancelledBy!==undefined?{cancelledBy:p.cancelledBy}:{}),...(p.cancelReason!==undefined?{cancelReason:p.cancelReason}:{}),...(p.updatedAt!==undefined?{updatedAt:new Date(p.updatedAt)}:{})};const x=await this.inTenant(tenantId,tx=>tx.petshopSaleReturnRecord.updateMany({where:{tenantId,id},data}));return x.count?this.persistedById(tenantId,id):null;}

  public insertLine(
    record: PetshopSaleReturnLineRecord,
  ): PetshopSaleReturnLineRecord {
    this.lineById.set(record.id, record);
    const list = this.linesByReturn.get(record.returnId) ?? [];
    list.push(record.id);
    this.linesByReturn.set(record.returnId, list);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): PetshopSaleReturnRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findLineById(
    tenantId: string,
    lineId: string,
  ): PetshopSaleReturnLineRecord | null {
    const rec = this.lineById.get(lineId);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public listLinesByReturn(
    tenantId: string,
    returnId: string,
  ): PetshopSaleReturnLineRecord[] {
    const ids = this.linesByReturn.get(returnId) ?? [];
    const out: PetshopSaleReturnLineRecord[] = [];
    for (const id of ids) {
      const rec = this.lineById.get(id);
      if (rec && rec.tenantId === tenantId) out.push(rec);
    }
    return out;
  }

  public listReturnsByOriginalSale(
    tenantId: string,
    originalSaleId: string,
  ): PetshopSaleReturnRecord[] {
    const ids = this.byOriginalSale.get(originalSaleId) ?? [];
    const out: PetshopSaleReturnRecord[] = [];
    for (const id of ids) {
      const rec = this.byId.get(id);
      if (rec && rec.tenantId === tenantId) out.push(rec);
    }
    return out;
  }

  public update(
    tenantId: string,
    id: string,
    patch: PetshopSaleReturnPatch,
  ): PetshopSaleReturnRecord | null {
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
    patch: PetshopSaleReturnLinePatch,
  ): PetshopSaleReturnLineRecord | null {
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
    filters: PetshopSaleReturnSearchFilters,
  ): { items: PetshopSaleReturnRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();

    const all: PetshopSaleReturnRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (
        filters.originalSaleId &&
        rec.originalSaleId !== filters.originalSaleId
      )
        continue;
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
      if (filters.refundMethod && rec.refundMethod !== filters.refundMethod)
        continue;
      if (needle) {
        const hay = [rec.id, rec.originalSaleId, rec.reason, rec.notes ?? ""]
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
    this.linesByReturn.clear();
    this.byOriginalSale.clear();
    this.counters.clear();
    this.lineCounters.clear();
  }
  private returnData(r:PetshopSaleReturnRecord):Prisma.PetshopSaleReturnRecordUncheckedCreateInput{return{...r,completedAt:r.completedAt?new Date(r.completedAt):null,cancelledAt:r.cancelledAt?new Date(r.cancelledAt):null,createdAt:new Date(r.createdAt),updatedAt:new Date(r.updatedAt)};}
  private lineData(r:PetshopSaleReturnLineRecord):Prisma.PetshopSaleReturnLineRecordUncheckedCreateInput{return{...r,createdAt:new Date(r.createdAt),updatedAt:new Date(r.updatedAt)};}
  private mapReturn(r:DbReturn):PetshopSaleReturnRecord{return{...r,status:r.status as PetshopSaleReturnStatus,refundMethod:r.refundMethod as PetshopPaymentMethod,completedAt:r.completedAt?.toISOString()??null,cancelledAt:r.cancelledAt?.toISOString()??null,createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString()};}
  private mapLine(r:DbLine):PetshopSaleReturnLineRecord{return{...r,createdAt:r.createdAt.toISOString(),updatedAt:r.updatedAt.toISOString()};}
  private async inTenant<T>(tenantId:string,callback:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{if(!this.prisma)throw new Error("Prisma bağlantısı bulunamadı");return this.prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;return callback(tx);});}
}
