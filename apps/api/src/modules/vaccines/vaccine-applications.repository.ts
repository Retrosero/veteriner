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

import { Injectable, Optional } from "@nestjs/common";
import type {
  Prisma,
  VaccineApplicationRecord as DbApplication,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

import {
  toVaccineApplication,
  type VaccineApplicationRecord,
} from "../../common/vaccines/vaccine-application.types.js";

import type {
  VaccineApplicationStatus,
  VaccineApplication,
} from "@vetniva/contracts";

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
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  public nextId(tenantId: string): string {
    if (this.prisma) return `vaca-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `vaca-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public async persist(
    r: VaccineApplicationRecord,
  ): Promise<VaccineApplicationRecord> {
    if (!this.prisma) return this.insert(r);
    const row = await this.inTenant(r.tenantId, (tx) =>
      tx.vaccineApplicationRecord.create({
        data: {
          ...r,
          lot: r.lot as Prisma.InputJsonValue,
          dose: r.dose as Prisma.InputJsonValue,
          stockMovementIds: r.stockMovementIds as Prisma.InputJsonValue,
          applicationDate: new Date(r.applicationDate),
          createdAt: new Date(r.createdAt),
          updatedAt: new Date(r.updatedAt),
          amendedAt: r.amendedAt ? new Date(r.amendedAt) : null,
          cancelledAt: r.cancelledAt ? new Date(r.cancelledAt) : null,
        },
      }),
    );
    this.insert(r);
    return this.map(row);
  }
  public async persistedById(
    tenantId: string,
    id: string,
  ): Promise<VaccineApplicationRecord | null> {
    if (!this.prisma) return this.findById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.vaccineApplicationRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.map(row) : null;
  }
  public async persistedSearch(
    tenantId: string,
    f: Parameters<VaccineApplicationsRepository["search"]>[1],
  ): Promise<{ items: VaccineApplicationRecord[]; total: number }> {
    if (!this.prisma) return this.search(tenantId, f);
    const where: Prisma.VaccineApplicationRecordWhereInput = {
      tenantId,
      ...(f.patientId ? { patientId: f.patientId } : {}),
      ...(f.protocolId ? { protocolId: f.protocolId } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(!f.includeCancelled && !f.status
        ? { NOT: { status: "cancelled" } }
        : {}),
      ...(f.from || f.to
        ? {
            applicationDate: {
              ...(f.from ? { gte: new Date(f.from) } : {}),
              ...(f.to ? { lte: new Date(f.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await this.inTenant(tenantId, (tx) =>
      Promise.all([
        tx.vaccineApplicationRecord.findMany({
          where,
          orderBy: { applicationDate: "desc" },
          skip: f.offset,
          take: f.limit,
        }),
        tx.vaccineApplicationRecord.count({ where }),
      ]),
    );
    return { items: rows.map((r) => this.map(r)), total };
  }
  public async persistedByPatient(
    tenantId: string,
    patientId: string,
    limit = 50,
  ): Promise<VaccineApplicationRecord[]> {
    if (!this.prisma) return this.listByPatient(tenantId, patientId, limit);
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.vaccineApplicationRecord.findMany({
        where: { tenantId, patientId },
        orderBy: { applicationDate: "desc" },
        take: limit,
      }),
    );
    return rows.map((r) => this.map(r));
  }
  public async persistedUpdate(
    tenantId: string,
    id: string,
    p: VaccineApplicationPatch,
  ): Promise<VaccineApplicationRecord | null> {
    if (!this.prisma) return this.update(tenantId, id, p);
    const data: Prisma.VaccineApplicationRecordUpdateManyMutationInput = {
      ...(p.dose !== undefined
        ? { dose: p.dose as Prisma.InputJsonValue }
        : {}),
      ...(p.nextDueDate !== undefined ? { nextDueDate: p.nextDueDate } : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
      ...(p.lot !== undefined ? { lot: p.lot as Prisma.InputJsonValue } : {}),
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.updatedAt !== undefined
        ? { updatedAt: new Date(p.updatedAt) }
        : {}),
      ...(p.amendedAt !== undefined
        ? { amendedAt: p.amendedAt ? new Date(p.amendedAt) : null }
        : {}),
      ...(p.amendedBy !== undefined ? { amendedBy: p.amendedBy } : {}),
      ...(p.amendedReason !== undefined
        ? { amendedReason: p.amendedReason }
        : {}),
      ...(p.cancelledAt !== undefined
        ? { cancelledAt: p.cancelledAt ? new Date(p.cancelledAt) : null }
        : {}),
      ...(p.cancellationReason !== undefined
        ? { cancellationReason: p.cancellationReason }
        : {}),
      ...(p.stockMovementIds !== undefined
        ? { stockMovementIds: p.stockMovementIds as Prisma.InputJsonValue }
        : {}),
    };
    const out = await this.inTenant(tenantId, (tx) =>
      tx.vaccineApplicationRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return out.count ? this.persistedById(tenantId, id) : null;
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
      if (filters.protocolId && rec.protocolId !== filters.protocolId) continue;
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
  public isSameLot(
    a: VaccineApplicationRecord["lot"],
    b: VaccineApplicationRecord["lot"],
  ): boolean {
    return (
      a.stockProductId === b.stockProductId &&
      a.lot === b.lot &&
      a.expiryDate === b.expiryDate
    );
  }
  private map(row: DbApplication): VaccineApplicationRecord {
    return {
      ...row,
      lot: row.lot as VaccineApplicationRecord["lot"],
      dose: row.dose as VaccineApplicationRecord["dose"],
      status: row.status as VaccineApplicationRecord["status"],
      applicationDate: row.applicationDate.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      amendedAt: row.amendedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      stockMovementIds: row.stockMovementIds as unknown as string[],
    };
  }
  private async inTenant<T>(
    tenantId: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;
      return callback(tx);
    });
  }
}

/** Record → public VaccineApplication. */
export function toVaccineApplicationPublic(
  rec: VaccineApplicationRecord,
): VaccineApplication {
  return toVaccineApplication(rec);
}
