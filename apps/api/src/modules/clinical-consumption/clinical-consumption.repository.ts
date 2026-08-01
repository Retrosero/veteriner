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

import { Injectable } from "@nestjs/common";

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

  /* ---------- ID üretimi ---------- */

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `clco-${tenantId.slice(0, 8)}-${String(n).padStart(8, "0")}`;
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
}
