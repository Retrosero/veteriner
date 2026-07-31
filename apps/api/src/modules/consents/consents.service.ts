/**
 * @file Consent service.
 * @module apps/api/modules/consents/consents.service
 *
 * @description GOAL-081 (FAZ-8) onam formu iş kuralları.
 *
 * İş kuralları:
 * - `createConsent` (draft): şablon + versiyon + patientId +
 *   ownerId zorunlu. Audit `audit:consent.create`.
 * - `listConsents` / `getConsentDetail`: tenant-scoped; cross-tenant
 *   → null.
 * - `signConsent` (draft → signed): signatureMethod zorunlu.
 *   signedAt set edilir. signed durumda tekrar imza 409
 *   VET-CONSENT-0002. Audit `audit:consent.sign`.
 * - `revokeConsent` (signed → revoked): imzalı form geri
 *   çekilebilir; revoked tekrar revoke edilemez 409
 *   VET-CONSENT-0003. Audit `audit:consent.revoke`.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Onam formu üzerinde fiziksel silme YOKTUR.
 *
 * @since GOAL-081 (FAZ-8) onam formları core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  toConsent,
  type ConsentRecord,
} from "../../common/consents/consent.types.js";
import type {
  Consent,
  ConsentCreateInput,
  ConsentFilters,
  ConsentListResponse,
  ConsentRevokeInput,
  ConsentSignInput,
} from "@vetniva/contracts";

import { ConsentsRepository } from "./consents.repository.js";

@Injectable()
export class ConsentsService {
  private readonly logger = new Logger(ConsentsService.name);

  public constructor(
    private readonly repo: ConsentsRepository,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createConsent
  // -------------------------------------------------------------------------

  public async createConsent(
    tenantId: string,
    input: ConsentCreateInput,
    actor: ActorContext,
  ): Promise<Consent> {
    this.requireTenantScope(actor, tenantId);

    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId);
    const record: ConsentRecord = {
      id,
      tenantId,
      templateType: input.templateType,
      templateVersion: input.templateVersion,
      patientId: input.patientId,
      ownerId: input.ownerId,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      locale: input.locale,
      status: "draft",
      signatureMethod: null,
      signatureProvider: null,
      signatureReference: null,
      signedAt: null,
      notes: input.notes ?? null,
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    this.repo.insert(record);

    await this.audit.recordSimple(
      "audit:consent.create",
      "consent",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        templateType: input.templateType,
        templateVersion: input.templateVersion,
        patientId: input.patientId,
        ownerId: input.ownerId,
        locale: input.locale,
      },
    );

    return toConsent(record);
  }

  // -------------------------------------------------------------------------
  // listConsents / getConsentDetail
  // -------------------------------------------------------------------------

  public async listConsents(
    tenantId: string,
    filters: ConsentFilters,
    actor: ActorContext,
  ): Promise<ConsentListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, {
      status: filters.status,
      templateType: filters.templateType,
      patientId: filters.patientId,
      ownerId: filters.ownerId,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toConsent(r)),
      total: result.total,
    };
  }

  public async getConsentDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Consent | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, id);
    return rec ? toConsent(rec) : null;
  }

  // -------------------------------------------------------------------------
  // signConsent
  // -------------------------------------------------------------------------

  public async signConsent(
    tenantId: string,
    id: string,
    input: ConsentSignInput,
    actor: ActorContext,
  ): Promise<Consent> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CONSENT-0001",
        message: "Onam formu bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CONSENT-0001",
        details: { id },
      });
    }
    if (existing.status !== "draft") {
      throw new DomainError({
        errorCode: "VET-CONSENT-0002",
        message: "Yalnızca taslak onam formu imzalanabilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-CONSENT-0002",
        details: { id, currentStatus: existing.status },
      });
    }

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, id, {
      status: "signed",
      signatureMethod: input.signatureMethod,
      signatureProvider: input.signatureProvider ?? null,
      signatureReference: input.signatureReference ?? null,
      signedAt: nowIso,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:consent.sign",
      "consent",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        templateType: existing.templateType,
        patientId: existing.patientId,
        ownerId: existing.ownerId,
        signatureMethod: input.signatureMethod,
        signatureProvider: input.signatureProvider ?? null,
      },
    );

    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CONSENT-0001",
        message: "Onam formu bulunamadı",
        httpStatus: 404,
      });
    }
    return toConsent(updated);
  }

  // -------------------------------------------------------------------------
  // revokeConsent
  // -------------------------------------------------------------------------

  public async revokeConsent(
    tenantId: string,
    id: string,
    input: ConsentRevokeInput,
    actor: ActorContext,
  ): Promise<Consent> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CONSENT-0001",
        message: "Onam formu bulunamadı",
        httpStatus: 404,
      });
    }
    if (existing.status === "revoked") {
      throw new DomainError({
        errorCode: "VET-CONSENT-0003",
        message: "Onam formu zaten geri çekilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-CONSENT-0003",
        details: { id },
      });
    }
    if (existing.status === "draft") {
      throw new DomainError({
        errorCode: "VET-CONSENT-0004",
        message: "İmzalanmamış taslak geri çekilemez; iptal edin",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-CONSENT-0004",
        details: { id },
      });
    }

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, id, {
      status: "revoked",
      revokedAt: nowIso,
      revokedBy: actor.actorId ?? "system",
      revokeReason: input.reason,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:consent.revoke",
      "consent",
      id,
      "archive",
      this.actorToAuditActor(actor),
      "warning",
      {
        previousStatus: existing.status,
        reason: input.reason,
      },
    );

    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-CONSENT-0001",
        message: "Onam formu bulunamadı",
        httpStatus: 404,
      });
    }
    return toConsent(updated);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

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
      actorType: actor.actorType as "user" | "system",
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }
}
