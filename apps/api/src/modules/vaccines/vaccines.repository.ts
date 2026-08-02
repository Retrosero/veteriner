/**
 * @file Vaccine (aşı protokolü) repository (in-memory).
 * @module apps/api/modules/vaccines/vaccines.repository
 *
 * @description GOAL-050 aşı protokolü veri erişim katmanı. DB
 * migration sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 * Production'a geçişte Prisma repository'si ile değiştirilecek (API
 * sözleşmesi sabit kalır).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı için
 *   uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-050 (FAZ-5) aşı kataloğu ve protokoller core
 */

import { Injectable, Optional } from "@nestjs/common";
import type { Prisma, VaccineProtocolRecord as DbProtocol } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

import {
  toVaccineProtocol,
  type VaccineProtocolRecord,
} from "../../common/vaccines/vaccine.types.js";

import type {
  SpeciesTarget,
  VaccineCategory,
  VaccineProtocol,
} from "@vetniva/contracts";

/** Patch tipi: kısmi güncelleme için izin verilen alanlar. */
export interface VaccineProtocolPatch {
  name?: string | undefined;
  category?: VaccineCategory | undefined;
  manufacturer?: string | null | undefined;
  defaultDose?: VaccineProtocolRecord["defaultDose"] | undefined;
  steps?: VaccineProtocolRecord["steps"] | undefined;
  totalDurationMonths?: number | undefined;
  isCore?: boolean | undefined;
  updatedAt?: string | undefined;
  archivedAt?: string | null | undefined;
}

@Injectable()
export class VaccinesRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, VaccineProtocolRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  public nextId(tenantId: string): string {
    if (this.prisma) return `vacp-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `vacp-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public async persist(record:VaccineProtocolRecord):Promise<VaccineProtocolRecord>{if(!this.prisma)return this.insert(record);const row=await this.inTenant(record.tenantId,tx=>tx.vaccineProtocolRecord.create({data:{...record,defaultDose:record.defaultDose as Prisma.InputJsonValue,steps:record.steps as Prisma.InputJsonValue,createdAt:new Date(record.createdAt),updatedAt:new Date(record.updatedAt),archivedAt:record.archivedAt?new Date(record.archivedAt):null}}));this.insert(record);return this.map(row);}
  public async persistedById(tenantId:string,id:string):Promise<VaccineProtocolRecord|null>{if(!this.prisma)return this.findById(tenantId,id);const row=await this.inTenant(tenantId,tx=>tx.vaccineProtocolRecord.findFirst({where:{tenantId,id}}));return row?this.map(row):null;}
  public async persistedSearch(tenantId:string,f:Parameters<VaccinesRepository["search"]>[1]):Promise<{items:VaccineProtocolRecord[];total:number}>{if(!this.prisma)return this.search(tenantId,f);const where:Prisma.VaccineProtocolRecordWhereInput={tenantId,archivedAt:null,...(f.species?{species:f.species}:{}),...(f.category?{category:f.category}:{}),...(f.isCore!==undefined?{isCore:f.isCore}:{})};const[rows,total]=await this.inTenant(tenantId,tx=>Promise.all([tx.vaccineProtocolRecord.findMany({where,orderBy:{createdAt:"desc"},skip:f.offset,take:f.limit}),tx.vaccineProtocolRecord.count({where})]));return{items:rows.map(r=>this.map(r)),total};}
  public async persistedUpdate(tenantId:string,id:string,p:VaccineProtocolPatch):Promise<VaccineProtocolRecord|null>{if(!this.prisma)return this.update(tenantId,id,p);const data:Prisma.VaccineProtocolRecordUpdateManyMutationInput={...(p.name!==undefined?{name:p.name}:{}),...(p.category!==undefined?{category:p.category}:{}),...(p.manufacturer!==undefined?{manufacturer:p.manufacturer}:{}),...(p.defaultDose!==undefined?{defaultDose:p.defaultDose as Prisma.InputJsonValue}:{}),...(p.steps!==undefined?{steps:p.steps as Prisma.InputJsonValue}:{}),...(p.totalDurationMonths!==undefined?{totalDurationMonths:p.totalDurationMonths}:{}),...(p.isCore!==undefined?{isCore:p.isCore}:{}),...(p.updatedAt!==undefined?{updatedAt:new Date(p.updatedAt)}:{}),...(p.archivedAt!==undefined?{archivedAt:p.archivedAt?new Date(p.archivedAt):null}:{})};const out=await this.inTenant(tenantId,tx=>tx.vaccineProtocolRecord.updateMany({where:{tenantId,id},data}));return out.count?this.persistedById(tenantId,id):null;}

  public insert(record: VaccineProtocolRecord): VaccineProtocolRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(tenantId: string, id: string): VaccineProtocolRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Kısmi güncelleme. `undefined` alanlar atlanır; `null` alanlar
   * açıkça null yapılır (örn. `archivedAt`).
   */
  public update(
    tenantId: string,
    id: string,
    patch: VaccineProtocolPatch,
  ): VaccineProtocolRecord | null {
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

  /**
   * Tenant-scoped liste + filtre. Arşivlenmiş kayıtlar
   * `includeArchived=true` olmadıkça dönmez. En yeni kayıt üstte.
   */
  public search(
    tenantId: string,
    filters: {
      species?: SpeciesTarget | undefined;
      category?: VaccineCategory | undefined;
      isCore?: boolean | undefined;
      limit: number;
      offset: number;
    },
  ): { items: VaccineProtocolRecord[]; total: number } {
    const all: VaccineProtocolRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.archivedAt !== null) continue;
      if (filters.species && rec.species !== filters.species) continue;
      if (filters.category && rec.category !== filters.category) continue;
      if (filters.isCore !== undefined && rec.isCore !== filters.isCore)
        continue;
      all.push(rec);
    }
    all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }

  public toRecord(args: VaccineProtocolRecord): VaccineProtocolRecord {
    return { ...args };
  }
  private map(row:DbProtocol):VaccineProtocolRecord{return{...row,species:row.species as VaccineProtocolRecord["species"],category:row.category as VaccineProtocolRecord["category"],defaultDose:row.defaultDose as VaccineProtocolRecord["defaultDose"],steps:row.steps as unknown as VaccineProtocolRecord["steps"],createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),archivedAt:row.archivedAt?.toISOString()??null};}
  private async inTenant<T>(tenantId:string,callback:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{if(!this.prisma)throw new Error("Prisma bağlantısı bulunamadı");return this.prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;return callback(tx);});}
}

/** Record → public VaccineProtocol (API response). */
export function toVaccineProtocolPublic(
  rec: VaccineProtocolRecord,
): VaccineProtocol {
  return toVaccineProtocol(rec);
}
