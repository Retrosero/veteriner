/**
 * @file HospitalizationOrder repository (in-memory).
 * @module apps/api/modules/hospitalization-orders/hospitalization-orders.repository
 *
 * @description GOAL-085 yatış order + schedule veri erişim
 * katmanı. DB migration sonraya bırakıldı; tenant-scoped in-memory
 * Map kullanılır. 2 varlık (order, schedule) ayrı Map'lerde tutulur.
 *
 * @security Tüm sorgular tenantId ile filtrelenir; cross-tenant
 *   erişim null döner.
 *
 * @since GOAL-085 (FAZ-8) yatış order ve uygulama kayıtları core
 */

import { Injectable, Optional } from "@nestjs/common";
import type {
  HospitalizationOrderRecord as DbOrder,
  HospitalizationOrderScheduleRecord as DbSchedule,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import type {
  HospitalizationOrderRecord,
  HospitalizationOrderScheduleRecord,
} from "../../common/hospitalization-orders/hospitalization-order.types.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import type {
  HospitalizationOrderPriority,
  HospitalizationOrderStatus,
  HospitalizationOrderType,
} from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Patch tipleri
 * --------------------------------------------------------------------------
 */

export interface HospitalizationOrderPatch {
  instructions?: string | undefined;
  frequency?: string | null | undefined;
  priority?: HospitalizationOrderPriority | undefined;
  endsAt?: string | null | undefined;
  notes?: string | null | undefined;
  status?: HospitalizationOrderStatus | undefined;
  cancelledAt?: string | null | undefined;
  cancelledBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  updatedAt?: string | undefined;
}

export interface HospitalizationOrderSchedulePatch {
  appliedAt?: string | null | undefined;
  appliedByUserId?: string | null | undefined;
  skippedAt?: string | null | undefined;
  skippedByUserId?: string | null | undefined;
  skipReason?: string | null | undefined;
}

/* --------------------------------------------------------------------------
 * Arama filtreleri
 * --------------------------------------------------------------------------
 */

export interface HospitalizationOrderSearchFilters {
  hospitalizationId?: string | undefined;
  orderType?: HospitalizationOrderType | undefined;
  status?: HospitalizationOrderStatus | undefined;
  priority?: HospitalizationOrderPriority | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

export interface HospitalizationOrderScheduleSearchFilters {
  orderId?: string | undefined;
  status?: "pending" | "applied" | "skipped" | "overdue" | undefined;
  asOf?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class HospitalizationOrdersRepository {
  public constructor(@Optional() private readonly prisma?: PrismaService) {}
  private readonly counters = new Map<string, number>();

  public nextId(tenantId: string, prefix: string): string {
    if (this.prisma) return randomUUID();
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `${prefix}-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  // -------------------------------------------------------------------------
  // Order
  // -------------------------------------------------------------------------

  private readonly orders = new Map<string, HospitalizationOrderRecord>();

  public insertOrder(
    rec: HospitalizationOrderRecord,
  ): HospitalizationOrderRecord {
    this.orders.set(rec.id, rec);
    return rec;
  }

  public findOrderById(
    tenantId: string,
    id: string,
  ): HospitalizationOrderRecord | null {
    const rec = this.orders.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public updateOrder(
    tenantId: string,
    id: string,
    patch: HospitalizationOrderPatch,
  ): HospitalizationOrderRecord | null {
    const rec = this.findOrderById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.orders.set(id, rec);
    return rec;
  }

  public searchOrders(
    tenantId: string,
    filters: HospitalizationOrderSearchFilters,
  ): { items: HospitalizationOrderRecord[]; total: number } {
    const all: HospitalizationOrderRecord[] = [];
    for (const rec of this.orders.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (
        filters.hospitalizationId &&
        rec.hospitalizationId !== filters.hospitalizationId
      ) {
        continue;
      }
      if (filters.orderType && rec.orderType !== filters.orderType) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.priority && rec.priority !== filters.priority) continue;
      all.push(rec);
    }
    const sort = filters.sort ?? "desc";
    all.sort((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  // -------------------------------------------------------------------------
  // Schedule
  // -------------------------------------------------------------------------

  private readonly schedules = new Map<
    string,
    HospitalizationOrderScheduleRecord
  >();

  public insertSchedule(
    rec: HospitalizationOrderScheduleRecord,
  ): HospitalizationOrderScheduleRecord {
    this.schedules.set(rec.id, rec);
    return rec;
  }

  public findScheduleById(
    tenantId: string,
    id: string,
  ): HospitalizationOrderScheduleRecord | null {
    const rec = this.schedules.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public updateSchedule(
    tenantId: string,
    id: string,
    patch: HospitalizationOrderSchedulePatch,
  ): HospitalizationOrderScheduleRecord | null {
    const rec = this.findScheduleById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.schedules.set(id, rec);
    return rec;
  }

  public listSchedules(
    tenantId: string,
    orderId: string,
  ): HospitalizationOrderScheduleRecord[] {
    const out: HospitalizationOrderScheduleRecord[] = [];
    for (const rec of this.schedules.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.orderId !== orderId) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    return out;
  }

  public searchSchedules(
    tenantId: string,
    filters: HospitalizationOrderScheduleSearchFilters,
  ): { items: HospitalizationOrderScheduleRecord[]; total: number } {
    const all: HospitalizationOrderScheduleRecord[] = [];
    for (const rec of this.schedules.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.orderId && rec.orderId !== filters.orderId) continue;
      if (filters.status) {
        const isPending = rec.appliedAt === null && rec.skippedAt === null;
        const isApplied = rec.appliedAt !== null;
        const isSkipped = rec.skippedAt !== null;
        if (filters.status === "pending" && !isPending) continue;
        if (filters.status === "applied" && !isApplied) continue;
        if (filters.status === "skipped" && !isSkipped) continue;
        if (filters.status === "overdue") {
          if (!isPending) continue;
          if (filters.asOf && rec.scheduledFor >= filters.asOf) continue;
        }
      }
      all.push(rec);
    }
    const sort = filters.sort ?? "asc";
    all.sort((a, b) => {
      const cmp = a.scheduledFor.localeCompare(b.scheduledFor);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  public async persistOrder(
    rec: HospitalizationOrderRecord,
  ): Promise<HospitalizationOrderRecord> {
    if (!this.prisma) return this.insertOrder(rec);
    const row = await this.inTenant(rec.tenantId, (tx) =>
      tx.hospitalizationOrderRecord.create({ data: orderData(rec) }),
    );
    return mapOrder(row);
  }
  public async persistedOrderById(
    tenantId: string,
    id: string,
  ): Promise<HospitalizationOrderRecord | null> {
    if (!this.prisma) return this.findOrderById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.hospitalizationOrderRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? mapOrder(row) : null;
  }
  public async persistedOrders(
    tenantId: string,
    f: HospitalizationOrderSearchFilters,
  ): Promise<{ items: HospitalizationOrderRecord[]; total: number }> {
    if (!this.prisma) return this.searchOrders(tenantId, f);
    const where: Prisma.HospitalizationOrderRecordWhereInput = {
      tenantId,
      ...(f.hospitalizationId
        ? { hospitalizationId: f.hospitalizationId }
        : {}),
      ...(f.orderType ? { orderType: f.orderType } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.priority ? { priority: f.priority } : {}),
    };
    return this.inTenant(tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.hospitalizationOrderRecord.findMany({
          where,
          orderBy: { createdAt: f.sort ?? "desc" },
          skip: f.offset,
          take: f.limit,
        }),
        tx.hospitalizationOrderRecord.count({ where }),
      ]);
      return { items: items.map(mapOrder), total };
    });
  }
  public async persistedUpdateOrder(
    tenantId: string,
    id: string,
    p: HospitalizationOrderPatch,
  ): Promise<HospitalizationOrderRecord | null> {
    if (!this.prisma) return this.updateOrder(tenantId, id, p);
    const data: Prisma.HospitalizationOrderRecordUpdateManyMutationInput = {
      ...(p.instructions !== undefined ? { instructions: p.instructions } : {}),
      ...(p.frequency !== undefined ? { frequency: p.frequency } : {}),
      ...(p.priority !== undefined ? { priority: p.priority } : {}),
      ...(p.endsAt !== undefined ? { endsAt: dateOrNull(p.endsAt) } : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.cancelledAt !== undefined
        ? { cancelledAt: dateOrNull(p.cancelledAt) }
        : {}),
      ...(p.cancelledBy !== undefined ? { cancelledBy: p.cancelledBy } : {}),
      ...(p.cancelReason !== undefined ? { cancelReason: p.cancelReason } : {}),
      ...(p.updatedAt !== undefined
        ? { updatedAt: new Date(p.updatedAt) }
        : {}),
    };
    const x = await this.inTenant(tenantId, (tx) =>
      tx.hospitalizationOrderRecord.updateMany({
        where: { tenantId, id },
        data,
      }),
    );
    return x.count ? this.persistedOrderById(tenantId, id) : null;
  }
  public async persistSchedule(
    rec: HospitalizationOrderScheduleRecord,
  ): Promise<HospitalizationOrderScheduleRecord> {
    if (!this.prisma) return this.insertSchedule(rec);
    const row = await this.inTenant(rec.tenantId, (tx) =>
      tx.hospitalizationOrderScheduleRecord.create({ data: scheduleData(rec) }),
    );
    return mapSchedule(row);
  }
  public async persistedScheduleById(
    tenantId: string,
    id: string,
  ): Promise<HospitalizationOrderScheduleRecord | null> {
    if (!this.prisma) return this.findScheduleById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.hospitalizationOrderScheduleRecord.findFirst({
        where: { tenantId, id },
      }),
    );
    return row ? mapSchedule(row) : null;
  }
  public async persistedSchedules(
    tenantId: string,
    orderId: string,
  ): Promise<HospitalizationOrderScheduleRecord[]> {
    if (!this.prisma) return this.listSchedules(tenantId, orderId);
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.hospitalizationOrderScheduleRecord.findMany({
        where: { tenantId, orderId },
        orderBy: { scheduledFor: "asc" },
      }),
    );
    return rows.map(mapSchedule);
  }
  public async persistedSearchSchedules(
    tenantId: string,
    f: HospitalizationOrderScheduleSearchFilters,
  ): Promise<{ items: HospitalizationOrderScheduleRecord[]; total: number }> {
    if (!this.prisma) return this.searchSchedules(tenantId, f);
    const pending = { appliedAt: null, skippedAt: null };
    const where: Prisma.HospitalizationOrderScheduleRecordWhereInput = {
      tenantId,
      ...(f.orderId ? { orderId: f.orderId } : {}),
      ...(f.status === "pending" ? pending : {}),
      ...(f.status === "applied" ? { appliedAt: { not: null } } : {}),
      ...(f.status === "skipped" ? { skippedAt: { not: null } } : {}),
      ...(f.status === "overdue"
        ? {
            ...pending,
            ...(f.asOf ? { scheduledFor: { lt: new Date(f.asOf) } } : {}),
          }
        : {}),
    };
    return this.inTenant(tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.hospitalizationOrderScheduleRecord.findMany({
          where,
          orderBy: { scheduledFor: f.sort ?? "asc" },
          skip: f.offset,
          take: f.limit,
        }),
        tx.hospitalizationOrderScheduleRecord.count({ where }),
      ]);
      return { items: items.map(mapSchedule), total };
    });
  }
  public async persistedUpdateSchedule(
    tenantId: string,
    id: string,
    p: HospitalizationOrderSchedulePatch,
  ): Promise<HospitalizationOrderScheduleRecord | null> {
    if (!this.prisma) return this.updateSchedule(tenantId, id, p);
    const data: Prisma.HospitalizationOrderScheduleRecordUpdateManyMutationInput =
      {
        ...(p.appliedAt !== undefined
          ? { appliedAt: dateOrNull(p.appliedAt) }
          : {}),
        ...(p.appliedByUserId !== undefined
          ? { appliedByUserId: p.appliedByUserId }
          : {}),
        ...(p.skippedAt !== undefined
          ? { skippedAt: dateOrNull(p.skippedAt) }
          : {}),
        ...(p.skippedByUserId !== undefined
          ? { skippedByUserId: p.skippedByUserId }
          : {}),
        ...(p.skipReason !== undefined ? { skipReason: p.skipReason } : {}),
      };
    const x = await this.inTenant(tenantId, (tx) =>
      tx.hospitalizationOrderScheduleRecord.updateMany({
        where: { tenantId, id },
        data,
      }),
    );
    return x.count ? this.persistedScheduleById(tenantId, id) : null;
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

  // -------------------------------------------------------------------------
  // Test yardımcıları
  // -------------------------------------------------------------------------

  public clear(): void {
    this.counters.clear();
    this.orders.clear();
    this.schedules.clear();
  }
}

const dateOrNull = (v: string | null): Date | null => (v ? new Date(v) : null);
const orderData = (
  r: HospitalizationOrderRecord,
): Prisma.HospitalizationOrderRecordUncheckedCreateInput => ({
  ...r,
  orderType: r.orderType,
  priority: r.priority,
  status: r.status,
  startsAt: new Date(r.startsAt),
  endsAt: dateOrNull(r.endsAt),
  cancelledAt: dateOrNull(r.cancelledAt),
  createdAt: new Date(r.createdAt),
  updatedAt: new Date(r.updatedAt),
});
const scheduleData = (
  r: HospitalizationOrderScheduleRecord,
): Prisma.HospitalizationOrderScheduleRecordUncheckedCreateInput => ({
  ...r,
  scheduledFor: new Date(r.scheduledFor),
  appliedAt: dateOrNull(r.appliedAt),
  skippedAt: dateOrNull(r.skippedAt),
  createdAt: new Date(r.createdAt),
});
const mapOrder = (r: DbOrder): HospitalizationOrderRecord => ({
  ...r,
  orderType: r.orderType as HospitalizationOrderRecord["orderType"],
  priority: r.priority as HospitalizationOrderRecord["priority"],
  status: r.status as HospitalizationOrderRecord["status"],
  startsAt: r.startsAt.toISOString(),
  endsAt: r.endsAt?.toISOString() ?? null,
  cancelledAt: r.cancelledAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});
const mapSchedule = (r: DbSchedule): HospitalizationOrderScheduleRecord => ({
  ...r,
  scheduledFor: r.scheduledFor.toISOString(),
  appliedAt: r.appliedAt?.toISOString() ?? null,
  skippedAt: r.skippedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});
