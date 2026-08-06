/**
 * @file Lab order repository.
 * @module apps/api/modules/lab-orders/lab-orders.repository
 *
 * @description GOAL-091 (FAZ-9) laboratuvar isteği veri erişim katmanı.
 * W1.2b kapsamında in-memory Map'ten Prisma DB'ye taşındı.
 *
 * Sözleşme (service tarafı):
 * - `findById(tenantId, id)`: tenant-scoped; cross-tenant → null.
 * - `insert(input)`: yeni kayıt.
 * - `update(tenantId, id, patch)`: state machine geçişleri.
 * - `search(tenantId, filters)`: status, patient, source, tarih aralığı.
 *
 * @security Tenant RLS zorunlu. Append-only: fiziksel silme YOKTUR
 *   (PostgreSQL trigger `lab_orders_no_delete`). Her sorgu
 *   `withContext` içinde transaction-yerel RLS bağlamıyla çalışır.
 *
 * @since GOAL-091 (FAZ-9) laboratuvar isteği ve numune core
 * @w1.2b DB persistence (in-memory → Prisma)
 * @w1.4 RLS transaction-yerel context
 */

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  LabOrderPriority,
  LabOrderRecord,
  LabOrderSampleQuality,
  LabOrderSourceType,
  LabOrderStatus,
} from "../../common/lab-orders/lab-order.types.js";
import type { LabOrder, Prisma } from "@prisma/client";

/** Insert input. */
export interface LabOrderInsertInput {
  tenantId: string;
  patientId: string;
  labTestId: string;
  labTestCode: string;
  labTestName: string;
  sampleType: string;
  unit: string;
  referenceRange: string | null;
  price: string;
  sourceType: LabOrderSourceType;
  sourceId: string | null;
  priority: LabOrderPriority;
  createdBy: string;
  notes: string | null;
}

/** Patch tipi — state machine geçişlerinde kullanılır. */
export interface LabOrderPatch {
  status?: LabOrderStatus | undefined;
  /** ISO string veya Date kabul edilir; DB'ye Date yazılır. */
  collectedAt?: string | Date | null | undefined;
  collectedByUserId?: string | null | undefined;
  sampleQuality?: LabOrderSampleQuality | null | undefined;
  processingStartedAt?: string | Date | null | undefined;
  completedAt?: string | Date | null | undefined;
  cancelledAt?: string | Date | null | undefined;
  cancelledBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  notes?: string | null | undefined;
}

/** Arama filtreleri. */
export interface LabOrderSearchFilters {
  status?: LabOrderStatus | undefined;
  patientId?: string | undefined;
  sourceType?: LabOrderSourceType | undefined;
  sourceId?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

/** RLS actor. */
interface TenantActor {
  tenantId: string;
  isSuperadmin?: boolean;
}

@Injectable()
export class LabOrdersRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(
    tenantId: string,
    id: string,
  ): Promise<LabOrderRecord | null> {
    return this.withContext({ tenantId }, async (tx) => {
      const row = await tx.labOrder.findFirst({ where: { id, tenantId } });
      return row ? this.toRecord(row) : null;
    });
  }

  public async insert(input: LabOrderInsertInput): Promise<LabOrderRecord> {
    return this.withContext({ tenantId: input.tenantId }, async (tx) => {
      const row = await tx.labOrder.create({
        data: {
          tenantId: input.tenantId,
          patientId: input.patientId,
          labTestId: input.labTestId,
          labTestCode: input.labTestCode,
          labTestName: input.labTestName,
          sampleType: input.sampleType,
          unit: input.unit,
          referenceRange: input.referenceRange,
          price: input.price,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          priority: input.priority,
          notes: input.notes,
          createdBy: input.createdBy,
        },
      });
      return this.toRecord(row);
    });
  }

  public async update(
    tenantId: string,
    id: string,
    patch: LabOrderPatch,
  ): Promise<LabOrderRecord | null> {
    return this.withContext({ tenantId }, async (tx) => {
      const toDate = (v: string | Date | null | undefined): Date | null => {
        if (v === null || v === undefined) return null;
        return v instanceof Date ? v : new Date(v);
      };
      try {
        const row = await tx.labOrder.update({
          where: { id },
          data: {
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            ...(patch.collectedAt !== undefined
              ? { collectedAt: toDate(patch.collectedAt) }
              : {}),
            ...(patch.collectedByUserId !== undefined
              ? { collectedByUserId: patch.collectedByUserId }
              : {}),
            ...(patch.sampleQuality !== undefined
              ? { sampleQuality: patch.sampleQuality }
              : {}),
            ...(patch.processingStartedAt !== undefined
              ? { processingStartedAt: toDate(patch.processingStartedAt) }
              : {}),
            ...(patch.completedAt !== undefined
              ? { completedAt: toDate(patch.completedAt) }
              : {}),
            ...(patch.cancelledAt !== undefined
              ? { cancelledAt: toDate(patch.cancelledAt) }
              : {}),
            ...(patch.cancelledBy !== undefined
              ? { cancelledBy: patch.cancelledBy }
              : {}),
            ...(patch.cancelReason !== undefined
              ? { cancelReason: patch.cancelReason }
              : {}),
            ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          },
        });
        if (row.tenantId !== tenantId) return null;
        return this.toRecord(row);
      } catch (e: unknown) {
        if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
          return null;
        }
        throw e;
      }
    });
  }

  public async search(
    tenantId: string,
    filters: LabOrderSearchFilters,
  ): Promise<{ items: LabOrderRecord[]; total: number }> {
    return this.withContext({ tenantId }, async (tx) => {
      const where: Prisma.LabOrderWhereInput = {
        tenantId,
        ...(filters.status && { status: filters.status }),
        ...(filters.patientId && { patientId: filters.patientId }),
        ...(filters.sourceType && { sourceType: filters.sourceType }),
        ...(filters.sourceId && { sourceId: filters.sourceId }),
        ...((filters.dateFrom || filters.dateTo) && {
          createdAt: {
            ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
            ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
          },
        }),
      };

      const sort = filters.sort ?? "desc";
      const [rows, total] = await Promise.all([
        tx.labOrder.findMany({
          where,
          orderBy: { createdAt: sort },
          take: filters.limit,
          skip: filters.offset,
        }),
        tx.labOrder.count({ where }),
      ]);

      return {
        items: rows.map((r) => this.toRecord(r)),
        total,
      };
    });
  }

  /**
   * Sorgu başında RLS context'i set eder. `set_config(name, value, is_local=true)`
   * transaction sonunda otomatik temizlenir; aynı bağlam içindeki sorgular RLS
   * policy'sini doğru uygular. Bu sayede hem WHERE cümlesi hem de RLS USING
   * clause aynı tenant bağlamıyla çalışır.
   *
   * @param actor tenantId/isSuperadmin çifti
   * @param fn transaction içinde çalışacak sorgu
   */
  private async withContext<T>(
    actor: TenantActor,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const isSuper = actor.isSuperadmin ? "true" : "false";
    const tenantId = actor.tenantId;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', ${isSuper}, true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  private toRecord(row: LabOrder): LabOrderRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      patientId: row.patientId,
      labTestId: row.labTestId,
      labTestCode: row.labTestCode,
      labTestName: row.labTestName,
      sampleType: row.sampleType,
      unit: row.unit,
      referenceRange: row.referenceRange,
      price: row.price,
      sourceType: row.sourceType as LabOrderSourceType,
      sourceId: row.sourceId,
      priority: row.priority as LabOrderPriority,
      status: row.status as LabOrderStatus,
      collectedAt: row.collectedAt?.toISOString() ?? null,
      collectedByUserId: row.collectedByUserId,
      sampleQuality: row.sampleQuality as LabOrderSampleQuality | null,
      processingStartedAt: row.processingStartedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelledBy: row.cancelledBy,
      cancelReason: row.cancelReason,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
