/**
 * @file Lab result repository (in-memory).
 * @module apps/api/modules/lab-results/lab-results.repository
 *
 * @description GOAL-092 laboratuvar sonucu veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır.
 *
 * - `byId`: id → record
 * - `byOrder`: tenantId::labOrderId → id[] (sıralı ekleme)
 * - `counters`: tenant bazlı id sayacı
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-092 (FAZ-9) laboratuvar sonuçları core
 */

import { Injectable } from "@nestjs/common";

import type { LabResultRecord } from "../../common/lab-results/lab-result.types.js";
import type { LabAbnormalFlag } from "@vetniva/contracts";

/** Patch tipi. */
export interface LabResultPatch {
  value?: string | undefined;
  valueNumeric?: string | null | undefined;
  abnormalFlag?: LabAbnormalFlag | undefined;
  attachments?: string[] | undefined;
  notes?: string | null | undefined;
  status?:
    | "draft"
    | "pending_review"
    | "approved"
    | "amended"
    | undefined;
  reviewedBy?: string | null | undefined;
  reviewedAt?: string | null | undefined;
  reviewNotes?: string | null | undefined;
  amendmentReason?: string | null | undefined;
  updatedAt?: string | undefined;
}

@Injectable()
export class LabResultsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, LabResultRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `lr-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: LabResultRecord): LabResultRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): LabResultRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /** Order için tüm revizyonları döner (en yeni önce). */
  public listByOrder(
    tenantId: string,
    labOrderId: string,
  ): LabResultRecord[] {
    const out: LabResultRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId === tenantId && rec.labOrderId === labOrderId) {
        out.push(rec);
      }
    }
    out.sort((a, b) => b.revision - a.revision);
    return out;
  }

  /** Order için aktif (draft/pending_review/approved) sonucu döner. */
  public findActiveByOrder(
    tenantId: string,
    labOrderId: string,
  ): LabResultRecord | null {
    for (const rec of this.listByOrder(tenantId, labOrderId)) {
      if (rec.status !== "amended") return rec;
    }
    return null;
  }

  /** Order için bir sonraki revizyon numarası. */
  public nextRevision(tenantId: string, labOrderId: string): number {
    const all = this.listByOrder(tenantId, labOrderId);
    if (all.length === 0) return 1;
    return Math.max(...all.map((r) => r.revision)) + 1;
  }

  public update(
    tenantId: string,
    id: string,
    patch: LabResultPatch,
  ): LabResultRecord | null {
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

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }
}
