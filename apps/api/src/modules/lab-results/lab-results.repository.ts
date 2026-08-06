/**
 * @file Lab result repository.
 * @module apps/api/modules/lab-results/lab-results.repository
 *
 * @description GOAL-092 (FAZ-9) laboratuvar sonucu veri erişim katmanı.
 * W1.2c kapsamında in-memory Map'ten Prisma DB'ye taşındı.
 *
 * @security Tenant RLS zorunlu. Append-only (DB trigger). Her sorgu
 *   `withContext` içinde transaction-yerel RLS bağlamıyla çalışır.
 * @since GOAL-092 (FAZ-9) laboratuvar sonuçları core
 * @w1.2c DB persistence (in-memory → Prisma)
 * @w1.4 RLS transaction-yerel context
 */

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  LabAbnormalFlag,
  LabResultRecord,
  LabResultStatus,
} from "../../common/lab-results/lab-result.types.js";
import type { LabResult, Prisma } from "@prisma/client";

/** Insert input. */
export interface LabResultInsertInput {
  tenantId: string;
  labOrderId: string;
  revision: number;
  value: string;
  valueNumeric: string | null;
  unit: string;
  referenceRange: string | null;
  abnormalFlag: LabAbnormalFlag;
  attachments: string[];
  notes: string | null;
  enteredBy: string;
  amendsResultId: string | null;
  amendmentReason: string | null;
}

/** Patch tipi. */
export interface LabResultPatch {
  value?: string | undefined;
  valueNumeric?: string | null | undefined;
  abnormalFlag?: LabAbnormalFlag | undefined;
  attachments?: string[] | undefined;
  notes?: string | null | undefined;
  status?: LabResultStatus | undefined;
  reviewedBy?: string | null | undefined;
  reviewedAt?: string | Date | null | undefined;
  reviewNotes?: string | null | undefined;
  amendmentReason?: string | null | undefined;
}

/** RLS actor. */
interface TenantActor {
  tenantId: string;
  isSuperadmin?: boolean;
}

@Injectable()
export class LabResultsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findById(
    tenantId: string,
    id: string,
  ): Promise<LabResultRecord | null> {
    return this.withContext({ tenantId }, async (tx) => {
      const row = await tx.labResult.findFirst({ where: { id, tenantId } });
      return row ? this.toRecord(row) : null;
    });
  }

  public async insert(input: LabResultInsertInput): Promise<LabResultRecord> {
    return this.withContext({ tenantId: input.tenantId }, async (tx) => {
      const row = await tx.labResult.create({
        data: {
          tenantId: input.tenantId,
          labOrderId: input.labOrderId,
          revision: input.revision,
          value: input.value,
          valueNumeric: input.valueNumeric,
          unit: input.unit,
          referenceRange: input.referenceRange,
          abnormalFlag: input.abnormalFlag,
          attachments: input.attachments,
          notes: input.notes,
          enteredBy: input.enteredBy,
          amendsResultId: input.amendsResultId,
          amendmentReason: input.amendmentReason,
        },
      });
      return this.toRecord(row);
    });
  }

  public async update(
    tenantId: string,
    id: string,
    patch: LabResultPatch,
  ): Promise<LabResultRecord | null> {
    return this.withContext({ tenantId }, async (tx) => {
      const toDate = (v: string | Date | null | undefined): Date | null => {
        if (v === null || v === undefined) return null;
        return v instanceof Date ? v : new Date(v);
      };
      try {
        const row = await tx.labResult.update({
          where: { id },
          data: {
            ...(patch.value !== undefined ? { value: patch.value } : {}),
            ...(patch.valueNumeric !== undefined
              ? { valueNumeric: patch.valueNumeric }
              : {}),
            ...(patch.abnormalFlag !== undefined
              ? { abnormalFlag: patch.abnormalFlag }
              : {}),
            ...(patch.attachments !== undefined
              ? { attachments: patch.attachments }
              : {}),
            ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            ...(patch.reviewedBy !== undefined
              ? { reviewedBy: patch.reviewedBy }
              : {}),
            ...(patch.reviewedAt !== undefined
              ? { reviewedAt: toDate(patch.reviewedAt) }
              : {}),
            ...(patch.reviewNotes !== undefined
              ? { reviewNotes: patch.reviewNotes }
              : {}),
            ...(patch.amendmentReason !== undefined
              ? { amendmentReason: patch.amendmentReason }
              : {}),
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

  public async listByOrder(
    tenantId: string,
    labOrderId: string,
  ): Promise<LabResultRecord[]> {
    return this.withContext({ tenantId }, async (tx) => {
      const rows = await tx.labResult.findMany({
        where: { tenantId, labOrderId },
        orderBy: { revision: "desc" },
      });
      return rows.map((r) => this.toRecord(r));
    });
  }

  public async findActiveByOrder(
    tenantId: string,
    labOrderId: string,
  ): Promise<LabResultRecord | null> {
    return this.withContext({ tenantId }, async (tx) => {
      const row = await tx.labResult.findFirst({
        where: {
          tenantId,
          labOrderId,
          status: { in: ["draft", "pending_review", "approved"] },
        },
        orderBy: { revision: "desc" },
      });
      return row ? this.toRecord(row) : null;
    });
  }

  public async nextRevision(
    tenantId: string,
    labOrderId: string,
  ): Promise<number> {
    return this.withContext({ tenantId }, async (tx) => {
      const last = await tx.labResult.findFirst({
        where: { tenantId, labOrderId },
        orderBy: { revision: "desc" },
      });
      return (last?.revision ?? 0) + 1;
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

  private toRecord(row: LabResult): LabResultRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      labOrderId: row.labOrderId,
      revision: row.revision,
      value: row.value,
      valueNumeric: row.valueNumeric,
      unit: row.unit,
      referenceRange: row.referenceRange,
      abnormalFlag: row.abnormalFlag as LabAbnormalFlag,
      status: row.status as LabResultStatus,
      attachments: row.attachments,
      notes: row.notes,
      enteredBy: row.enteredBy,
      enteredAt: row.enteredAt.toISOString(),
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewNotes: row.reviewNotes,
      amendsResultId: row.amendsResultId,
      amendmentReason: row.amendmentReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
