/**
 * @file Clinical record share repository (in-memory).
 * @module apps/api/modules/clinical-records/clinical-records.repository
 *
 * @description GOAL-047 klinik kayıt paylaşım kayıtları veri erişim
 * katmanı. DB migration sonraya bırakıldı; tenant-scoped in-memory
 * Map kullanılır. Production'a geçişte Prisma repository'si ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * Soft delete: `revokeShare` `revokedAt` set eder; kayıt fiziksel
 * silinmez (immutable audit amaçlı).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-047 (FAZ-4) klinik kayıt PDF ve paylaşım core
 */

import { Injectable } from "@nestjs/common";

import type {
  ClinicalRecordShare,
  ShareChannel,
} from "@vetniva/contracts";

/** Persist edilmiş share record. */
export interface ClinicalRecordShareRecord {
  id: string;
  tenantId: string;
  examinationId: string;
  fileId: string;
  channels: ShareChannel[];
  sentChannels: ShareChannel[];
  createdAt: string;
  createdBy: string;
  expiresAt: string;
  revokedAt: string | null;
  signedUrl: string | null;
}

@Injectable()
export class ClinicalRecordSharesRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, ClinicalRecordShareRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `crshare-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: ClinicalRecordShareRecord): ClinicalRecordShareRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(
    tenantId: string,
    id: string,
  ): ClinicalRecordShareRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Bir muayeneye ait tüm paylaşım kayıtlarını `createdAt` desc
   * sırayla döner.
   */
  public findByExamination(
    tenantId: string,
    examinationId: string,
  ): ClinicalRecordShareRecord[] {
    const out: ClinicalRecordShareRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.examinationId !== examinationId) continue;
      out.push(rec);
    }
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return out;
  }

  /** Soft delete: `revokedAt` set edilir. */
  public revoke(
    tenantId: string,
    id: string,
    revokedAt: string,
  ): ClinicalRecordShareRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    if (rec.revokedAt !== null) return rec; // idempotent
    rec.revokedAt = revokedAt;
    this.byId.set(id, rec);
    return rec;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }
}

/** Record → public ClinicalRecordShare (API response). */
export function toClinicalRecordShare(
  rec: ClinicalRecordShareRecord,
): ClinicalRecordShare {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    examinationId: rec.examinationId,
    fileId: rec.fileId,
    channels: [...rec.channels],
    sentChannels: [...rec.sentChannels],
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    expiresAt: rec.expiresAt,
    revokedAt: rec.revokedAt,
    signedUrl: rec.signedUrl,
  };
}
