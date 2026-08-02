/**
 * @file ClinicalConsumption (klinik tüketim) repository (in-memory).
 * @module apps/api/modules/clinical-consumption/clinical-consumption.repository
 * @description GOAL-066 (FAZ-6) klinik tüketimden otomatik stok
 * düşümü veri erişim katmanı. DB migration sonraya bırakıldı;
 * tenant-scoped in-memory Map'ler kullanılır. Production'a
 * geçişte Prisma repository'si ile değiştirilecek (API sözleşmesi
 * sabit kalır).
 *
 * Veri yapıları:
 * - `byId` — tüketim kaydı ID → record.
 * - `byContextRef` — contextRefId → Set<consumptionId> (üst klinik
 *   kayıt bazlı arama; ör. muayene ID'si).
 * - `byContext` — context → Set<consumptionId> (tür bazlı arama).
 * - `byPatient` — patientId → Set<consumptionId> (opsiyonel; klinik
 *   geçmiş için).
 * - `counters` — tenant başına ID counter.
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü core
 */

import { Injectable, Optional } from "@nestjs/common";
import type { ClinicalConsumptionRecord as DbConsumption, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

import type { ClinicalConsumptionRecord } from "../../common/clinical-consumption/clinical-consumption.types.js";
import type {
  ClinicalConsumptionContext,
  ClinicalConsumptionStatus,
} from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Arama filtreleri
 * --------------------------------------------------------------------------
 * Tenant-scoped arama; context/contextRefId/patientId/status ve
 * tarih aralığı + pagination.
 */
export interface ClinicalConsumptionSearchFilters {
  context?: ClinicalConsumptionContext | undefined;
  contextRefId?: string | undefined;
  patientId?: string | undefined;
  status?: ClinicalConsumptionStatus | undefined;
  occurredFrom?: string | undefined;
  occurredTo?: string | undefined;
  limit: number;
  offset: number;
}

/* --------------------------------------------------------------------------
 * Repository
 * -------------------------------------------------------------------------- */

@Injectable()
export class ClinicalConsumptionRepository {
  /** Id → record. */
  private readonly byId = new Map<string, ClinicalConsumptionRecord>();
  /** ContextRefId → Set<consumptionId>. */
  private readonly byContextRef = new Map<string, Set<string>>();
  /** Context → Set<consumptionId>. */
  private readonly byContext = new Map<
    ClinicalConsumptionContext,
    Set<string>
  >();
  /** PatientId → Set<consumptionId>. */
  private readonly byPatient = new Map<string, Set<string>>();
  /** TenantId → next sequence. */
  private readonly counters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  /* ---------- ID üretimi ---------- */

  public nextId(tenantId: string): string {
    if (this.prisma) return `clco-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `clco-${tenantId.slice(0, 8)}-${String(n).padStart(8, "0")}`;
  }

  public async persist(rec: ClinicalConsumptionRecord): Promise<ClinicalConsumptionRecord> { if(!this.prisma)return this.insert(rec);const row=await this.inTenant(rec.tenantId,(tx)=>tx.clinicalConsumptionRecord.create({data:{...rec,lines:rec.lines as Prisma.InputJsonValue,stockMovementIds:rec.stockMovementIds as Prisma.InputJsonValue,occurredAt:new Date(rec.occurredAt),createdAt:new Date(rec.createdAt),cancelledAt:rec.cancelledAt?new Date(rec.cancelledAt):null}}));this.insert(rec);return this.map(row); }
  public async persistedById(tenantId:string,id:string):Promise<ClinicalConsumptionRecord|null>{if(!this.prisma)return this.findById(tenantId,id);const row=await this.inTenant(tenantId,(tx)=>tx.clinicalConsumptionRecord.findFirst({where:{tenantId,id}}));return row?this.map(row):null;}
  public async persistedByContextRef(tenantId:string,contextRefId:string):Promise<ClinicalConsumptionRecord[]>{if(!this.prisma)return this.listByContextRef(tenantId,contextRefId);const rows=await this.inTenant(tenantId,(tx)=>tx.clinicalConsumptionRecord.findMany({where:{tenantId,contextRefId}}));return rows.map(r=>this.map(r));}
  public async persistedSearch(tenantId:string,f:ClinicalConsumptionSearchFilters):Promise<{items:ClinicalConsumptionRecord[];total:number}>{if(!this.prisma)return this.search(tenantId,f);const where:Prisma.ClinicalConsumptionRecordWhereInput={tenantId,...(f.context?{context:f.context}:{}),...(f.contextRefId?{contextRefId:f.contextRefId}:{}),...(f.patientId?{patientId:f.patientId}:{}),...(f.status?{status:f.status}:{}),...(f.occurredFrom||f.occurredTo?{occurredAt:{...(f.occurredFrom?{gte:new Date(f.occurredFrom)}:{}),...(f.occurredTo?{lte:new Date(f.occurredTo)}:{})}}:{})};const[rows,total]=await this.inTenant(tenantId,(tx)=>Promise.all([tx.clinicalConsumptionRecord.findMany({where,orderBy:{occurredAt:"desc"},skip:f.offset,take:f.limit}),tx.clinicalConsumptionRecord.count({where})]));return{items:rows.map(r=>this.map(r)),total};}
  public async persistedCancel(tenantId:string,id:string,patch:Pick<ClinicalConsumptionRecord,"status"|"cancelledAt"|"cancelledBy"|"cancelReason">):Promise<ClinicalConsumptionRecord|null>{if(!this.prisma){const rec=this.findById(tenantId,id);if(!rec)return null;Object.assign(rec,patch);return rec;}const data={status:patch.status,cancelledAt:patch.cancelledAt?new Date(patch.cancelledAt):null,cancelledBy:patch.cancelledBy,cancelReason:patch.cancelReason};const out=await this.inTenant(tenantId,(tx)=>tx.clinicalConsumptionRecord.updateMany({where:{tenantId,id},data}));return out.count?this.persistedById(tenantId,id):null;}
  /** Tüketim iptali ve eksik ters stok kayıtlarını tek transaction'da yazar. */
  public async cancelWithReversals(tenantId:string,id:string,cancelledBy:string,cancelReason:string):Promise<ClinicalConsumptionRecord|null>{
    if(!this.prisma)return null;
    return this.inTenant(tenantId,async tx=>{
      const rec=await tx.clinicalConsumptionRecord.findFirst({where:{tenantId,id}});
      if(!rec)return null;
      const movementIds=rec.stockMovementIds as unknown as string[];
      const originals=await tx.stockMovementRecord.findMany({where:{tenantId,id:{in:movementIds}}});
      if(originals.length!==movementIds.length)throw new Error("Klinik tüketim stok hareketi bulunamadı");
      const prior=await tx.stockMovementRecord.findMany({where:{tenantId,reversesMovementId:{in:movementIds}},select:{reversesMovementId:true}});
      const reversed=new Set(prior.map(row=>row.reversesMovementId));
      const now=new Date();
      for(const original of originals){
        if(reversed.has(original.id))continue;
        const quantity=original.quantity.startsWith("-")?original.quantity.slice(1):`-${original.quantity}`;
        await tx.stockMovementRecord.create({data:{id:`stmv-${tenantId.slice(0,8)}-${randomUUID()}`,tenantId,type:"reversal",productId:original.productId,lotId:original.lotId,quantity,unitCost:original.unitCost,unitPrice:original.unitPrice,sourceType:"clinical_consumption_cancel",sourceId:id,reversesMovementId:original.id,reason:`clinical_consumption_cancel:${id}:${cancelReason}`,occurredAt:now,notes:null,createdAt:now,createdBy:cancelledBy}});
      }
      const update=await tx.clinicalConsumptionRecord.updateMany({where:{tenantId,id,status:"recorded"},data:{status:"cancelled",cancelledAt:now,cancelledBy,cancelReason}});
      if(!update.count)return this.map(rec);
      const row=await tx.clinicalConsumptionRecord.findFirst({where:{tenantId,id}});
      return row?this.map(row):null;
    });
  }

  /* ---------- Insert ---------- */

  public insert(rec: ClinicalConsumptionRecord): ClinicalConsumptionRecord {
    this.byId.set(rec.id, rec);
    this.addToIndex(this.byContextRef, rec.contextRefId, rec.id);
    this.addToIndex(this.byContext, rec.context, rec.id);
    if (rec.patientId) {
      this.addToIndex(this.byPatient, rec.patientId, rec.id);
    }
    return rec;
  }

  /* ---------- Basit sorgular ---------- */

  public findById(
    tenantId: string,
    id: string,
  ): ClinicalConsumptionRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Üst klinik kayıt için tüketim listesi (ör. Muayene ID'si).
   * @param tenantId
   * @param contextRefId
   */
  public listByContextRef(
    tenantId: string,
    contextRefId: string,
  ): ClinicalConsumptionRecord[] {
    const ids = this.byContextRef.get(contextRefId);
    if (!ids) return [];
    const result: ClinicalConsumptionRecord[] = [];
    for (const id of ids) {
      const rec = this.byId.get(id);
      if (rec && rec.tenantId === tenantId) result.push(rec);
    }
    return result;
  }

  /* ---------- Arama ---------- */

  public search(
    tenantId: string,
    filters: ClinicalConsumptionSearchFilters,
  ): { items: ClinicalConsumptionRecord[]; total: number } {
    let items: ClinicalConsumptionRecord[] = [];
    // Optimize: context + contextRefId verilmişse indeksli sorgu.
    if (filters.contextRefId) {
      items = this.listByContextRef(tenantId, filters.contextRefId);
      if (filters.context) {
        items = items.filter((r) => r.context === filters.context);
      }
    } else if (filters.context) {
      const ids = this.byContext.get(filters.context);
      if (ids) {
        for (const id of ids) {
          const rec = this.byId.get(id);
          if (rec && rec.tenantId === tenantId) items.push(rec);
        }
      }
    } else if (filters.patientId) {
      const ids = this.byPatient.get(filters.patientId);
      if (ids) {
        for (const id of ids) {
          const rec = this.byId.get(id);
          if (rec && rec.tenantId === tenantId) items.push(rec);
        }
      }
    } else {
      // Tüm tenant kayıtları.
      for (const rec of this.byId.values()) {
        if (rec.tenantId === tenantId) items.push(rec);
      }
    }

    // Filtreler (occurredFrom/To, status, patientId, context).
    if (filters.status) {
      items = items.filter((r) => r.status === filters.status);
    }
    if (filters.patientId && !filters.contextRefId && !filters.context) {
      items = items.filter((r) => r.patientId === filters.patientId);
    }
    if (filters.occurredFrom) {
      items = items.filter((r) => r.occurredAt >= filters.occurredFrom!);
    }
    if (filters.occurredTo) {
      items = items.filter((r) => r.occurredAt <= filters.occurredTo!);
    }

    // Sırala: en yeni önce.
    items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

    const total = items.length;
    const offset = filters.offset;
    const limit = filters.limit;
    const sliced = items.slice(offset, offset + limit);
    return { items: sliced, total };
  }

  /* ---------- Test yardımcıları ---------- */

  /** Test için tüm state'i temizler. */
  public clear(): void {
    this.byId.clear();
    this.byContextRef.clear();
    this.byContext.clear();
    this.byPatient.clear();
    this.counters.clear();
  }

  /* ---------- Private helpers ---------- */

  private addToIndex<K>(map: Map<K, Set<string>>, key: K, id: string): void {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(id);
  }
  private map(row:DbConsumption):ClinicalConsumptionRecord{return{id:row.id,tenantId:row.tenantId,context:row.context as ClinicalConsumptionRecord["context"],contextRefId:row.contextRefId,patientId:row.patientId,lines:row.lines as unknown as ClinicalConsumptionRecord["lines"],notes:row.notes,status:row.status as ClinicalConsumptionRecord["status"],occurredAt:row.occurredAt.toISOString(),createdAt:row.createdAt.toISOString(),createdBy:row.createdBy,cancelledAt:row.cancelledAt?.toISOString()??null,cancelledBy:row.cancelledBy,cancelReason:row.cancelReason,stockMovementIds:row.stockMovementIds as unknown as string[]};}
  private async inTenant<T>(tenantId:string,callback:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{if(!this.prisma)throw new Error("Prisma bağlantısı bulunamadı");return this.prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;return callback(tx);});}
}
