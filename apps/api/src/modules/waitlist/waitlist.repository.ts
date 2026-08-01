/**
 * @file Waitlist repository (in-memory).
 * @module apps/api/modules/waitlist/waitlist.repository
 *
 * @description Waitlist veri erişim katmanı. GOAL-032 kapsamında DB
 * migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır. Production'a geçişte Prisma repository'si ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-032 (FAZ-3) bekleme listesi core
 */

import { Injectable } from "@nestjs/common";

import type {
  WaitlistFilters,
  WaitlistPriority,
  WaitlistStatus,
} from "@vetniva/contracts";

/** Persist edilmiş waitlist record. */
export interface WaitlistEntryRecord {
  id: string;
  tenantId: string;
  patientId: string;
  ownerId: string;
  status: WaitlistStatus;
  preferredDate: string | null;
  preferredVeterinarianId: string | null;
  reason: string;
  priority: WaitlistPriority;
  createdAt: string;
  notifiedAt: string | null;
  scheduledAppointmentId: string | null;
  expiresAt: string;
}

@Injectable()
export class WaitlistRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, WaitlistEntryRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `wl-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: WaitlistEntryRecord): WaitlistEntryRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(tenantId: string, id: string): WaitlistEntryRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public update(
    tenantId: string,
    id: string,
    patch: Partial<
      Pick<
        WaitlistEntryRecord,
        | "status"
        | "preferredDate"
        | "preferredVeterinarianId"
        | "notifiedAt"
        | "scheduledAppointmentId"
      >
    >,
  ): WaitlistEntryRecord | null {
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
   * Tenant-scoped liste + filtre. `from`/`to` aralığı `createdAt`
   * alanına göre uygulanır. Tüm status'ler dahil edilir (UI filtreler).
   */
  public search(
    tenantId: string,
    filters: WaitlistFilters,
  ): { items: WaitlistEntryRecord[]; total: number } {
    const all: WaitlistEntryRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.priority && rec.priority !== filters.priority) continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (filters.from && rec.createdAt < filters.from) continue;
      if (filters.to && rec.createdAt > filters.to) continue;
      all.push(rec);
    }
    const total = all.length;
    return { items: all, total };
  }

  /**
   * Süresi dolmuş (status=waiting && expiresAt<now) tüm tenant'lardaki
   * kayıtları döner. `expireOverdue` periyodik job'ı tarafından
   * çağrılır.
   */
  public findOverdueAll(now: Date): WaitlistEntryRecord[] {
    const cutoff = now.toISOString();
    const result: WaitlistEntryRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.status === "waiting" && rec.expiresAt < cutoff) {
        result.push(rec);
      }
    }
    return result;
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
    status: WaitlistStatus;
    preferredDate: string | null;
    preferredVeterinarianId: string | null;
    reason: string;
    priority: WaitlistPriority;
    createdAt: string;
    notifiedAt: string | null;
    scheduledAppointmentId: string | null;
    expiresAt: string;
  }): WaitlistEntryRecord {
    return { ...args };
  }
}
