/**
 * @file Diagnosis (teşhis) repository (in-memory).
 * @module apps/api/modules/diagnoses/diagnoses.repository
 * @description GOAL-043 teşhis kayıt veri erişim katmanı. DB migration
 * sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 * Production'a geçişte Prisma repository'si ile değiştirilecek
 * (API sözleşmesi sabit kalır).
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 * @since GOAL-043 (FAZ-4) teşhis ve problem listesi core
 */

import { Injectable, Optional } from "@nestjs/common";

import {
  toDiagnosis,
  type DiagnosisRecord,
} from "../../common/diagnoses/diagnosis.types.js";
import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  DiagnosisRecord as PrismaDiagnosis,
  Prisma,
} from "@prisma/client";
import type {
  Diagnosis,
  DiagnosisCategory,
  DiagnosisStatus,
} from "@vetniva/contracts";

// Re-export internal record tipini module barrel'ı için dışa aç.
export type { DiagnosisRecord };

@Injectable()
export class DiagnosesRepository {
  /** Key: id → record. */
  private readonly byId = new Map<string, DiagnosisRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}
  public async persist(r: DiagnosisRecord): Promise<DiagnosisRecord> {
    if (!this.prisma) return this.insert(r);
    this.insert(r);
    const x = await this.ctx(r.tenantId, (tx) =>
      tx.diagnosisRecord.create({
        data: {
          id: r.id,
          tenantId: r.tenantId,
          examinationId: r.examinationId,
          patientId: r.patientId,
          code: r.code,
          name: r.name,
          category: r.category,
          status: r.status,
          notes: r.notes,
          createdAt: new Date(r.createdAt),
          createdBy: r.createdBy,
          resolvedAt: r.resolvedAt ? new Date(r.resolvedAt) : null,
          archivedAt: r.archivedAt ? new Date(r.archivedAt) : null,
        },
      }),
    );
    return this.map(x);
  }
  public async persistedId(
    t: string,
    id: string,
  ): Promise<DiagnosisRecord | null> {
    if (!this.prisma) return this.findById(t, id);
    const x = await this.ctx(t, (tx) =>
      tx.diagnosisRecord.findUnique({ where: { id } }),
    );
    return x ? this.map(x) : null;
  }
  public async persistedByExam(
    t: string,
    examinationId: string,
  ): Promise<DiagnosisRecord[]> {
    if (!this.prisma) return this.findByExaminationId(t, examinationId);
    const x = await this.ctx(t, (tx) =>
      tx.diagnosisRecord.findMany({
        where: { tenantId: t, examinationId, archivedAt: null },
        orderBy: { createdAt: "asc" },
      }),
    );
    return x.map((y) => this.map(y));
  }
  public async persistedByPatient(
    t: string,
    patientId: string,
    f: {
      status?: DiagnosisStatus | undefined;
      includeArchived?: boolean | undefined;
    } = {},
  ): Promise<DiagnosisRecord[]> {
    if (!this.prisma) return this.findByPatientId(t, patientId, f);
    const x = await this.ctx(t, (tx) =>
      tx.diagnosisRecord.findMany({
        where: {
          tenantId: t,
          patientId,
          ...(f.status ? { status: f.status } : {}),
          ...(f.includeArchived ? {} : { archivedAt: null }),
        },
        orderBy: { createdAt: "desc" },
      }),
    );
    return x.map((y) => this.map(y));
  }
  public async persistedUpdate(
    t: string,
    id: string,
    p: Parameters<DiagnosesRepository["update"]>[2],
  ): Promise<DiagnosisRecord | null> {
    if (!this.prisma) return this.update(t, id, p);
    const d: Prisma.DiagnosisRecordUpdateManyMutationInput = {
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.category !== undefined ? { category: p.category } : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
      ...(p.code !== undefined ? { code: p.code } : {}),
      ...(p.resolvedAt !== undefined
        ? { resolvedAt: p.resolvedAt ? new Date(p.resolvedAt) : null }
        : {}),
      ...(p.archivedAt !== undefined
        ? { archivedAt: p.archivedAt ? new Date(p.archivedAt) : null }
        : {}),
    };
    const c = await this.ctx(t, (tx) =>
      tx.diagnosisRecord.updateMany({ where: { id, tenantId: t }, data: d }),
    );
    return c.count ? this.persistedId(t, id) : null;
  }
  private async ctx<T>(
    t: string,
    f: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı");
    return this.prisma.$transaction(async (x) => {
      await x.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;
      await x.$executeRaw`SELECT set_config('app.tenant_id',${t},true)`;
      return f(x);
    });
  }
  private map(x: PrismaDiagnosis): DiagnosisRecord {
    return {
      id: x.id,
      tenantId: x.tenantId,
      examinationId: x.examinationId,
      patientId: x.patientId,
      code: x.code,
      name: x.name,
      category: x.category as DiagnosisCategory,
      status: x.status as DiagnosisStatus,
      notes: x.notes,
      createdAt: x.createdAt.toISOString(),
      createdBy: x.createdBy,
      resolvedAt: x.resolvedAt?.toISOString() ?? null,
      archivedAt: x.archivedAt?.toISOString() ?? null,
    };
  }

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `diag-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public insert(record: DiagnosisRecord): DiagnosisRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(tenantId: string, id: string): DiagnosisRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Bir muayeneye bağlı tüm aktif (archivedAt=null) teşhisleri
   * sıralı getirir.
   * @param tenantId
   * @param examinationId
   */
  public findByExaminationId(
    tenantId: string,
    examinationId: string,
  ): DiagnosisRecord[] {
    const out: DiagnosisRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.examinationId !== examinationId) continue;
      if (rec.archivedAt !== null) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return out;
  }

  /**
   * Bir hastanın tüm muayenelerinden teşhisleri toplar. Opsiyonel
   * status filtresi uygulanır. Arşivlenmiş kayıtlar default olarak
   * gizlenir.
   * @param tenantId
   * @param patientId
   * @param filters
   * @param filters.status
   * @param filters.includeArchived
   */
  public findByPatientId(
    tenantId: string,
    patientId: string,
    filters: {
      status?: DiagnosisStatus | undefined;
      includeArchived?: boolean | undefined;
    } = {},
  ): DiagnosisRecord[] {
    const out: DiagnosisRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.patientId !== patientId) continue;
      if (!filters.includeArchived && rec.archivedAt !== null) continue;
      if (filters.status && rec.status !== filters.status) continue;
      out.push(rec);
    }
    out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return out;
  }

  /**
   * Kısmi güncelleme. `undefined` atlanır; `null` açıkça null yapar.
   * Sadece izin verilen alanlar patch'e kabul edilir.
   * @param tenantId
   * @param id
   * @param patch
   * @param patch.status
   * @param patch.category
   * @param patch.notes
   * @param patch.code
   * @param patch.resolvedAt
   * @param patch.archivedAt
   */
  public update(
    tenantId: string,
    id: string,
    patch: {
      status?: DiagnosisStatus | undefined;
      category?: DiagnosisCategory | undefined;
      notes?: string | null | undefined;
      code?: string | null | undefined;
      resolvedAt?: string | null | undefined;
      archivedAt?: string | null | undefined;
    },
  ): DiagnosisRecord | null {
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

  public toRecord(args: DiagnosisRecord): DiagnosisRecord {
    return { ...args };
  }
}

/**
 * Record → public Diagnosis.
 * @param rec
 */
export function toDiagnosisPublic(rec: DiagnosisRecord): Diagnosis {
  return toDiagnosis(rec);
}
