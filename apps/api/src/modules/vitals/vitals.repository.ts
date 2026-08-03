/**
 * @file Vitals repository (in-memory).
 * @module apps/api/modules/vitals/vitals.repository
 *
 * @description Vital bulguları veri erişim katmanı. GOAL-042
 * kapsamında DB migration sonraya bırakıldı; tenant-scoped
 * in-memory Map kullanılır. Production'a geçişte Prisma
 * repository'si ile değiştirilecek (API sözleşmesi sabit kalır).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-042 (FAZ-4) vital bulgular core
 */

import { Injectable, Optional } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { VitalRecord as PrismaVitalRecord, Prisma } from "@prisma/client";

import type { VitalSigns, VitalsRecord } from "@vetniva/contracts";

/** Persist edilmiş vital record. */
export interface VitalsPersistRecord {
  id: string;
  tenantId: string;
  examinationId: string;
  patientId: string;
  veterinarianId: string;
  vitalSigns: VitalSigns;
  takenAt: string;
  recordedBy: string;
}

@Injectable()
export class VitalsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, VitalsPersistRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}
  public async persist(r: VitalsPersistRecord): Promise<VitalsPersistRecord> {
    if (!this.prisma) return this.insert(r);
    this.insert(r);
    const x = await this.ctx(r.tenantId, (tx) =>
      tx.vitalRecord.create({
        data: {
          id: r.id,
          tenantId: r.tenantId,
          examinationId: r.examinationId,
          patientId: r.patientId,
          veterinarianId: r.veterinarianId,
          vitalSigns: r.vitalSigns as unknown as Prisma.InputJsonValue,
          takenAt: new Date(r.takenAt),
          recordedBy: r.recordedBy,
        },
      }),
    );
    return this.map(x);
  }
  public async persistedByExam(
    tenantId: string,
    examinationId: string,
  ): Promise<VitalsPersistRecord[]> {
    if (!this.prisma) return this.findByExamination(tenantId, examinationId);
    const x = await this.ctx(tenantId, (tx) =>
      tx.vitalRecord.findMany({
        where: { tenantId, examinationId },
        orderBy: { takenAt: "desc" },
      }),
    );
    return x.map((y) => this.map(y));
  }
  public async persistedLatest(
    tenantId: string,
    patientId: string,
  ): Promise<VitalsPersistRecord | null> {
    if (!this.prisma) return this.latestForPatient(tenantId, patientId);
    const x = await this.ctx(tenantId, (tx) =>
      tx.vitalRecord.findFirst({
        where: { tenantId, patientId },
        orderBy: { takenAt: "desc" },
      }),
    );
    return x ? this.map(x) : null;
  }
  private async ctx<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;
      return fn(tx);
    });
  }
  private map(x: PrismaVitalRecord): VitalsPersistRecord {
    return {
      id: x.id,
      tenantId: x.tenantId,
      examinationId: x.examinationId,
      patientId: x.patientId,
      veterinarianId: x.veterinarianId,
      vitalSigns: x.vitalSigns as unknown as VitalSigns,
      takenAt: x.takenAt.toISOString(),
      recordedBy: x.recordedBy,
    };
  }

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `vitals-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: VitalsPersistRecord): VitalsPersistRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(tenantId: string, id: string): VitalsPersistRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /** Tenant-scoped, examinationId filtresi. `takenAt` desc. */
  public findByExamination(
    tenantId: string,
    examinationId: string,
  ): VitalsPersistRecord[] {
    const out: VitalsPersistRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.examinationId === examinationId) out.push(rec);
    }
    out.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
    return out;
  }

  /**
   * Hasta için en yeni vital kaydı (takenAt desc). Bulunamazsa
   * `null`. Cross-tenant → null.
   */
  public latestForPatient(
    tenantId: string,
    patientId: string,
  ): VitalsPersistRecord | null {
    let latest: VitalsPersistRecord | null = null;
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.patientId !== patientId) continue;
      if (latest === null || rec.takenAt > latest.takenAt) {
        latest = rec;
      }
    }
    return latest;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }
}

/** Persist record → public VitalsRecord (API response). */
export function toVitalsRecord(rec: VitalsPersistRecord): VitalsRecord {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    examinationId: rec.examinationId,
    patientId: rec.patientId,
    veterinarianId: rec.veterinarianId,
    vitalSigns: rec.vitalSigns,
    takenAt: rec.takenAt,
    recordedBy: rec.recordedBy,
  };
}
