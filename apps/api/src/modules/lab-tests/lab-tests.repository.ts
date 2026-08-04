/**
 * @file Lab test kataloğu repository.
 * @module apps/api/modules/lab-tests/lab-tests.repository
 *
 * @description GOAL-090 (FAZ-9) laboratuvar test kataloğu veri erişim
 * katmanı. W1.2a kapsamında in-memory Map'ten Prisma DB'ye taşındı.
 *
 * Sözleşme (service tarafı değişmedi):
 * - `findByCode(tenantId, code)`: case-insensitive unique araması. Tenant RLS
 *   ile birlikte çalışır; dışarıdan gelen tenantId sözleşmeyle tutarlı.
 * - `findById(tenantId, id)`: tenant-scoped; cross-tenant → null.
 * - `insert(input)`: yeni kayıt. P2002 unique violation service katmanında
 *   VET-LABTEST-0002'ye map edilir.
 * - `update(tenantId, id, patch)`: kısmi güncelleme. Bulunamazsa null.
 * - `search(tenantId, filters)`: sayfalama + sıralama. Toplam + dilim döner.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır. `code`
 *   tenant-scoped unique (DB tarafında `LOWER(code)` fonksiyonel indeks).
 *   Fiziksel silme YOKTUR (PostgreSQL trigger `lab_tests_no_delete`).
 *   Her sorgu `withContext` içinde transaction-yerel RLS bağlamıyla çalışır;
 *   defense-in-depth olarak `tenantId` WHERE cümlesinde de uygulanır.
 *
 * @since GOAL-090 (FAZ-9) laboratuvar test kataloğu core
 * @w1.2a DB persistence (in-memory → Prisma)
 * @w1.4 RLS transaction-yerel context (W1.4 withContext)
 */

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type { LabTestRecord } from "../../common/lab-tests/lab-test.types.js";
import type { LabTest, Prisma } from "@prisma/client";
import type { LabSampleType } from "@vetniva/contracts";

/** Insert input. */
export interface LabTestInsertInput {
  tenantId: string;
  code: string;
  name: string;
  sampleType: LabSampleType;
  unit: string;
  referenceRange: string | null;
  conditionalRanges: string | null;
  price: string;
  active: boolean;
  notes: string | null;
  createdBy: string;
}

/** Patch tipi. */
export interface LabTestPatch {
  name?: string | undefined;
  unit?: string | undefined;
  referenceRange?: string | null | undefined;
  conditionalRanges?: string | null | undefined;
  price?: string | undefined;
  active?: boolean | undefined;
  notes?: string | null | undefined;
}

/** Arama filtreleri. */
export interface LabTestSearchFilters {
  sampleType?: LabSampleType | undefined;
  active?: boolean | undefined;
  search?: string | undefined;
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
export class LabTestsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public async findByCode(
    tenantId: string,
    code: string,
  ): Promise<LabTestRecord | null> {
    return this.withContext({ tenantId }, async (tx) => {
      const row = await tx.labTest.findFirst({
        where: { tenantId, code: { equals: code, mode: "insensitive" } },
      });
      return row ? this.toRecord(row) : null;
    });
  }

  public async findById(
    tenantId: string,
    id: string,
  ): Promise<LabTestRecord | null> {
    return this.withContext({ tenantId }, async (tx) => {
      const row = await tx.labTest.findFirst({ where: { id, tenantId } });
      return row ? this.toRecord(row) : null;
    });
  }

  public async insert(input: LabTestInsertInput): Promise<LabTestRecord> {
    return this.withContext({ tenantId: input.tenantId }, async (tx) => {
      const row = await tx.labTest.create({
        data: {
          tenantId: input.tenantId,
          code: input.code,
          name: input.name,
          sampleType: input.sampleType,
          unit: input.unit,
          referenceRange: input.referenceRange,
          conditionalRanges: input.conditionalRanges,
          price: input.price,
          active: input.active,
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
    patch: LabTestPatch,
  ): Promise<LabTestRecord | null> {
    return this.withContext({ tenantId }, async (tx) => {
      try {
        const row = await tx.labTest.update({
          where: { id },
          data: {
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
            ...(patch.referenceRange !== undefined
              ? { referenceRange: patch.referenceRange }
              : {}),
            ...(patch.conditionalRanges !== undefined
              ? { conditionalRanges: patch.conditionalRanges }
              : {}),
            ...(patch.price !== undefined ? { price: patch.price } : {}),
            ...(patch.active !== undefined ? { active: patch.active } : {}),
            ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          },
        });
        // RLS tenant kontrolü (defense-in-depth): update tenant dışı satıra
        // yazmamalı; burada filtre uygulamak yerine `tenantId` sorguyla
        // birlikte kontrol edilir. RLS context zaten başka tenant'ın
        // satırını göstermez, bu yüzden normal akışta `row.tenantId`
        // daima actor.tenantId'ye eşittir.
        if (row.tenantId !== tenantId) return null;
        return this.toRecord(row);
      } catch (e: unknown) {
        // Prisma P2025 = record not found
        if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
          return null;
        }
        throw e;
      }
    });
  }

  public async search(
    tenantId: string,
    filters: LabTestSearchFilters,
  ): Promise<{ items: LabTestRecord[]; total: number }> {
    return this.withContext({ tenantId }, async (tx) => {
      const where: {
        tenantId: string;
        sampleType?: LabSampleType;
        active?: boolean;
        OR?: Array<
          | { code: { contains: string; mode: "insensitive" } }
          | { name: { contains: string; mode: "insensitive" } }
        >;
      } = { tenantId };
      if (filters.sampleType) where.sampleType = filters.sampleType;
      if (filters.active !== undefined) where.active = filters.active;
      if (filters.search && filters.search.trim().length > 0) {
        const term = filters.search.trim();
        where.OR = [
          { code: { contains: term, mode: "insensitive" } },
          { name: { contains: term, mode: "insensitive" } },
        ];
      }

      const sort = filters.sort ?? "asc";

      // Transaction client üzerinde `$transaction` array formu yok; bu yüzden
      // `Promise.all` ile aynı RLS context içinde paralel çalıştırıyoruz.
      const [rows, total] = await Promise.all([
        tx.labTest.findMany({
          where,
          orderBy: { code: sort },
          take: filters.limit,
          skip: filters.offset,
        }),
        tx.labTest.count({ where }),
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

  private toRecord(row: LabTest): LabTestRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      code: row.code,
      name: row.name,
      sampleType: row.sampleType as LabSampleType,
      unit: row.unit,
      referenceRange: row.referenceRange,
      conditionalRanges: row.conditionalRanges,
      price: row.price,
      active: row.active,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
