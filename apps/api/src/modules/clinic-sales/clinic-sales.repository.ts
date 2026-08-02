/**
 * @file ClinicSale repository (in-memory).
 * @module apps/api/modules/clinic-sales/clinic-sales.repository
 *
 * @description GOAL-071 klinik satış taslağı veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-071 (FAZ-7) klinik satış taslağı core
 */

import { Injectable, Optional } from "@nestjs/common";
import type { Prisma, ClinicSaleLineRecord as DbLine, ClinicSaleRecord as DbSale } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  ClinicSaleLineRecord,
  ClinicSaleRecord,
} from "../../common/clinic-sales/clinic-sale.types.js";
import type {
  ClinicSaleSourceType,
  ClinicSaleStatus,
} from "@vetniva/contracts";

/** Sale patch tipi. */
export interface ClinicSalePatch {
  status?: ClinicSaleStatus | undefined;
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

/** Arama filtreleri. */
export interface ClinicSaleSearchFilters {
  status?: ClinicSaleStatus | undefined;
  customerOwnerId?: string | undefined;
  customerPatientId?: string | undefined;
  sourceType?: ClinicSaleSourceType | undefined;
  sourceId?: string | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class ClinicSalesRepository {
  /** key: id → header record. */
  private readonly byId = new Map<string, ClinicSaleRecord>();
  /** key: id → line record. */
  private readonly lineById = new Map<string, ClinicSaleLineRecord>();
  /** key: saleId → lineId[]. */
  private readonly linesBySale = new Map<string, string[]>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  /** Her tenant için line id counter. */
  private readonly lineCounters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  public nextId(tenantId: string): string {
    if (this.prisma) return `cs-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `cs-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public nextLineId(tenantId: string): string {
    if (this.prisma) return `csl-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.lineCounters.get(tenantId) ?? 0) + 1;
    this.lineCounters.set(tenantId, n);
    return `csl-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: ClinicSaleRecord): ClinicSaleRecord {
    this.byId.set(record.id, record);
    this.linesBySale.set(record.id, []);
    return record;
  }
  public async persistSaleWithLines(sale:ClinicSaleRecord,lines:ClinicSaleLineRecord[]):Promise<void>{if(!this.prisma){if(!this.byId.has(sale.id))this.insert(sale);for(const line of lines)if(!this.lineById.has(line.id))this.insertLine(line);return;}await this.inTenant(sale.tenantId,async tx=>{await tx.clinicSaleRecord.create({data:{...sale,completedAt:sale.completedAt?new Date(sale.completedAt):null,cancelledAt:sale.cancelledAt?new Date(sale.cancelledAt):null,createdAt:new Date(sale.createdAt),updatedAt:new Date(sale.updatedAt)}});if(lines.length)await tx.clinicSaleLineRecord.createMany({data:lines.map(line=>({...line,createdAt:new Date(line.createdAt),updatedAt:new Date(line.updatedAt)}))});});}
  public async persistedById(tenantId:string,id:string):Promise<ClinicSaleRecord|null>{if(!this.prisma)return this.findById(tenantId,id);const row=await this.inTenant(tenantId,tx=>tx.clinicSaleRecord.findFirst({where:{tenantId,id}}));return row?this.mapSale(row):null;}
  public async persistedLines(tenantId:string,saleId:string):Promise<ClinicSaleLineRecord[]>{if(!this.prisma)return this.listLinesBySale(tenantId,saleId);const rows=await this.inTenant(tenantId,tx=>tx.clinicSaleLineRecord.findMany({where:{tenantId,saleId},orderBy:{createdAt:"asc"}}));return rows.map(row=>this.mapLine(row));}
  public async persistedUpdate(tenantId:string,id:string,p:ClinicSalePatch):Promise<ClinicSaleRecord|null>{if(!this.prisma)return this.update(tenantId,id,p);const data:Prisma.ClinicSaleRecordUpdateManyMutationInput={...(p.status!==undefined?{status:p.status}:{}),...(p.totalAmount!==undefined?{totalAmount:p.totalAmount}:{}),...(p.globalDiscountPercent!==undefined?{globalDiscountPercent:p.globalDiscountPercent}:{}),...(p.netAmount!==undefined?{netAmount:p.netAmount}:{}),...(p.notes!==undefined?{notes:p.notes}:{}),...(p.completedAt!==undefined?{completedAt:p.completedAt?new Date(p.completedAt):null}:{}),...(p.completedBy!==undefined?{completedBy:p.completedBy}:{}),...(p.cancelledAt!==undefined?{cancelledAt:p.cancelledAt?new Date(p.cancelledAt):null}:{}),...(p.cancelledBy!==undefined?{cancelledBy:p.cancelledBy}:{}),...(p.cancelReason!==undefined?{cancelReason:p.cancelReason}:{}),...(p.updatedAt!==undefined?{updatedAt:new Date(p.updatedAt)}:{})};const x=await this.inTenant(tenantId,tx=>tx.clinicSaleRecord.updateMany({where:{tenantId,id},data}));return x.count?this.persistedById(tenantId,id):null;}
  public async persistedUpdateWithLines(tenantId:string,id:string,p:ClinicSalePatch,lines:ClinicSaleLineRecord[]):Promise<ClinicSaleRecord|null>{if(!this.prisma){const updated=this.update(tenantId,id,p);if(!updated)return null;for(const old of this.listLinesBySale(tenantId,id))this.lineById.delete(old.id);this.linesBySale.set(id,[]);for(const line of lines)this.insertLine(line);return updated;}const data:Prisma.ClinicSaleRecordUpdateManyMutationInput={...(p.totalAmount!==undefined?{totalAmount:p.totalAmount}:{}),...(p.globalDiscountPercent!==undefined?{globalDiscountPercent:p.globalDiscountPercent}:{}),...(p.netAmount!==undefined?{netAmount:p.netAmount}:{}),...(p.notes!==undefined?{notes:p.notes}:{}),...(p.updatedAt!==undefined?{updatedAt:new Date(p.updatedAt)}:{})};const changed=await this.inTenant(tenantId,async tx=>{const result=await tx.clinicSaleRecord.updateMany({where:{tenantId,id,status:"draft"},data});if(!result.count)return false;await tx.clinicSaleLineRecord.deleteMany({where:{tenantId,saleId:id}});if(lines.length)await tx.clinicSaleLineRecord.createMany({data:lines.map(line=>({...line,createdAt:new Date(line.createdAt),updatedAt:new Date(line.updatedAt)}))});return true;});return changed?this.persistedById(tenantId,id):null;}
  public async persistedSearch(tenantId:string,f:ClinicSaleSearchFilters):Promise<{items:ClinicSaleRecord[];total:number}>{if(!this.prisma)return this.search(tenantId,f);const where:Prisma.ClinicSaleRecordWhereInput={tenantId,...(f.status?{status:f.status}:{}),...(f.customerOwnerId?{customerOwnerId:f.customerOwnerId}:{}),...(f.customerPatientId?{customerPatientId:f.customerPatientId}:{}),...(f.sourceType?{sourceType:f.sourceType}:{}),...(f.sourceId?{sourceId:f.sourceId}:{}),...(f.search?.trim()?{OR:[{id:{contains:f.search.trim()}},{sourceId:{contains:f.search.trim()}},{notes:{contains:f.search.trim(),mode:"insensitive"}}]}:{})};return this.inTenant(tenantId,async tx=>{const[items,total]=await Promise.all([tx.clinicSaleRecord.findMany({where,orderBy:{createdAt:f.sort??"desc"},skip:f.offset,take:f.limit}),tx.clinicSaleRecord.count({where})]);return{items:items.map(row=>this.mapSale(row)),total};});}

  public insertLine(record: ClinicSaleLineRecord): ClinicSaleLineRecord {
    this.lineById.set(record.id, record);
    const list = this.linesBySale.get(record.saleId) ?? [];
    list.push(record.id);
    this.linesBySale.set(record.saleId, list);
    return record;
  }

  public findById(tenantId: string, id: string): ClinicSaleRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public listLinesBySale(
    tenantId: string,
    saleId: string,
  ): ClinicSaleLineRecord[] {
    const ids = this.linesBySale.get(saleId) ?? [];
    const out: ClinicSaleLineRecord[] = [];
    for (const id of ids) {
      const rec = this.lineById.get(id);
      if (rec && rec.tenantId === tenantId) out.push(rec);
    }
    return out;
  }

  public update(
    tenantId: string,
    id: string,
    patch: ClinicSalePatch,
  ): ClinicSaleRecord | null {
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
    filters: ClinicSaleSearchFilters,
  ): { items: ClinicSaleRecord[]; total: number } {
    const needle = filters.search?.toLowerCase().trim();

    const all: ClinicSaleRecord[] = [];
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
      if (filters.sourceType && rec.sourceType !== filters.sourceType) continue;
      if (filters.sourceId && rec.sourceId !== filters.sourceId) continue;
      if (needle) {
        const hay = [rec.id, rec.sourceId, rec.notes ?? ""]
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
    this.linesBySale.clear();
    this.counters.clear();
    this.lineCounters.clear();
  }
  private mapSale(row:DbSale):ClinicSaleRecord{return{...row,status:row.status as ClinicSaleStatus,sourceType:row.sourceType as ClinicSaleSourceType,completedAt:row.completedAt?.toISOString()??null,cancelledAt:row.cancelledAt?.toISOString()??null,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};}
  private mapLine(row:DbLine):ClinicSaleLineRecord{return{...row,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString()};}
  private async inTenant<T>(tenantId:string,callback:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{if(!this.prisma)throw new Error("Prisma bağlantısı bulunamadı");return this.prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;return callback(tx);});}
}
