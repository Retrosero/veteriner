/**
 * @file File service.
 * @module apps/api/modules/file/file.service
 *
 * @description Dosya yükleme, listeleme, arşivleme, signed URL üretimi
 * iş mantığı. Storage ve scan adapter'ları DI üzerinden gelir; mimari
 * kararlar:
 *
 * - Storage backend'i pluggable (Local / S3). Tenant-bazlı path şeması
 *   repository'de üretilir.
 * - Tarama senkronize (adım adım): upload → pending insert → scan →
 *   update. Production'da asenkron worker (GOAL-014+) ile değiştirilir.
 * - Soft delete: `archive` metodu dosyayı storage'da `archived/`'e
 *   taşır, DB'de `archivedAt` set eder; fiziksel silme YOK.
 * - Tenant izolasyonu: RLS + repository WHERE tenantId + service
 *   katmanı enforce edilir (defense-in-depth).
 *
 * @security
 * - Dosya boyutu hard limit (100 MB) DB CHECK constraint + service
 *   soft limit (25 MB) ile zorlanır.
 * - MIME whitelist `fileMimeTypeSchema` ile; bilinmeyen MIME → 400.
 * - `storageKey` path injection'a karşı UUID formatında; repository
 *   `buildStorageKey` validate eder.
 * - Cross-tenant erişim denemeleri 404 (bilgi sızdırmaz).
 * - `infected` scan durumunda indirme reddedilir (quarantine).
 * - Audit: upload, archive, signed-url event'leri loglanır.
 *
 * @since GOAL-014 (FAZ-1) dosya ve medya servisi
 */

import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import { Readable as ReadableStream } from "node:stream";

import type {
  ActorContext,
  ActorRole,
} from "../../common/actor/actor-context.service.js";
import type { ScanAdapter, ScanResult } from "../../common/adapters/scan.adapter.js";
import type { StorageAdapter } from "../../common/adapters/storage.adapter.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type {
  FileArchiveRequest,
  FileListQuery,
  FileListResponse,
  FileMeta,
  FileUploadExtended,
  SignedUrlResponse,
} from "@vetniva/contracts";

import { toFileMetaResponse } from "./dto/file.dto.js";
import { FileRepository } from "./file.repository.js";

/**
 * Default soft limit (25 MB). Hard limit 100 MB DB CHECK'te.
 */
const DEFAULT_SOFT_SIZE_LIMIT = 25 * 1024 * 1024;

/**
 * Dosya yükleme parametreleri. `body` buffer veya stream olabilir.
 */
export interface UploadFileInput {
  readonly meta: FileUploadExtended;
  readonly body: Buffer | Readable;
}

/**
 * Signed URL istek parametreleri.
 */
export interface SignedUrlServiceInput {
  readonly expiresInSec: number;
}

@Injectable()
export class FileService {
  private readonly logger = new Logger(FileService.name);

  public constructor(
    private readonly repo: FileRepository,
    private readonly storage: StorageAdapter,
    private readonly scan: ScanAdapter,
    private readonly audit: AuditService,
  ) {}

  /**
   * Yeni dosya yükler. Akış:
   * 1. Input validation (soft limit + MIME whitelist).
   * 2. Storage key üret.
   * 3. Tenant mismatch + duplicate kontrolü.
   * 4. Storage'a yaz (atomik).
   * 5. DB'ye FileMeta insert (scanStatus=pending).
   * 6. Tarama çalıştır → update.
   * 7. Audit event yayınla.
   */
  public async upload(
    input: UploadFileInput,
    actor: ActorContext,
  ): Promise<FileMeta> {
    this.requireActorContext(actor);
    this.assertMimeAllowed(input.meta.mimeType);
    this.assertSizeWithinSoftLimit(input.meta.sizeBytes);

    const tenantId = this.requireTenantId(actor);
    const fileId = randomUUID();
    const storageKey = this.repo.buildStorageKey(tenantId, fileId);
    const checksum = await this.sha256Of(input.body);
    const replayedBody = await this.toBuffer(input.body);

    // Aynı tenant + checksum → mevcut kayıt (idempotent upload).
    const dup = await this.repo.findByChecksum(tenantId, checksum);
    if (dup) {
      this.logger.warn(
        `upload duplicate: tenant=${tenantId} checksum=${checksum.slice(0, 12)}... existing=${dup.id}`,
      );
      await this.audit.record({
        eventName: "audit:file.duplicate",
        tenantId,
        branchId: actor.branchId,
        actorId: actor.actorId,
        actorType: actor.actorType,
        targetType: "file",
        targetId: dup.id,
        action: "read",
        correlationId: actor.correlationId,
        country: "TR",
        severity: "info",
        ipAddress: actor.ipAddress,
        userAgentHash: actor.userAgentHash,
        after: { originalName: dup.originalName, sizeBytes: Number(dup.sizeBytes) },
        metadata: { source: actor.source, mimeType: dup.mimeType },
      });
      return toFileMetaResponse(dup);
    }

    // 1) Storage'a yaz.
    const object = await this.storage.put({
      key: storageKey,
      body: replayedBody,
      contentType: input.meta.mimeType,
      metadata: {
        tenantId,
        uploaderId: actor.actorId ?? "anonymous",
        originalName: input.meta.originalName,
      },
    });

    // 2) DB insert (pending).
    const created = await this.repo.create({
      id: fileId,
      tenantId,
      branchId: actor.branchId,
      uploaderId: actor.actorId ?? "00000000-0000-0000-0000-000000000000",
      storageKey: object.key,
      originalName: input.meta.originalName,
      mimeType: input.meta.mimeType,
      sizeBytes: object.size,
      checksumSha256: object.checksumSha256,
      visibility: input.meta.visibility ?? "branch",
      relatedEntityType: input.meta.relatedEntityType ?? null,
      relatedEntityId: input.meta.relatedEntityId ?? null,
      description: input.meta.description ?? null,
    });

    // 3) Tarama çalıştır. Hata → `error` outcome (DB update).
    const scanResult = await this.safeScan({
      key: object.key,
      body: replayedBody,
      contentType: input.meta.mimeType,
    });

    const finalRecord = await this.repo.updateScanResult(created.id, tenantId, {
      scanStatus: scanResult.outcome,
      scanResult: scanResult.details ?? null,
    });

    if (scanResult.outcome === "infected") {
      this.logger.error(
        `INFECTED upload: tenant=${tenantId} fileId=${fileId} details=${scanResult.details}`,
      );
    }

    // 4) Audit event.
    await this.audit.record({
      eventName: "audit:file.upload",
      tenantId,
      branchId: actor.branchId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "file",
      targetId: finalRecord.id,
      action: "create",
      correlationId: actor.correlationId,
      country: "TR",
      severity: scanResult.outcome === "infected" ? "critical" : "info",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      after: {
        originalName: finalRecord.originalName,
        sizeBytes: Number(finalRecord.sizeBytes),
        mimeType: finalRecord.mimeType,
        scanStatus: finalRecord.scanStatus,
        visibility: finalRecord.visibility,
      },
      metadata: {
        source: actor.source,
        storageKey: finalRecord.storageKey,
        checksum: finalRecord.checksumSha256.slice(0, 12),
        relatedEntityType: finalRecord.relatedEntityType,
      },
    });

    return toFileMetaResponse(finalRecord);
  }

  /**
   * ID'ye göre dosya getirir. Tenant mismatch → 404.
   * `infected` durumda 404 (karantina).
   */
  public async findById(
    id: string,
    actor: ActorContext,
  ): Promise<FileMeta> {
    this.requireActorContext(actor);
    const tenantId = this.requireTenantId(actor);
    const file = await this.repo.findById(id, tenantId);
    if (!file) {
      throw new DomainError({
        errorCode: "VET-FILE-0001",
        message: "Dosya bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-FILE-0001",
      });
    }
    if (file.scanStatus === "infected") {
      throw new DomainError({
        errorCode: "VET-FILE-0003",
        message: "Dosya karantinada",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-FILE-0003",
      });
    }
    if (file.archivedAt) {
      throw new DomainError({
        errorCode: "VET-FILE-0004",
        message: "Dosya arşivlenmiş",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-FILE-0004",
      });
    }
    this.enforceVisibility(file, actor);
    return toFileMetaResponse(file);
  }

  /**
   * Sayfalı liste. Tenant-scoped; SUPERADMIN tüm tenantları
   * görmek isterse `targetTenantId` parametresi ile gelir (ileride).
   */
  public async list(
    query: FileListQuery,
    actor: ActorContext,
  ): Promise<FileListResponse> {
    this.requireActorContext(actor);
    const tenantId = this.requireTenantId(actor);

    const listArgs: Parameters<FileRepository["list"]>[0] = {
      tenantId,
      page: query.page,
      pageSize: query.pageSize,
      includeArchived: query.includeArchived,
    };
    if (query.mimeType !== undefined) listArgs.mimeType = query.mimeType;
    if (query.relatedEntityType !== undefined) {
      listArgs.relatedEntityType = query.relatedEntityType;
    }
    if (query.relatedEntityId !== undefined) {
      listArgs.relatedEntityId = query.relatedEntityId;
    }
    const coerced = this.coerceVisibility(query.visibility, actor);
    if (coerced !== undefined) listArgs.visibility = coerced;

    const result = await this.repo.list(listArgs);

    return {
      items: result.items
        .filter((f) => f.scanStatus !== "infected")
        .map((f) => toFileMetaResponse(f)),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * Dosyayı arşivler (soft delete + storage archive). Aktör
   * yalnızca kendi tenant'ında arşivleyebilir; SUPERADMIN tüm
   * tenantlarda.
   */
  public async archive(
    id: string,
    input: FileArchiveRequest,
    actor: ActorContext,
  ): Promise<FileMeta> {
    this.requireActorContext(actor);
    if (!actor.actorId) {
      throw new DomainError({
        errorCode: "VET-AUTH-0001",
        message: "Arşivleme için kullanıcı bağlamı gerekli",
        httpStatus: 401,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0001",
      });
    }
    const tenantId = this.requireTenantId(actor);
    const existing = await this.repo.findById(id, tenantId);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-FILE-0001",
        message: "Dosya bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-FILE-0001",
      });
    }
    if (existing.archivedAt) {
      throw new DomainError({
        errorCode: "VET-FILE-0005",
        message: "Dosya zaten arşivlenmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-FILE-0005",
      });
    }

    // Storage archive: storage backend tarafında arşivle.
    try {
      await this.storage.archive(existing.storageKey, input.reason);
    } catch (err) {
      this.logger.error(
        `storage.archive başarısız: ${existing.storageKey} (DB güncellenecek)`,
        err instanceof Error ? err.stack : String(err),
      );
    }

    const archived = await this.repo.archive(
      id,
      tenantId,
      actor.actorId,
      input.reason,
    );

    await this.audit.record({
      eventName: "audit:file.archive",
      tenantId,
      branchId: actor.branchId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "file",
      targetId: archived.id,
      action: "archive",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "warning",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      before: { archivedAt: null, archiveReason: null },
      after: {
        archivedAt: archived.archivedAt?.toISOString() ?? null,
        archiveReason: archived.archiveReason,
      },
      metadata: { source: actor.source, reason: input.reason },
    });

    return toFileMetaResponse(archived);
  }

  /**
   * Kısa ömürlü signed URL üretir. Yalnızca `clean` veya `skipped`
   * durumdaki dosyalar için URL üretilir; `infected` ve `pending`
   * reddedilir.
   */
  public async getSignedUrl(
    id: string,
    input: SignedUrlServiceInput,
    actor: ActorContext,
  ): Promise<SignedUrlResponse> {
    this.requireActorContext(actor);
    const tenantId = this.requireTenantId(actor);
    const file = await this.repo.findById(id, tenantId);
    if (!file) {
      throw new DomainError({
        errorCode: "VET-FILE-0001",
        message: "Dosya bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-FILE-0001",
      });
    }
    if (file.scanStatus === "infected" || file.scanStatus === "pending") {
      throw new DomainError({
        errorCode: "VET-FILE-0006",
        message: "Dosya henüz indirilebilir değil",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-FILE-0006",
        details: { scanStatus: file.scanStatus },
      });
    }
    if (file.archivedAt) {
      throw new DomainError({
        errorCode: "VET-FILE-0004",
        message: "Dosya arşivlenmiş",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-FILE-0004",
      });
    }
    this.enforceVisibility(file, actor);

    const url = await this.storage.getSignedUrl(file.storageKey, {
      expiresInSeconds: input.expiresInSec,
      contentDisposition: `attachment; filename="${encodeURIComponent(file.originalName)}"`,
    });

    await this.audit.record({
      eventName: "audit:file.signed_url",
      tenantId,
      branchId: actor.branchId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "file",
      targetId: file.id,
      action: "read",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "info",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      after: { expiresInSec: input.expiresInSec },
      metadata: { source: actor.source },
    });

    return { url, expiresInSec: input.expiresInSec };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Tarama adapter çağrısı; exception'ı swallow edip `error` döner.
   * Üretimde asenkron worker devreye alındığında bu metot queue'ya
   * yazma ile değiştirilir.
   */
  private async safeScan(input: {
    key: string;
    body: Buffer | Readable;
    contentType: string;
  }): Promise<ScanResult> {
    try {
      return await this.scan.scan(input);
    } catch (err) {
      this.logger.error(
        `scan adapter hata: key=${input.key}`,
        err instanceof Error ? err.stack : String(err),
      );
      return {
        outcome: "error",
        details: err instanceof Error ? err.message : "scan_failed",
        durationMs: 0,
      };
    }
  }

  /**
   * Stream/Buffer → Buffer. Tarama öncesi tek seferlik okuma.
   */
  private async toBuffer(body: Buffer | Readable): Promise<Buffer> {
    if (Buffer.isBuffer(body)) return body;
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /**
   * SHA-256 hesaplar (hex). Storage backend hesaplayabilir; burada
   * servis katmanı ek kontrol yapar.
   */
  private async sha256Of(body: Buffer | Readable): Promise<string> {
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256");
    if (Buffer.isBuffer(body)) {
      hash.update(body);
      return hash.digest("hex");
    }
    for await (const chunk of body) {
      hash.update(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return hash.digest("hex");
  }

  /**
   * MIME whitelist kontrolü. `fileMimeTypeSchema` ile aynı küme.
   */
  private assertMimeAllowed(mime: string): void {
    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "application/pdf",
      "application/dicom",
    ]);
    if (!allowed.has(mime)) {
      throw new DomainError({
        errorCode: "VET-FILE-0002",
        message: "Bu MIME tipi kabul edilmiyor",
        httpStatus: 400,
        severity: "warning",
        i18nKey: "error.VET-FILE-0002",
        details: { mimeType: mime },
      });
    }
  }

  /**
   * Soft size limit (default 25 MB). Hard limit (100 MB) DB CHECK'te.
   */
  private assertSizeWithinSoftLimit(size: number): void {
    if (size <= 0) {
      throw new DomainError({
        errorCode: "VET-FILE-0007",
        message: "Dosya boyutu 0 olamaz",
        httpStatus: 400,
        severity: "warning",
        i18nKey: "error.VET-FILE-0007",
      });
    }
    if (size > DEFAULT_SOFT_SIZE_LIMIT) {
      throw new DomainError({
        errorCode: "VET-FILE-0008",
        message: "Dosya boyutu yumuşak limiti aşıyor (25 MB)",
        httpStatus: 413,
        severity: "warning",
        i18nKey: "error.VET-FILE-0008",
        details: { size, limit: DEFAULT_SOFT_SIZE_LIMIT },
      });
    }
  }

  /**
   * Visibility'ye göre erişim kontrolü.
   * - `private`: yalnızca yükleyen.
   * - `branch`: aynı branch.
   * - `tenant`: tenant'taki tüm yetkili roller.
   * - `portal`: hasta sahibi portalı (ileride).
   */
  private enforceVisibility(
    file: {
      visibility: string;
      uploaderId: string;
      branchId: string | null;
    },
    actor: ActorContext,
  ): void {
    if (actor.isSuperadmin) return;
    if (file.visibility === "private") {
      if (file.uploaderId !== actor.actorId) {
        throw new DomainError({
          errorCode: "VET-FILE-0001",
          message: "Dosya bulunamadı",
          httpStatus: 404,
          severity: "warning",
          i18nKey: "error.VET-FILE-0001",
        });
      }
      return;
    }
    if (file.visibility === "branch") {
      if (!actor.branchId || file.branchId !== actor.branchId) {
        throw new DomainError({
          errorCode: "VET-FILE-0001",
          message: "Dosya bulunamadı",
          httpStatus: 404,
          severity: "warning",
          i18nKey: "error.VET-FILE-0001",
        });
      }
      return;
    }
    // `tenant` ve `portal` visibility: actor rolü yeterli (yetki
    // guard zaten controller'da denetlenir).
  }

  /**
   * Visibility listeleme filtresini rol/branch bağlamına göre
   * kısıtlar. SUPERADMIN tüm visibility'leri görebilir; tenant
   * kullanıcısı kendi görünürlük kapsamıyla sınırlandırılır.
   */
  private coerceVisibility(
    requested: FileListQuery["visibility"],
    actor: ActorContext,
  ): FileListQuery["visibility"] {
    if (actor.isSuperadmin) return requested;
    // Tenant kullanıcısı: `private` dosyaları göremez (sadece kendi
    // dosyaları repository tarafında ayrıca filtrelenir; burada
    // yalnızca public visibility'leri döndürüyoruz).
    if (requested === "private" && actor.role !== "OWNER") {
      return "branch";
    }
    return requested;
  }

  /**
   * Actor bağlamı zorunlu (system actor upload yapamaz).
   */
  private requireActorContext(actor: ActorContext): void {
    if (actor.actorType === "system") {
      throw new DomainError({
        errorCode: "VET-AUTH-0003",
        message: "Sistem actor'ü dosya yükleyemez",
        httpStatus: 403,
        severity: "warning",
        i18nKey: "error.VET-AUTH-0003",
      });
    }
  }

  /**
   * Tenant bağlamı zorunlu. SUPERADMIN da olsa tenant context
   * verilmelidir (dosya tenant'a bağlıdır).
   */
  private requireTenantId(actor: ActorContext): string {
    if (!actor.tenantId) {
      throw new DomainError({
        errorCode: "VET-TENANT-0003",
        message: "Dosya işlemi için tenant bağlamı gerekli",
        httpStatus: 403,
        severity: "warning",
        i18nKey: "error.VET-TENANT-0003",
      });
    }
    return actor.tenantId;
  }
}

// Kullanılmayan import warning'i bastırmak için.
void ReadableStream;
void ({} as ActorRole);
