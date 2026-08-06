/**
 * @file KVKK erasure request repository.
 * @module apps/api/modules/kvkk/erasure-requests.repository
 *
 * @description GOAL-126 (FAZ-12) KVKK erasure taleplerinin
 *   kalıcı erişim katmanı. `kvkk_erasure_requests` tablosu
 *   üzerinde CRUD işlemleri yapar. Tüm sorgular tenant-scoped;
 *   SUPERADMIN bypass `app.is_superadmin=true` GUC değeriyle
 *   sağlanır.
 *
 *   Tablo RLS korumalıdır (migration
 *   `20260805120000_init_kvkk_erasure_requests`). Insert +
 *   update operasyonları uygulama katmanında `KvkkService` üzerinden
 *   geçer; controller bu repository'yi doğrudan çağırmaz.
 *
 * @security Cross-tenant erasure izolasyonu burada UYGULANMAZ;
 *   service katmanı `requireTenantScope` ile bunu zorlar.
 *   PII (firstName, lastName, email, ...) bu tabloda DEĞİLDİR;
 *   yalnızca `ownerId` (UUID) saklanır.
 *
 * @since GOAL-126 (FAZ-12) KVKK controller + endpoint'ler
 */

import { Injectable } from "@nestjs/common";
import {
  Prisma,
  type KvkkErasureRequest as PrismaKvkkErasureRequest,
} from "@prisma/client";

import { PrismaService } from "../../prisma/prisma.service.js";

/** Persist edilmiş erasure talebi. ISO 8601 string'ler API sözleşmesine uygun. */
export interface ErasureRequestRecord {
  id: string;
  tenantId: string;
  ownerId: string;
  requestedBy: string | null;
  reason: string;
  status: "pending" | "in_progress" | "completed" | "rejected";
  requestedAt: string;
  completedAt: string | null;
  completedBy: string | null;
  redactedFields: string[];
  retainedMedicalRecords: number;
}

@Injectable()
export class ErasureRequestsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * Yeni erasure talebi oluşturur. `requestedAt` DB tarafından
   * atanır; id Prisma tarafından üretilir.
   * @param args
   */
  public async create(args: {
    tenantId: string;
    ownerId: string;
    requestedBy: string | null;
    reason: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<ErasureRequestRecord> {
    const row = await this.withTenant(args.tenantId, (tx) =>
      tx.kvkkErasureRequest.create({
        data: {
          tenantId: args.tenantId,
          ownerId: args.ownerId,
          requestedBy: args.requestedBy,
          reason: args.reason,
          status: "pending",
          redactedFields: [],
          retainedMedicalRecords: 0,
          metadata:
            (args.metadata as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
        },
      }),
    );
    return this.fromPrisma(row);
  }

  /**
   * ID ile getirir. Tenant bilgisi verilmezse (SUPERADMIN
   * sorgusu için) tüm tenant'larda arar; aksi halde RLS
   * tenant-scoped yapar.
   * @param id
   * @param tenantId opsiyonel; null → SUPERADMIN araması
   */
  public async findById(
    id: string,
    tenantId: string | null,
  ): Promise<ErasureRequestRecord | null> {
    const row = tenantId
      ? await this.withTenant(tenantId, (tx) =>
          tx.kvkkErasureRequest.findUnique({ where: { id } }),
        )
      : await this.withSuperadmin((tx) =>
          tx.kvkkErasureRequest.findUnique({ where: { id } }),
        );
    return row ? this.fromPrisma(row) : null;
  }

  /**
   * Tenant-scoped arama. `status` ve `ownerId` opsiyonel filtre.
   * @param args
   */
  public async findMany(args: {
    tenantId: string;
    status?: ErasureRequestRecord["status"];
    ownerId?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: ErasureRequestRecord[]; total: number }> {
    const where: Prisma.KvkkErasureRequestWhereInput = {
      tenantId: args.tenantId,
      ...(args.status ? { status: args.status } : {}),
      ...(args.ownerId ? { ownerId: args.ownerId } : {}),
    };
    const result = await this.withTenant(args.tenantId, (tx) =>
      Promise.all([
        tx.kvkkErasureRequest.findMany({
          where,
          orderBy: { requestedAt: "desc" },
          skip: args.offset,
          take: args.limit,
        }),
        tx.kvkkErasureRequest.count({ where }),
      ]),
    );
    return {
      items: result[0].map((row) => this.fromPrisma(row)),
      total: result[1],
    };
  }

  /**
   * Erasure uygulandıktan sonra talebi günceller (status +
   * completedAt + redactedFields + retainedMedicalRecords).
   * @param args
   */
  public async markApplied(args: {
    tenantId: string;
    id: string;
    completedBy: string | null;
    redactedFields: string[];
    retainedMedicalRecords: number;
    status: "completed" | "rejected";
  }): Promise<ErasureRequestRecord> {
    const row = await this.withTenant(args.tenantId, (tx) =>
      tx.kvkkErasureRequest.update({
        where: { id: args.id },
        data: {
          status: args.status,
          completedAt: new Date(),
          completedBy: args.completedBy,
          redactedFields: args.redactedFields,
          retainedMedicalRecords: args.retainedMedicalRecords,
        },
      }),
    );
    return this.fromPrisma(row);
  }

  /** Tenant bağlamında çalışan bir transaction açar. */
  private async withTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return fn(tx);
    });
  }

  /** SUPERADMIN bağlamında çalışan bir transaction açar. */
  private async withSuperadmin<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', '', true)`;
      return fn(tx);
    });
  }

  private fromPrisma(row: PrismaKvkkErasureRequest): ErasureRequestRecord {
    const redacted = Array.isArray(row.redactedFields)
      ? (row.redactedFields as unknown[]).map((v) => String(v))
      : [];
    return {
      id: row.id,
      tenantId: row.tenantId,
      ownerId: row.ownerId,
      requestedBy: row.requestedBy,
      reason: row.reason,
      status: row.status as ErasureRequestRecord["status"],
      requestedAt: row.requestedAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      completedBy: row.completedBy,
      redactedFields: redacted,
      retainedMedicalRecords: row.retainedMedicalRecords,
    };
  }
}
