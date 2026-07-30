/**
 * @file Examination repository (in-memory).
 * @module apps/api/modules/examinations/examinations.repository
 *
 * @description Examination + ExaminationAmend veri erişim katmanı.
 * GOAL-040 kapsamında DB migration sonraya bırakıldı; tenant-scoped
 * in-memory Map kullanılır. Production'a geçişte Prisma repository'si
 * ile değiştirilecek (API sözleşmesi sabit kalır).
 *
 * İki ayrı store:
 * - `ExaminationsRepository`: muayene kayıtları (status state machine)
 * - `ExaminationAmendsRepository`: amendment (düzeltme) kayıtları;
 *   append-only politika; her amendment eski imza zamanını/imzacısını
 *   saklar.
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-040 (FAZ-4) muayene başlatma ve yaşam döngüsü core
 */

import { Injectable } from "@nestjs/common";

import type {
  Examination,
  ExaminationAmend,
  ExaminationStatus,
  ExaminationType,
} from "@vetniva/contracts";

/** Persist edilmiş examination record. */
export interface ExaminationRecord {
  id: string;
  tenantId: string;
  patientId: string;
  veterinarianId: string;
  appointmentId: string | null;
  status: ExaminationStatus;
  type: ExaminationType;
  chiefComplaint: string;
  startedAt: string;
  completedAt: string | null;
  signedAt: string | null;
  signedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Persist edilmiş amendment (düzeltme) record. */
export interface ExaminationAmendRecord {
  id: string;
  tenantId: string;
  examinationId: string;
  reason: string;
  amendedBy: string;
  amendedAt: string;
  previousSignedAt: string | null;
  previousSignedBy: string | null;
}

@Injectable()
export class ExaminationsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, ExaminationRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `exam-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: ExaminationRecord): ExaminationRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): ExaminationRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Kısmi güncelleme. `undefined` alanlar atlanır; `null` alanlar
   * açıkça null yapılır (örn. `completedAt`).
   */
  public update(
    tenantId: string,
    id: string,
    patch: {
      status?: ExaminationStatus | undefined;
      completedAt?: string | null | undefined;
      signedAt?: string | null | undefined;
      signedBy?: string | null | undefined;
      updatedAt?: string | undefined;
    },
  ): ExaminationRecord | null {
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
   * Tenant-scoped liste + filtre. `from`/`to` aralığı `startedAt`
   * alanına göre uygulanır. En yeni muayene üstte.
   */
  public search(
    tenantId: string,
    filters: {
      patientId?: string | undefined;
      veterinarianId?: string | undefined;
      status?: ExaminationStatus | undefined;
      from?: string | undefined;
      to?: string | undefined;
      limit: number;
      offset: number;
    },
  ): { items: ExaminationRecord[]; total: number } {
    const all: ExaminationRecord[] = [];
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
      if (filters.from && rec.startedAt < filters.from) continue;
      if (filters.to && rec.startedAt > filters.to) continue;
      all.push(rec);
    }
    all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }

  public toRecord(args: ExaminationRecord): ExaminationRecord {
    return { ...args };
  }
}

@Injectable()
export class ExaminationAmendsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, ExaminationAmendRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `examamend-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: ExaminationAmendRecord): ExaminationAmendRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): ExaminationAmendRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findByExaminationId(
    tenantId: string,
    examinationId: string,
  ): ExaminationAmendRecord[] {
    const out: ExaminationAmendRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.examinationId === examinationId) out.push(rec);
    }
    out.sort((a, b) => a.amendedAt.localeCompare(b.amendedAt));
    return out;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }
}

/** Record → public Examination (API response). */
export function toExamination(rec: ExaminationRecord): Examination {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    patientId: rec.patientId,
    veterinarianId: rec.veterinarianId,
    appointmentId: rec.appointmentId,
    status: rec.status,
    type: rec.type,
    chiefComplaint: rec.chiefComplaint,
    startedAt: rec.startedAt,
    completedAt: rec.completedAt,
    signedAt: rec.signedAt,
    signedBy: rec.signedBy,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

/** Record → public ExaminationAmend (API response). */
export function toExaminationAmend(
  rec: ExaminationAmendRecord,
): ExaminationAmend {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    examinationId: rec.examinationId,
    reason: rec.reason,
    amendedBy: rec.amendedBy,
    amendedAt: rec.amendedAt,
    previousSignedAt: rec.previousSignedAt,
    previousSignedBy: rec.previousSignedBy,
  };
}
