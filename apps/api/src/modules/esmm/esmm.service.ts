/**
 * @file EsmmDocument service.
 * @module apps/api/modules/esmm/esmm.service
 *
 * @description GOAL-077 (FAZ-7) e-SMM adapter service.
 *   Mock provider üzerinden belge gönderim/durum/iptal/retry
 *   akışlarını yönetir. Gerçek provider entegrasyonu Faz 13+.
 *
 * İş kuralları:
 * - `createDocument` (draft):
 *   - Manuel belge numarası opsiyonel. Verildiyse başka
 *     belgede kullanılmamış olmalı (409 VET-ESMM-0004).
 *   - Audit `audit:esmm_document.create`.
 * - `submitDocument` (draft/failed/rejected → pending/accepted):
 *   - Adapter'a submit. `accepted` durumda `acceptedAt` set
 *     edilir. Audit `audit:esmm_document.submit`.
 *   - Retryable hata: `failed` durumuna geçer; retry ile
 *     tekrar denenir.
 * - `retryDocument`: `failed`/`rejected` durumdaki belgeler
 *   için yeniden submit. Audit `audit:esmm_document.retry`.
 * - `queryDocumentStatus`: adapter'dan güncel durumu çeker;
 *   local kayıt güncellenir.
 * - `cancelDocument`: pending/accepted → cancelled.
 *   `accepted` durumda provider'da da iptal denenir.
 *   Audit `audit:esmm_document.cancel`.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Belgeler üzerinde fiziksel silme yoktur; `status` alanı
 *   ile yaşam döngüsü takip edilir.
 *
 * @since GOAL-077 (FAZ-7) e-SMM adapter sözleşmesi core
 */

import { Inject, Injectable, Logger } from "@nestjs/common";

import { EsmmDocumentsRepository } from "./esmm.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  ESMM_ADAPTER,
  toEsmmDocument,
  type EsmmAdapter,
  type EsmmDocumentRecord,
} from "../../common/esmm/esmm.types.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  EsmmDocument,
  EsmmDocumentCreateInput,
  EsmmDocumentFilters,
  EsmmDocumentListResponse,
  EsmmSubmitDocumentInput,
} from "@vetniva/contracts";

@Injectable()
export class EsmmDocumentsService {
  private readonly logger = new Logger(EsmmDocumentsService.name);

  public constructor(
    private readonly repo: EsmmDocumentsRepository,
    @Inject(ESMM_ADAPTER)
    private readonly adapter: EsmmAdapter,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createDocument
  // -------------------------------------------------------------------------

  public async createDocument(
    tenantId: string,
    input: EsmmDocumentCreateInput,
    actor: ActorContext,
  ): Promise<EsmmDocument> {
    this.requireTenantScope(actor, tenantId);

    // Manuel belge numarası unique kontrolü (tenant-scoped).
    if (input.manualDocumentNumber) {
      const dup = this.findByManualNumber(tenantId, input.manualDocumentNumber);
      if (dup) {
        throw new DomainError({
          errorCode: "VET-ESMM-0004",
          message: "Bu manuel belge numarası zaten kullanılmış",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-ESMM-0004",
          details: { manualDocumentNumber: input.manualDocumentNumber },
        });
      }
    }

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId);
    const record: EsmmDocumentRecord = {
      id,
      tenantId,
      type: input.type,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      status: "draft",
      providerDocumentId: null,
      providerDocumentNumber: null,
      providerMessage: null,
      payload: input.payload,
      manualDocumentNumber: input.manualDocumentNumber ?? null,
      notes: input.notes ?? null,
      lastAttemptAt: null,
      acceptedAt: null,
      cancelledAt: null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    this.repo.insert(record);

    await this.audit.recordSimple(
      "audit:esmm_document.create",
      "esmm_document",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        type: input.type,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        manualDocumentNumber: input.manualDocumentNumber ?? null,
      },
    );

    return toEsmmDocument(record);
  }

  // -------------------------------------------------------------------------
  // listDocuments / getDocument
  // -------------------------------------------------------------------------

  public async listDocuments(
    tenantId: string,
    filters: EsmmDocumentFilters,
    actor: ActorContext,
  ): Promise<EsmmDocumentListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, {
      type: filters.type,
      status: filters.status,
      sourceType: filters.sourceType,
      sourceId: filters.sourceId,
      search: filters.search,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toEsmmDocument(r)),
      total: result.total,
    };
  }

  public async getDocument(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<EsmmDocument | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, id);
    return rec ? toEsmmDocument(rec) : null;
  }

  // -------------------------------------------------------------------------
  // submitDocument
  // -------------------------------------------------------------------------

  public async submitDocument(
    tenantId: string,
    id: string,
    input: EsmmSubmitDocumentInput,
    actor: ActorContext,
  ): Promise<EsmmDocument> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-ESMM-0001",
        message: "Belge bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-ESMM-0001",
        details: { id },
      });
    }
    if (existing.status === "accepted") {
      throw new DomainError({
        errorCode: "VET-ESMM-0002",
        message: "Belge zaten kabul edilmiş; tekrar gönderilemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-ESMM-0002",
        details: { id, currentStatus: existing.status },
      });
    }
    if (existing.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-ESMM-0002",
        message: "İptal edilmiş belge gönderilemez",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-ESMM-0002",
        details: { id, currentStatus: existing.status },
      });
    }
    if (existing.status === "pending") {
      throw new DomainError({
        errorCode: "VET-ESMM-0002",
        message: "Belge zaten gönderilmiş; provider yanıtı bekleniyor",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-ESMM-0002",
        details: { id, currentStatus: existing.status },
      });
    }

    const nowIso = new Date().toISOString();
    // Adapter'a gönderim. Mock provider idempotent.
    const response = await this.adapter.submitDocument({
      documentId: existing.id,
      idempotencyKey: input.idempotencyKey,
      type: existing.type,
      payload: existing.payload,
    });

    const newStatus = response.status;
    const acceptedAt = newStatus === "accepted" ? response.respondedAt : null;
    this.repo.update(tenantId, id, {
      status: newStatus,
      providerDocumentId: response.providerDocumentId,
      providerDocumentNumber: response.providerDocumentNumber,
      providerMessage: response.providerMessage,
      lastAttemptAt: nowIso,
      acceptedAt,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:esmm_document.submit",
      "esmm_document",
      id,
      "update",
      this.actorToAuditActor(actor),
      newStatus === "accepted" ? "info" : "warning",
      {
        type: existing.type,
        sourceType: existing.sourceType,
        sourceId: existing.sourceId,
        provider: this.adapter.providerName,
        providerStatus: newStatus,
        providerMessage: response.providerMessage,
        idempotencyKey: input.idempotencyKey,
      },
    );

    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-ESMM-0001",
        message: "Belge bulunamadı",
        httpStatus: 404,
      });
    }
    return toEsmmDocument(updated);
  }

  // -------------------------------------------------------------------------
  // retryDocument
  // -------------------------------------------------------------------------

  public async retryDocument(
    tenantId: string,
    id: string,
    input: EsmmSubmitDocumentInput,
    actor: ActorContext,
  ): Promise<EsmmDocument> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-ESMM-0001",
        message: "Belge bulunamadı",
        httpStatus: 404,
      });
    }
    if (existing.status !== "failed" && existing.status !== "rejected") {
      throw new DomainError({
        errorCode: "VET-ESMM-0003",
        message: "Yalnızca başarısız/reddedilmiş belgeler tekrar denenebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-ESMM-0003",
        details: { id, currentStatus: existing.status },
      });
    }

    // Aynı submit akışı; idempotencyKey aynı olabilir (mock
    // provider duplicate üretmez).
    const nowIso = new Date().toISOString();
    const response = await this.adapter.submitDocument({
      documentId: existing.id,
      idempotencyKey: input.idempotencyKey,
      type: existing.type,
      payload: existing.payload,
    });
    const newStatus = response.status;
    const acceptedAt = newStatus === "accepted" ? response.respondedAt : null;
    this.repo.update(tenantId, id, {
      status: newStatus,
      providerDocumentId: response.providerDocumentId,
      providerDocumentNumber: response.providerDocumentNumber,
      providerMessage: response.providerMessage,
      lastAttemptAt: nowIso,
      acceptedAt,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:esmm_document.retry",
      "esmm_document",
      id,
      "update",
      this.actorToAuditActor(actor),
      newStatus === "accepted" ? "info" : "warning",
      {
        providerStatus: newStatus,
        idempotencyKey: input.idempotencyKey,
      },
    );

    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-ESMM-0001",
        message: "Belge bulunamadı",
        httpStatus: 404,
      });
    }
    return toEsmmDocument(updated);
  }

  // -------------------------------------------------------------------------
  // cancelDocument
  // -------------------------------------------------------------------------

  public async cancelDocument(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<EsmmDocument> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-ESMM-0001",
        message: "Belge bulunamadı",
        httpStatus: 404,
      });
    }
    if (existing.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-ESMM-0005",
        message: "Belge zaten iptal edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-ESMM-0005",
        details: { id },
      });
    }
    if (existing.status === "accepted") {
      // Provider'da da iptal denenir (mock no-op).
      if (existing.providerDocumentId) {
        await this.adapter.cancelDocument(existing.providerDocumentId);
      }
    }
    if (existing.status === "draft" && existing.lastAttemptAt === null) {
      // Henüz gönderilmemiş taslak → doğrudan iptal.
    }

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, id, {
      status: "cancelled",
      cancelledAt: nowIso,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:esmm_document.cancel",
      "esmm_document",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "warning",
      {
        previousStatus: existing.status,
        provider: this.adapter.providerName,
      },
    );

    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-ESMM-0001",
        message: "Belge bulunamadı",
        httpStatus: 404,
      });
    }
    return toEsmmDocument(updated);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private findByManualNumber(
    tenantId: string,
    manualNumber: string,
  ): EsmmDocumentRecord | null {
    for (const rec of this.repo["byId"].values()) {
      if (
        rec.tenantId === tenantId &&
        rec.manualDocumentNumber === manualNumber
      ) {
        return rec;
      }
    }
    return null;
  }

  private requireTenantScope(actor: ActorContext, tenantId: string): void {
    if (actor.role === "SUPERADMIN") return;
    if (actor.tenantId === tenantId) return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem için yetkiniz yok",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }

  private actorToAuditActor(actor: ActorContext): {
    actorId: string | null;
    actorType: "user" | "system" | "portal_user";
    tenantId: string | null;
    branchId: string | null;
    correlationId: string;
    country: string;
  } {
    return {
      actorId: actor.actorId,
      actorType: actor.actorType,
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }
}
