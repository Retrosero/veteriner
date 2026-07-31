/**
 * @file Vaccine application (aşı uygulama) repository (in-memory).
 * @module apps/api/modules/vaccines/vaccine-applications.repository
 *
 * @description GOAL-051 aşı uygulama kaydı veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır. Production'a geçişte Prisma repository'si ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-051 (FAZ-5) aşı uygulama kaydı core
 */

import { Injectable } from "@nestjs/common";

import type { VaccineApplicationStatus } from "@vetniva/contracts";

import {
  toVaccineApplication,
  type VaccineApplicationRecord,
} from "../../common/vaccines/vaccine-application.types.js";
import type { VaccineApplication } from "@vetniva/contracts";

/** Patch tipi: kısmi güncelleme için izin verilen alanlar. */
export interface VaccineApplicationPatch {
  dose?: VaccineApplicationRecord["dose"] | undefined;
  nextDueDate?: string | null | undefined;
  notes?: string | null | undefined;
  /** GOAL-054 amendment: lot değişikliği durumunda. */
  lot?: VaccineApplicationRecord["lot"] | undefined;
  status?: VaccineApplicationStatus | undefined;
  updatedAt?: string | undefined;
  amendedAt?: string | null | undefined;
  amendedBy?: string | null | undefined;
  amendedReason?: string | null | undefined;
  cancelledAt?: string | null | undefined;
  cancellationReason?: string | null | undefined;
  stockMovementIds?: string[] | undefined;
}

@Injectable()
export class VaccineApplicationsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, VaccineApplicationRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `vaca-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: VaccineApplicationRecord): VaccineApplicationRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): VaccineApplicationRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Kısmi güncelleme. `undefined` alanlar atlanır; `null` alanlar
   * açıkça null yapılır.
   */
  public update(
    tenantId: string,
    id: string,
    patch: VaccineApplicationPatch,
  ): VaccineApplicationRecord | null {
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
   * Tenant-scoped liste + filtre. `cancelled` kayıtlar varsayılan
   * olarak dönmez; `includeCancelled=true` ile dahil edilir.
   * En yeni kayıt üstte.
   */
  public search(
    tenantId: string,
    filters: {
      patientId?: string | undefined;
      protocolId?: string | undefined;
      status?: VaccineApplicationStatus | undefined;
      from?: string | undefined;
      to?: string | undefined;
      includeCancelled?: boolean | undefined;
      limit: number;
      offset: number;
    },
  ): { items: VaccineApplicationRecord[]; total: number } {
    const all: VaccineApplicationRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (
        !filters.includeCancelled &&
        rec.status === "cancelled" &&
        filters.status !== "cancelled"
      )
        continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (filters.protocolId && rec.protocolId !== filters.protocolId)
        continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.from && rec.applicationDate < filters.from) continue;
      if (filters.to && rec.applicationDate > filters.to) continue;
      all.push(rec);
    }
    all.sort((a, b) => b.applicationDate.localeCompare(a.applicationDate));
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Hasta bazlı zaman çizelgesi yardımcısı. */
  public listByPatient(
    tenantId: string,
    patientId: string,
    limit: number = 50,
  ): VaccineApplicationRecord[] {
    const out: VaccineApplicationRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.patientId !== patientId) continue;
      out.push(rec);
    }
    out.sort((a, b) => b.applicationDate.localeCompare(a.applicationDate));
    return out.slice(0, limit);
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }

  /**
   * Yeni record oluşturma yardımcısı. Eski kayıtlar (GOAL-054
   * öncesi) `amendedReason` içermez; backfill için null default.
   */
  public toRecord(
    args: Omit<VaccineApplicationRecord, "amendedReason"> & {
      amendedReason?: string | null;
    },
  ): VaccineApplicationRecord {
    return { ...args, amendedReason: args.amendedReason ?? null };
  }

  /**
   * İki lot'un eşit olup olmadığını kontrol eder. Aynı
   * `stockProductId` + `lot` + `expiryDate` üçlüsü eşit sayılır.
   */
  public isSameLot(a: VaccineApplicationRecord["lot"], b: VaccineApplicationRecord["lot"]): boolean {
    return (
      a.stockProductId === b.stockProductId &&
      a.lot === b.lot &&
      a.expiryDate === b.expiryDate
    );
  }
}

/** Record → public VaccineApplication. */
export function toVaccineApplicationPublic(
  rec: VaccineApplicationRecord,
): VaccineApplication {
  return toVaccineApplication(rec);
}
