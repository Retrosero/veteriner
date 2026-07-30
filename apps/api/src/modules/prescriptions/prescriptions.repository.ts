/**
 * @file Prescription (reçete) repository (in-memory).
 * @module apps/api/modules/prescriptions/prescriptions.repository
 *
 * @description GOAL-045 reçete veri erişim katmanı. DB migration
 * sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 * Production'a geçişte Prisma repository'si ile değiştirilecek
 * (API sözleşmesi sabit kalır).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-045 (FAZ-4) reçete oluşturma core
 */

import { Injectable } from "@nestjs/common";

import type { Prescription } from "@vetniva/contracts";

import {
  toPrescription,
  type PrescriptionRecord,
} from "../../common/prescriptions/prescription.types.js";

/** Patch tipi: kısmi güncelleme için izin verilen alanlar. */
export interface PrescriptionPatch {
  status?: PrescriptionRecord["status"] | undefined;
  dispensedAt?: string | null | undefined;
  dispensedBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  updatedAt?: string | undefined;
}

@Injectable()
export class PrescriptionsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, PrescriptionRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `prsc-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: PrescriptionRecord): PrescriptionRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): PrescriptionRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Kısmi güncelleme. `undefined` alanlar atlanır; `null` alanlar
   * açıkça null yapılır (örn. `cancelReason`).
   */
  public update(
    tenantId: string,
    id: string,
    patch: PrescriptionPatch,
  ): PrescriptionRecord | null {
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
   * Tenant-scoped liste + filtre. `from`/`to` aralığı `prescribedAt`
   * alanına göre uygulanır. En yeni reçete üstte.
   */
  public search(
    tenantId: string,
    filters: {
      patientId?: string | undefined;
      status?: PrescriptionRecord["status"] | undefined;
      from?: string | undefined;
      to?: string | undefined;
      limit: number;
      offset: number;
    },
  ): { items: PrescriptionRecord[]; total: number } {
    const all: PrescriptionRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.from && rec.prescribedAt < filters.from) continue;
      if (filters.to && rec.prescribedAt > filters.to) continue;
      all.push(rec);
    }
    all.sort((a, b) => b.prescribedAt.localeCompare(a.prescribedAt));
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /**
   * Tüm tenant'larda `expiresAt < now` ve `status='active'` olan
   * reçeteleri getirir. `expireOverdue` periyodik job'ı içindir.
   */
  public findOverdueActive(nowIso: string): PrescriptionRecord[] {
    const out: PrescriptionRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.status !== "active") continue;
      if (rec.expiresAt < nowIso) out.push(rec);
    }
    return out;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }

  public toRecord(args: PrescriptionRecord): PrescriptionRecord {
    return { ...args };
  }
}

/** Record → public Prescription (API response). */
export function toPrescriptionPublic(rec: PrescriptionRecord): Prescription {
  return toPrescription(rec);
}
