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

import { Injectable } from "@nestjs/common";

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

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `vacp-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

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
}

/** Record → public VaccineProtocol (API response). */
export function toVaccineProtocolPublic(
  rec: VaccineProtocolRecord,
): VaccineProtocol {
  return toVaccineProtocol(rec);
}
