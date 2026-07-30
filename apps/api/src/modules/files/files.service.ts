/**
 * @file Files service (dosya ve medya yönetimi).
 * @module apps/api/modules/files/files.service
 *
 * @description Dosya yükleme, indirme, arşivleme ve signed URL
 * üretimi. Storage ve antivirus driver'ları DI üzerinden inject
 * edilir. Tenant izolasyonu service katmanında uygulanır; cross-tenant
 * denemesi 404 ile reddedilir (bilgi sızdırmaz).
 *
 * İş kuralları:
 * - MIME whitelist: yalnızca `image/jpeg`, `image/png`,
 *   `application/pdf`, `application/dicom`. Diğer → VET-FILE-0002 (415).
 * - Boyut: 50 MB üstü → VET-FILE-0001 (415).
 * - Antivirus: `infected` → VET-FILE-0004 (422).
 * - Archive: `archivedAt` set edilir; storage'da dosya SİLİNMEZ
 *   (yasal/finansal koruma gereği).
 * - Audit: upload/download/archive olayları audit log'a yazılır.
 *
 * @security Tenant izolasyonu. Signed URL HMAC imzalı; süre
 *   dolmuş URL'ler proxy controller tarafından reddedilecek
 *   (FAZ-3+). Şu an yalnızca URL üretimi yapılıyor; proxy endpoint
 *   sonraki görev.
 *
 * @since GOAL-014 (FAZ-2) dosya ve medya servisi
 */

import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  ANTIVIRUS_DRIVER,
  type AntivirusDriver,
} from "../../common/files/antivirus.interface.js";
import {
  FILE_LIMITS,
  type FileMeta,
  type FileMimeType,
  type FileUpload,
} from "../../common/files/file.types.js";
import {
  STORAGE_DRIVER,
  type StorageDriver,
} from "../../common/files/storage.interface.js";

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  /** FAZ-0 in-memory meta store. DB modeli gelince repository'e taşınacak. */
  private readonly store = new Map<string, FileMeta>();

  public constructor(
    private readonly audit: AuditService,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
    @Inject(ANTIVIRUS_DRIVER) private readonly antivirus: AntivirusDriver,
  ) {}

  /**
   * Dosya yükler. MIME whitelist + boyut + antivirus kontrollerinden
   * geçerse storage'a yazar ve meta'yı döner.
   */
  public async upload(
    tenantId: string,
    upload: FileUpload,
    actor: ActorContext,
  ): Promise<FileMeta> {
    this.assertTenantContext(actor, tenantId);

    // 1) MIME whitelist
    if (!FILE_LIMITS.ALLOWED_MIME_TYPES.includes(upload.mimeType)) {
      throw new DomainError({
        errorCode: "VET-FILE-0002",
        message: "Bu MIME tipi kabul edilmiyor",
        httpStatus: 415,
        severity: "warning",
        i18nKey: "error.VET-FILE-0002",
        details: { mimeType: upload.mimeType },
      });
    }

    // 2) Boyut limiti
    if (upload.sizeBytes > FILE_LIMITS.MAX_SIZE_BYTES) {
      throw new DomainError({
        errorCode: "VET-FILE-0001",
        message: "Dosya boyutu limiti aşıldı",
        httpStatus: 415,
        severity: "warning",
        i18nKey: "error.VET-FILE-0001",
        details: {
          sizeBytes: upload.sizeBytes,
          maxBytes: FILE_LIMITS.MAX_SIZE_BYTES,
        },
      });
    }

    // 3) Antivirus taraması
    const scanResult = await this.antivirus.scan(upload.buffer, upload.mimeType);
    if (scanResult === "infected") {
      throw new DomainError({
        errorCode: "VET-FILE-0004",
        message: "Dosyada zararlı içerik tespit edildi",
        httpStatus: 422,
        severity: "error",
        i18nKey: "error.VET-FILE-0004",
      });
    }
    // scanResult === "error" → fail-open (FAZ-0); FAZ-3+'da fail-closed.

    // 4) Path üretimi: tenants/{tenantId}/{category}/{yyyy}/{mm}/{fileId}.{ext}
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const ext = FILE_LIMITS.EXTENSION_BY_MIME[upload.mimeType];
    const fileId = randomUUID();
    const relativePath = `tenants/${tenantId}/${upload.category}/${yyyy}/${mm}/${fileId}.${ext}`;

    // 5) Storage'a yaz
    await this.storage.put(relativePath, upload.buffer, upload.mimeType);

    // 6) Meta persist (in-memory FAZ-0)
    const meta: FileMeta = {
      id: fileId,
      tenantId,
      category: upload.category,
      mimeType: upload.mimeType,
      originalName: upload.originalName,
      sizeBytes: upload.sizeBytes,
      path: relativePath,
      uploadedBy: actor.actorId ?? "system",
      uploadedAt: now.toISOString(),
      archivedAt: null,
      relatedEntityType: upload.relatedEntityType ?? null,
      relatedEntityId: upload.relatedEntityId ?? null,
    };
    this.store.set(fileId, meta);

    // 7) Audit
    await this.audit.record({
      eventName: "audit:file.upload",
      tenantId,
      branchId: actor.branchId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "file",
      targetId: fileId,
      action: "create",
      correlationId: actor.correlationId,
      country: this.countryFor(actor, tenantId),
      severity: "info",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      after: {
        category: upload.category,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        originalName: upload.originalName,
      },
    });

    return meta;
  }

  /**
   * Dosyayı indirir (Buffer). Tenant izolasyonu zorunlu; cross-tenant
   * denemesi 404 ile reddedilir.
   */
  public async download(
    tenantId: string,
    fileId: string,
    actor: ActorContext,
  ): Promise<Buffer> {
    const meta = this.findAccessibleMeta(tenantId, fileId, actor);
    if (!meta) {
      throw new DomainError({
        errorCode: "VET-FILE-0003",
        message: "Dosya bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-FILE-0003",
      });
    }
    if (meta.archivedAt !== null && meta.archivedAt !== undefined) {
      throw new DomainError({
        errorCode: "VET-FILE-0005",
        message: "Dosya arşivlenmiş",
        httpStatus: 410,
        severity: "warning",
        i18nKey: "error.VET-FILE-0005",
      });
    }
    const data = await this.storage.get(meta.path);
    await this.audit.record({
      eventName: "audit:file.download",
      tenantId,
      branchId: actor.branchId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "file",
      targetId: fileId,
      action: "read",
      correlationId: actor.correlationId,
      country: this.countryFor(actor, tenantId),
      severity: "info",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
    });
    return data;
  }

  /**
   * Dosyayı arşivler (soft delete). Storage'da fiziksel silme YAPILMAZ;
   * yalnızca `archivedAt` set edilir. Audit warning seviyesinde.
   */
  public async archive(
    tenantId: string,
    fileId: string,
    actor: ActorContext,
  ): Promise<void> {
    const meta = this.findAccessibleMeta(tenantId, fileId, actor);
    if (!meta) {
      throw new DomainError({
        errorCode: "VET-FILE-0003",
        message: "Dosya bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-FILE-0003",
      });
    }
    if (meta.archivedAt !== null && meta.archivedAt !== undefined) {
      // idempotent: zaten arşivli.
      return;
    }
    meta.archivedAt = new Date().toISOString();
    this.store.set(fileId, meta);

    await this.audit.record({
      eventName: "audit:file.archive",
      tenantId,
      branchId: actor.branchId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "file",
      targetId: fileId,
      action: "archive",
      correlationId: actor.correlationId,
      country: this.countryFor(actor, tenantId),
      severity: "warning",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      before: { archivedAt: null },
      after: { archivedAt: meta.archivedAt },
    });
  }

  /**
   * Signed URL üretir. Tenant izolasyonu + yetki kontrolünden sonra
   * storage driver'ın `signedUrl` metodunu çağırır.
   */
  public async getSignedUrl(
    tenantId: string,
    fileId: string,
    actor: ActorContext,
    expiresInSec: number,
  ): Promise<string> {
    const meta = this.findAccessibleMeta(tenantId, fileId, actor);
    if (!meta) {
      throw new DomainError({
        errorCode: "VET-FILE-0003",
        message: "Dosya bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-FILE-0003",
      });
    }
    if (meta.archivedAt !== null && meta.archivedAt !== undefined) {
      throw new DomainError({
        errorCode: "VET-FILE-0005",
        message: "Dosya arşivlenmiş",
        httpStatus: 410,
        severity: "warning",
        i18nKey: "error.VET-FILE-0005",
      });
    }
    return this.storage.signedUrl(meta.path, expiresInSec);
  }

  /**
   * ID ile meta getirir (download/archive öncesi kontrol). Service
   * testlerinin ihtiyaç duyduğu public accessor.
   */
  public getMeta(fileId: string): FileMeta | undefined {
    return this.store.get(fileId);
  }

  /**
   * Tenant'a ait tüm meta'ları döner. GOAL-024 hayvan zaman
   * çizelgesinin `FileTimelineSource`'u tarafından kullanılır;
   * timeline filtereleme yaparak `relatedEntityType=patient`
   * olanları seçer. SUPERADMIN tüm tenant'ları görür; diğer
   * aktörler yalnızca kendi tenant'larını görür.
   *
   * Production'a geçişte Prisma query ile değiştirilecek.
   */
  public snapshot(tenantId: string, actor: ActorContext): FileMeta[] {
    if (actor.role === "SUPERADMIN") {
      return Array.from(this.store.values());
    }
    if (actor.tenantId !== tenantId) return [];
    return Array.from(this.store.values()).filter(
      (m) => m.tenantId === tenantId,
    );
  }

  /**
   * Tenant izolasyonu + arşiv kontrolü. Cross-tenant denemesinde
   * `undefined` döner (controller 404 fırlatır; bilgi sızdırmaz).
   */
  private findAccessibleMeta(
    tenantId: string,
    fileId: string,
    actor: ActorContext,
  ): FileMeta | undefined {
    const meta = this.store.get(fileId);
    if (!meta) return undefined;
    // SUPERADMIN tüm tenantları görür.
    if (actor.role === "SUPERADMIN") return meta;
    if (meta.tenantId !== tenantId || actor.tenantId !== tenantId) {
      return undefined;
    }
    return meta;
  }

  /**
   * Actor'ün tenant context'i request'le uyumlu mu? Upload/download
   * gibi tenant-scoped işlemlerde actor.tenantId kontrol edilir.
   */
  private assertTenantContext(actor: ActorContext, tenantId: string): void {
    if (actor.role === "SUPERADMIN") return;
    if (actor.tenantId !== tenantId) {
      throw new DomainError({
        errorCode: "VET-AUTHZ-0002",
        message: "Bu tenant'a erişim yetkiniz yok",
        httpStatus: 403,
        severity: "warning",
        i18nKey: "error.VET-AUTHZ-0002",
      });
    }
  }

  private countryFor(_actor: ActorContext, _tenantId: string): string {
    // FAZ-0: tenant ülkesi resolve edilmediği için default TR.
    // FAZ-2 sonunda TenantService'ten çekilecek.
    return "TR";
  }
}
