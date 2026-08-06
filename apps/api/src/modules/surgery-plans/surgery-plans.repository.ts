/**
 * @file SurgeryPlan repository (in-memory).
 * @module apps/api/modules/surgery-plans/surgery-plans.repository
 *
 * @description GOAL-080 ameliyat planı veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır.
 *
 * @security Tüm sorgular tenantId ile filtrelenir.
 *
 * @since GOAL-080 (FAZ-8) ameliyat planlama core
 */

import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type { SurgeryPlanRecord } from "../../common/surgery-plans/surgery-plan.types.js";
import type { Prisma, SurgeryPlanRecord as DbPlan } from "@prisma/client";
import type { SurgeryPlanStatus } from "@vetniva/contracts";

/** Patch tipi. */
export interface SurgeryPlanPatch {
  operationType?: string | undefined;
  scheduledAt?: string | undefined;
  appointmentId?: string | null | undefined;
  notes?: string | null | undefined;
  status?: SurgeryPlanStatus | undefined;
  startedAt?: string | null | undefined;
  startedBy?: string | null | undefined;
  completedAt?: string | null | undefined;
  completedBy?: string | null | undefined;
  cancelledAt?: string | null | undefined;
  cancelledBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface SurgeryPlanSearchFilters {
  status?: SurgeryPlanStatus | undefined;
  patientId?: string | undefined;
  leadSurgeonUserId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class SurgeryPlansRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, SurgeryPlanRecord>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}
  public nextId(_tenantId: string): string {
    return randomUUID();
  }

  public insert(record: SurgeryPlanRecord): SurgeryPlanRecord {
    this.byId.set(record.id, record);
    return record;
  }
  public async persist(record: SurgeryPlanRecord): Promise<SurgeryPlanRecord> {
    if (!this.prisma) return this.insert(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.surgeryPlanRecord.create({
        data: {
          ...record,
          scheduledAt: new Date(record.scheduledAt),
          startedAt: record.startedAt ? new Date(record.startedAt) : null,
          completedAt: record.completedAt ? new Date(record.completedAt) : null,
          cancelledAt: record.cancelledAt ? new Date(record.cancelledAt) : null,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt),
        },
      }),
    );
    return this.map(row);
  }
  public async persistedById(
    tenantId: string,
    id: string,
  ): Promise<SurgeryPlanRecord | null> {
    if (!this.prisma) return this.findById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.surgeryPlanRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.map(row) : null;
  }
  public async persistedUpdate(
    tenantId: string,
    id: string,
    p: SurgeryPlanPatch,
  ): Promise<SurgeryPlanRecord | null> {
    if (!this.prisma) return this.update(tenantId, id, p);
    const data: Prisma.SurgeryPlanRecordUpdateManyMutationInput = {
      ...(p.operationType !== undefined
        ? { operationType: p.operationType }
        : {}),
      ...(p.scheduledAt !== undefined
        ? { scheduledAt: new Date(p.scheduledAt) }
        : {}),
      ...(p.appointmentId !== undefined
        ? { appointmentId: p.appointmentId }
        : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.startedAt !== undefined
        ? { startedAt: p.startedAt ? new Date(p.startedAt) : null }
        : {}),
      ...(p.startedBy !== undefined ? { startedBy: p.startedBy } : {}),
      ...(p.completedAt !== undefined
        ? { completedAt: p.completedAt ? new Date(p.completedAt) : null }
        : {}),
      ...(p.completedBy !== undefined ? { completedBy: p.completedBy } : {}),
      ...(p.cancelledAt !== undefined
        ? { cancelledAt: p.cancelledAt ? new Date(p.cancelledAt) : null }
        : {}),
      ...(p.cancelledBy !== undefined ? { cancelledBy: p.cancelledBy } : {}),
      ...(p.cancelReason !== undefined ? { cancelReason: p.cancelReason } : {}),
      ...(p.updatedAt !== undefined
        ? { updatedAt: new Date(p.updatedAt) }
        : {}),
    };
    const result = await this.inTenant(tenantId, (tx) =>
      tx.surgeryPlanRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return result.count ? this.persistedById(tenantId, id) : null;
  }
  public async persistedSearch(
    tenantId: string,
    f: SurgeryPlanSearchFilters,
  ): Promise<{ items: SurgeryPlanRecord[]; total: number }> {
    if (!this.prisma) return this.search(tenantId, f);
    const where: Prisma.SurgeryPlanRecordWhereInput = {
      tenantId,
      ...(f.status ? { status: f.status } : {}),
      ...(f.patientId ? { patientId: f.patientId } : {}),
      ...(f.leadSurgeonUserId
        ? { leadSurgeonUserId: f.leadSurgeonUserId }
        : {}),
      ...(f.from || f.to
        ? {
            scheduledAt: {
              ...(f.from ? { gte: new Date(`${f.from}T00:00:00.000Z`) } : {}),
              ...(f.to ? { lte: new Date(`${f.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };
    return this.inTenant(tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.surgeryPlanRecord.findMany({
          where,
          orderBy: { scheduledAt: f.sort ?? "desc" },
          skip: f.offset,
          take: f.limit,
        }),
        tx.surgeryPlanRecord.count({ where }),
      ]);
      return { items: items.map((row) => this.map(row)), total };
    });
  }

  public findById(tenantId: string, id: string): SurgeryPlanRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public update(
    tenantId: string,
    id: string,
    patch: SurgeryPlanPatch,
  ): SurgeryPlanRecord | null {
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

  public search(
    tenantId: string,
    filters: SurgeryPlanSearchFilters,
  ): { items: SurgeryPlanRecord[]; total: number } {
    const all: SurgeryPlanRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (
        filters.leadSurgeonUserId &&
        rec.leadSurgeonUserId !== filters.leadSurgeonUserId
      )
        continue;
      if (filters.from) {
        const day = rec.scheduledAt.slice(0, 10);
        if (day < filters.from) continue;
      }
      if (filters.to) {
        const day = rec.scheduledAt.slice(0, 10);
        if (day > filters.to) continue;
      }
      all.push(rec);
    }
    const sort = filters.sort ?? "desc";
    all.sort((a, b) => {
      const cmp = a.scheduledAt.localeCompare(b.scheduledAt);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
  }
  private map(row: DbPlan): SurgeryPlanRecord {
    return {
      ...row,
      status: row.status as SurgeryPlanStatus,
      scheduledAt: row.scheduledAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
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
