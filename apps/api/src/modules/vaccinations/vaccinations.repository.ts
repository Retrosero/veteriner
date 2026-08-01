/**
 * @file Vaccinations repository (in-memory).
 * @module apps/api/modules/vaccinations/vaccinations.repository
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

import type {
  VaccinationRecord,
  VaccinationStatus,
} from "../../common/vaccinations/vaccination.types.js";

/** Patch tipi: kısmi güncelleme için izin verilen alanlar. */
export interface VaccinationPatch {
  status?: VaccinationStatus | undefined;
  cancelledAt?: string | null | undefined;
  cancellationReason?: string | null | undefined;
}

@Injectable()
export class VaccinationsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, VaccinationRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `vacr-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: VaccinationRecord): VaccinationRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(tenantId: string, id: string): VaccinationRecord | null {
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
    patch: VaccinationPatch,
  ): VaccinationRecord | null {
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
   * Tenant-scoped liste + filtre. En yeni kayıt üstte.
   */
  public search(
    tenantId: string,
    filters: {
      patientId?: string | undefined;
      protocolId?: string | undefined;
      status?: VaccinationStatus | undefined;
      from?: string | undefined;
      to?: string | undefined;
    },
  ): { items: VaccinationRecord[]; total: number } {
    const all: VaccinationRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (filters.protocolId && rec.protocolId !== filters.protocolId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.from && rec.administeredAt < filters.from) continue;
      if (filters.to && rec.administeredAt > filters.to) continue;
      all.push(rec);
    }
    all.sort((a, b) => b.administeredAt.localeCompare(a.administeredAt));
    return { items: all, total: all.length };
  }

  /**
   * Hasta bazlı liste. `status` opsiyonel; belirtilirse yalnızca
   * o statusdekiler döner. En yeni kayıt üstte.
   */
  public listByPatient(
    tenantId: string,
    patientId: string,
    status?: VaccinationStatus,
  ): VaccinationRecord[] {
    const out: VaccinationRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.patientId !== patientId) continue;
      if (status && rec.status !== status) continue;
      out.push(rec);
    }
    out.sort((a, b) => b.administeredAt.localeCompare(a.administeredAt));
    return out;
  }

  /**
   * Tenant + protokol kapsamında lot numarası tekil mi?
   * Yalnızca aktif (cancelled olmayan) kayıtlara bakılır.
   */
  public lotExists(
    tenantId: string,
    protocolId: string,
    lotNumber: string,
  ): boolean {
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.protocolId !== protocolId) continue;
      if (rec.lotNumber !== lotNumber) continue;
      if (rec.status === "cancelled") continue;
      return true;
    }
    return false;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }
}
