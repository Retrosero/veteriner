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

import { Injectable } from "@nestjs/common";

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
