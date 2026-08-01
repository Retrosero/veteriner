/**
 * @file File repository.
 * @module apps/api/modules/file/file.repository
 *
 * @description `FileMeta` tablosu için veri erişim katmanı. Tüm
 * sorgular tenant-scoped (RLS + WHERE tenantId) olarak yapılır;
 * SUPERADMIN bypass service katmanında.
 *
 * @security
 *   - Cross-tenant erişim RLS tarafından engellenir. Repository
 *     ayrıca `tenantId` filtresi uygular (defense-in-depth).
 *   - Fiziksel DELETE yok; yalnızca arşiv (`archive` metodu).
 *   - `storageKey` unique; insert sırasında P2002 yakalanır.
 *
 * @since GOAL-014 (FAZ-1) dosya ve medya servisi
 */

import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type { Prisma, FileMeta as PrismaFileMeta } from "@prisma/client";
import type { FileVisibility } from "@vetniva/contracts";

export interface CreateFileMetaInput {
  id: string;
  tenantId: string;
  branchId: string | null;
  uploaderId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  visibility: FileVisibility;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  description: string | null;
}

export interface ListFileMetaArgs {
  tenantId: string;
  page: number;
  pageSize: number;
  mimeType?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  visibility?: FileVisibility;
  includeArchived: boolean;
}

export interface ListFileMetaResult {
  items: PrismaFileMeta[];
  total: number;
}

@Injectable()
export class FileRepository {
  private readonly logger = new Logger(FileRepository.name);

  public constructor(private readonly prisma: PrismaService) {}

  /**
   * ID + tenant ile dosya getirir. Tenant mismatch → null.
   */
  public async findById(
    id: string,
    tenantId: string,
  ): Promise<PrismaFileMeta | null> {
    return this.withTenant(tenantId, (tx) =>
      tx.fileMeta.findFirst({ where: { id, tenantId } }),
    );
  }

  /**
   * `storageKey` ile dosya bulur (idempotent upload senaryosu).
   * Tenant-scoped.
   */
  public async findByStorageKey(
    storageKey: string,
    tenantId: string,
  ): Promise<PrismaFileMeta | null> {
    return this.withTenant(tenantId, (tx) =>
      tx.fileMeta.findFirst({ where: { storageKey, tenantId } }),
    );
  }

  /**
   * Tenant + checksum ile duplicate kontrolü. Aynı tenant içinde
   * aynı içerikten ikinci kayıt varsa döner.
   */
  public async findByChecksum(
    tenantId: string,
    checksumSha256: string,
  ): Promise<PrismaFileMeta | null> {
    return this.withTenant(tenantId, (tx) =>
      tx.fileMeta.findFirst({ where: { tenantId, checksumSha256 } }),
    );
  }

  /**
   * Yeni dosya metadata insert. `storageKey` ve `(tenantId, checksum)`
   * unique constraint'leri DB tarafından sağlanır.
   */
  public async create(input: CreateFileMetaInput): Promise<PrismaFileMeta> {
    const data: Prisma.FileMetaUncheckedCreateInput = {
      id: input.id,
      tenantId: input.tenantId,
      branchId: input.branchId,
      uploaderId: input.uploaderId,
      storageKey: input.storageKey,
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
      checksumSha256: input.checksumSha256,
      scanStatus: "pending",
      visibility: input.visibility,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      description: input.description,
    };
    return this.withTenant(input.tenantId, (tx) =>
      tx.fileMeta.create({ data }),
    );
  }

  /**
   * Tarama sonucunu günceller.
   */
  public async updateScanResult(
    id: string,
    tenantId: string,
    result: {
      scanStatus: "pending" | "clean" | "infected" | "skipped" | "error";
      scanResult: string | null;
    },
  ): Promise<PrismaFileMeta> {
    return this.withTenant(tenantId, (tx) =>
      tx.fileMeta.update({
        where: { id },
        data: {
          scanStatus: result.scanStatus,
          scanResult: result.scanResult,
          scannedAt: new Date(),
        },
      }),
    );
  }

  /**
   * Arşivleme (soft delete). `archivedAt` + `archivedBy` +
   * `archiveReason` set edilir.
   */
  public async archive(
    id: string,
    tenantId: string,
    archivedBy: string,
    reason: string,
  ): Promise<PrismaFileMeta> {
    return this.withTenant(tenantId, (tx) =>
      tx.fileMeta.update({
        where: { id },
        data: {
          archivedAt: new Date(),
          archivedBy,
          archiveReason: reason,
        },
      }),
    );
  }

  /**
   * Sayfalı liste. Tenant-scoped, arşivlenmişler default dışlanır.
   */
  public async list(args: ListFileMetaArgs): Promise<ListFileMetaResult> {
    const where: Prisma.FileMetaWhereInput = { tenantId: args.tenantId };
    if (!args.includeArchived) {
      where.archivedAt = null;
    }
    if (args.mimeType) where.mimeType = args.mimeType;
    if (args.relatedEntityType)
      where.relatedEntityType = args.relatedEntityType;
    if (args.relatedEntityId) where.relatedEntityId = args.relatedEntityId;
    if (args.visibility) where.visibility = args.visibility;

    return this.withTenant(args.tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.fileMeta.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (args.page - 1) * args.pageSize,
          take: args.pageSize,
        }),
        tx.fileMeta.count({ where }),
      ]);
      return { items, total };
    });
  }

  /** Tenant RLS bağlamını sorguyla aynı transaction ve bağlantıda kurar. */
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

  /**
   * Storage key üretir: `tenants/<tenantId>/files/<fileId>`. Tenant
   * ID ve file ID hex/uuid formatında olmalı; aksi halde regex
   * hata verir.
   */
  public buildStorageKey(tenantId: string, fileId: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) {
      throw new Error("file_repository: tenantId uuid formatında değil");
    }
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) {
      throw new Error("file_repository: fileId uuid formatında değil");
    }
    return `tenants/${tenantId}/files/${fileId}`;
  }
}
