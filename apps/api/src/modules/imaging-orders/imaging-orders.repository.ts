/**
 * @file Imaging order repository.
 * @module apps/api/modules/imaging-orders/imaging-orders.repository
 *
 * @description GOAL-093 (FAZ-9) görüntüleme isteği veri erişim katmanı.
 * W1.2d kapsamında in-memory Map'ten Prisma DB'ye taşındı.
 *
 * @security Tenant RLS zorunlu. Append-only (DB trigger). Her sorgu
 *   `withContext` içinde transaction-yerel RLS bağlamıyla çalışır.
 * @since GOAL-093 (FAZ-9) görüntüleme isteği ve raporu core
 * @w1.2d DB persistence (in-memory → Prisma)
 * @w1.4 RLS transaction-yerel context
 */

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  ImagingContrastUse,
  ImagingModality,
  ImagingOrderPriority,
  ImagingOrderRecord,
  ImagingOrderSourceType,
  ImagingOrderStatus,
  ImagingReportRecord,
} from "../../common/imaging-orders/imaging-order.types.js";
import type { ImagingOrder, Prisma } from "@prisma/client";

/** Insert input. */
export interface ImagingOrderInsertInput {
  tenantId: string;
  patientId: string;
  imagingTestId: string;
  imagingTestCode: string;
  imagingTestName: string;
  modality: ImagingModality;
  bodyPart: string | null;
  price: string;
  sourceType: ImagingOrderSourceType;
  sourceId: string | null;
  priority: ImagingOrderPriority;
  createdBy: string;
  notes: string | null;
}

/** Patch tipi. */
export interface ImagingOrderPatch {
  status?: ImagingOrderStatus | undefined;
  scheduledAt?: string | Date | null | undefined;
  scheduledLocation?: string | null | undefined;
  performedAt?: string | Date | null | undefined;
  performedByUserId?: string | null | undefined;
  contrastUse?: ImagingContrastUse | null | undefined;
  clinicalInfo?: string | null | undefined;
  attachments?: string[] | undefined;
  reportRevisions?: ImagingReportRecord[] | undefined;
  cancelledAt?: string | Date | null | undefined;
  cancelledBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  notes?: string | null | undefined;
}

/** Arama filtreleri. */
export interface ImagingOrderSearchFilters {
  status?: ImagingOrderStatus | undefined;
  modality?: ImagingModality | undefined;
  patientId?: string | undefined;
  sourceType?: ImagingOrderSourceType | undefined;
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
export class ImagingOrdersRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(
    tenantId: string,
    id: string,
  ): Promise<ImagingOrderRecord | null> {
    return this.withContext({ tenantId }, async (tx) => {
      const row = await tx.imagingOrder.findFirst({
        where: { id, tenantId },
      });
      return row ? this.toRecord(row) : null;
    });
  }

  public async insert(
    input: ImagingOrderInsertInput,
  ): Promise<ImagingOrderRecord> {
    return this.withContext({ tenantId: input.tenantId }, async (tx) => {
      const row = await tx.imagingOrder.create({
        data: {
          tenantId: input.tenantId,
          patientId: input.patientId,
          imagingTestId: input.imagingTestId,
          imagingTestCode: input.imagingTestCode,
          imagingTestName: input.imagingTestName,
          modality: input.modality,
          bodyPart: input.bodyPart,
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
    patch: ImagingOrderPatch,
  ): Promise<ImagingOrderRecord | null> {
    return this.withContext({ tenantId }, async (tx) => {
      const toDate = (
        v: string | Date | null | undefined,
      ): Date | null => {
        if (v === null || v === undefined) return null;
        return v instanceof Date ? v : new Date(v);
      };
      try {
        const row = await tx.imagingOrder.update({
          where: { id },
          data: {
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            ...(patch.scheduledAt !== undefined
              ? { scheduledAt: toDate(patch.scheduledAt) }
              : {}),
            ...(patch.scheduledLocation !== undefined
              ? { scheduledLocation: patch.scheduledLocation }
              : {}),
            ...(patch.performedAt !== undefined
              ? { performedAt: toDate(patch.performedAt) }
              : {}),
            ...(patch.performedByUserId !== undefined
              ? { performedByUserId: patch.performedByUserId }
              : {}),
            ...(patch.contrastUse !== undefined
              ? { contrastUse: patch.contrastUse }
              : {}),
            ...(patch.clinicalInfo !== undefined
              ? { clinicalInfo: patch.clinicalInfo }
              : {}),
            ...(patch.attachments !== undefined
              ? { attachments: patch.attachments }
              : {}),
            ...(patch.reportRevisions !== undefined
              ? {
                  reportRevisions:
                    patch.reportRevisions as unknown as Prisma.InputJsonValue,
                }
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
    filters: ImagingOrderSearchFilters,
  ): Promise<{ items: ImagingOrderRecord[]; total: number }> {
    return this.withContext({ tenantId }, async (tx) => {
      const where: Prisma.ImagingOrderWhereInput = {
        tenantId,
        ...(filters.status && { status: filters.status }),
        ...(filters.modality && { modality: filters.modality }),
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
        tx.imagingOrder.findMany({
          where,
          orderBy: { createdAt: sort },
          take: filters.limit,
          skip: filters.offset,
        }),
        tx.imagingOrder.count({ where }),
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

  private toRecord(row: ImagingOrder): ImagingOrderRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      patientId: row.patientId,
      imagingTestId: row.imagingTestId,
      imagingTestCode: row.imagingTestCode,
      imagingTestName: row.imagingTestName,
      modality: row.modality as ImagingModality,
      bodyPart: row.bodyPart,
      price: row.price,
      sourceType: row.sourceType as ImagingOrderSourceType,
      sourceId: row.sourceId,
      priority: row.priority as ImagingOrderPriority,
      status: row.status as ImagingOrderStatus,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      scheduledLocation: row.scheduledLocation,
      performedAt: row.performedAt?.toISOString() ?? null,
      performedByUserId: row.performedByUserId,
      contrastUse: row.contrastUse as ImagingContrastUse | null,
      clinicalInfo: row.clinicalInfo,
      attachments: row.attachments,
      reportRevisions:
        (row.reportRevisions as unknown as ImagingReportRecord[]) ?? [],
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
