/**
 * @file Appointment repository (in-memory).
 * @module apps/api/modules/appointments/appointments.repository
 * @description Appointment veri erişim katmanı. GOAL-031 kapsamında
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır. Production'a geçişte Prisma repository'si ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 * @since GOAL-031 (FAZ-3) randevu oluşturma core
 */

import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { Appointment as PrismaAppointment, Prisma } from "@prisma/client";

import type {
  AppointmentFilters,
  AppointmentStatus,
  AppointmentType,
} from "@vetniva/contracts";

/** Persist edilmiş appointment record. */
export interface AppointmentRecord {
  id: string;
  tenantId: string;
  patientId: string;
  ownerId: string;
  veterinarianId: string;
  branchId: string | null;
  type: AppointmentType;
  status: AppointmentStatus;
  /** ISO 8601 datetime. */
  start: string;
  /** ISO 8601 datetime (start + durationMin). */
  end: string;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
}

/** Veterinarian kayıt defteri (in-memory). */
export interface VeterinarianRecord {
  id: string;
  tenantId: string;
  fullName: string;
  branchId: string | null;
  active: boolean;
}

@Injectable()
export class VeterinariansRepository {
  /** Key: id → record. */
  private readonly byId = new Map<string, VeterinarianRecord>();

  public upsert(record: VeterinarianRecord): VeterinarianRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(tenantId: string, id: string): VeterinarianRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
  }
}

@Injectable()
export class AppointmentsRepository {
  /** Key: id → record. */
  private readonly byId = new Map<string, AppointmentRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}
  /** Çalışma zamanı yolu RLS transaction kullanır; eski unit testleri Map ile sürer. */
  public async persist(record: AppointmentRecord): Promise<AppointmentRecord> { if(!this.prisma)return this.insert(record);this.insert(record);const row=await this.withTenant(record.tenantId,tx=>tx.appointment.create({data:{id:record.id,tenantId:record.tenantId,patientId:record.patientId,ownerId:record.ownerId,veterinarianId:record.veterinarianId,branchId:record.branchId,type:record.type,status:record.status,start:new Date(record.start),end:new Date(record.end),notes:record.notes,createdAt:new Date(record.createdAt),createdBy:record.createdBy}}));return this.fromPrisma(row); }
  public async findPersistedById(tenantId:string,id:string):Promise<AppointmentRecord|null>{if(!this.prisma)return this.findById(tenantId,id);const row=await this.withTenant(tenantId,tx=>tx.appointment.findUnique({where:{id}}));return row?this.fromPrisma(row):null;}
  public async searchPersisted(tenantId:string,filters:AppointmentFilters):Promise<{items:AppointmentRecord[];total:number}>{if(!this.prisma)return this.search(tenantId,filters);const where:Prisma.AppointmentWhereInput={tenantId,...(filters.patientId?{patientId:filters.patientId}:{}),...(filters.veterinarianId?{veterinarianId:filters.veterinarianId}:{}),...(filters.status?{status:filters.status}:{}),...(filters.from||filters.to?{start:{...(filters.from?{gte:new Date(filters.from)}:{}),...(filters.to?{lte:new Date(filters.to)}:{})}}:{})};const x=await this.withTenant(tenantId,async tx=>Promise.all([tx.appointment.findMany({where,orderBy:{start:'asc'},skip:filters.offset,take:filters.limit}),tx.appointment.count({where})]));return{items:x[0].map(r=>this.fromPrisma(r)),total:x[1]};}
  public async updatePersisted(tenantId:string,id:string,patch:Parameters<AppointmentsRepository['update']>[2]):Promise<AppointmentRecord|null>{if(!this.prisma)return this.update(tenantId,id,patch);const data:Prisma.AppointmentUpdateManyMutationInput={...(patch.patientId!==undefined?{patientId:patch.patientId}:{}),...(patch.ownerId!==undefined?{ownerId:patch.ownerId}:{}),...(patch.veterinarianId!==undefined?{veterinarianId:patch.veterinarianId}:{}),...(patch.branchId!==undefined?{branchId:patch.branchId}:{}),...(patch.type!==undefined?{type:patch.type}:{}),...(patch.status!==undefined?{status:patch.status}:{}),...(patch.start!==undefined?{start:new Date(patch.start)}:{}),...(patch.end!==undefined?{end:new Date(patch.end)}:{}),...(patch.notes!==undefined?{notes:patch.notes}:{}),...(patch.createdBy!==undefined?{createdBy:patch.createdBy}:{})};const changed=await this.withTenant(tenantId,tx=>tx.appointment.updateMany({where:{id,tenantId},data}));return changed.count?this.findPersistedById(tenantId,id):null;}
  public async listScheduledForCalendar(tenantId:string):Promise<AppointmentRecord[]>{if(!this.prisma)return this.search(tenantId,{limit:10000,offset:0}).items.filter(x=>x.status==='scheduled');const rows=await this.withTenant(tenantId,tx=>tx.appointment.findMany({where:{tenantId,status:'scheduled'}}));return rows.map(r=>this.fromPrisma(r));}
  /** Uygulama boot aşamasında yalnızca kalıcı scheduled kayıtları takvime yükler. */
  public async listScheduledForBootstrap(): Promise<AppointmentRecord[]> { if (!this.prisma) return []; const rows = await this.prisma.$transaction(async tx => { await tx.$executeRaw`SELECT set_config('app.is_superadmin','true',true)`; return tx.appointment.findMany({ where: { status: 'scheduled' } }); }); return rows.map(row => this.fromPrisma(row)); }
  private async withTenant<T>(tenantId:string,fn:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{if(!this.prisma)throw new Error('Prisma bağlantısı bulunamadı');return this.prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;return fn(tx);});}
  private fromPrisma(row:PrismaAppointment):AppointmentRecord{return{id:row.id,tenantId:row.tenantId,patientId:row.patientId,ownerId:row.ownerId,veterinarianId:row.veterinarianId,branchId:row.branchId,type:row.type as AppointmentType,status:row.status as AppointmentStatus,start:row.start.toISOString(),end:row.end.toISOString(),notes:row.notes,createdAt:row.createdAt.toISOString(),createdBy:row.createdBy};}

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `appt-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: AppointmentRecord): AppointmentRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(tenantId: string, id: string): AppointmentRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public update(
    tenantId: string,
    id: string,
    patch: {
      patientId?: string | undefined;
      ownerId?: string | undefined;
      veterinarianId?: string | undefined;
      branchId?: string | null | undefined;
      type?: AppointmentType | undefined;
      status?: AppointmentStatus | undefined;
      start?: string | undefined;
      end?: string | undefined;
      notes?: string | null | undefined;
      createdBy?: string | null | undefined;
    },
  ): AppointmentRecord | null {
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
   * Tenant-scoped liste + filtre. `from`/`to` aralığı `start`
   * alanına göre uygulanır. İptal edilen randevular varsayılan
   * olarak DAHİL edilir (UI filtreler; burada nötr kalırız).
   * @param tenantId
   * @param filters
   */
  public search(
    tenantId: string,
    filters: AppointmentFilters,
  ): { items: AppointmentRecord[]; total: number } {
    const all: AppointmentRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (
        filters.veterinarianId &&
        rec.veterinarianId !== filters.veterinarianId
      ) {
        continue;
      }
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.from && rec.start < filters.from) continue;
      if (filters.to && rec.start > filters.to) continue;
      all.push(rec);
    }
    // En yakın randevu üstte.
    all.sort((a, b) => a.start.localeCompare(b.start));
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }

  public toRecord(args: {
    id: string;
    tenantId: string;
    patientId: string;
    ownerId: string;
    veterinarianId: string;
    branchId: string | null;
    type: AppointmentType;
    status: AppointmentStatus;
    start: string;
    end: string;
    notes: string | null;
    createdBy: string | null;
    createdAt: string;
  }): AppointmentRecord {
    return { ...args };
  }
}
