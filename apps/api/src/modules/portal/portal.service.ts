/**
 * @file Portal davet service.
 * @module apps/api/modules/portal/portal.service
 *
 * @description GOAL-025 portal erişim daveti iş kuralları. Hasta
 * sahibine (owner) portal erişimi için süreli tek kullanımlık
 * token oluşturur; token ile kabul edildiğinde tenant-scoped
 * PortalUser oluşturur ve session token üretir.
 *
 * İş kuralları:
 * - invite: owner aynı tenant'ta mı (cross-tenant → 404
 *   VET-AUTHZ-0002); her patientId aynı tenant'ta mı (cross-tenant
 *   → 404 VET-AUTHZ-0002); email lowercase normalize; token
 *   `randomUUID()` (URL-safe); expiresInDays 1-30 (30 üst sınır →
 *   422 VET-VALIDATION-0003). Audit `audit:portal.invite.create`
 *   (info).
 * - acceptInvitation: token ile bul → status=pending + expired
 *   değilse kabul edilir → 200 VET-PORTAL-0001; status=accepted →
 *   409 VET-PORTAL-0002; status=expired|revoked → 410
 *   VET-PORTAL-0001. Audit `audit:portal.invite.accept` (info).
 * - revoke: tenant-scoped, status pending ise revoked yapılır;
 *   diğer durumlar no-op (idempotent). Audit
 *   `audit:portal.invite.revoke` (warning).
 * - listForOwner: tenant-scoped, ownerId filtreli liste.
 *
 * @security
 * - Tenant bilgisi yalnızca actor.tenantId'den alınır.
 * - Cross-tenant owner/patient → 404 (bilgi sızdırmaz).
 * - Token, kabul adımında tek seferliktir; kabul sonrası status
 *   `accepted` olarak işaretlenir ve tekrar kullanılamaz.
 *
 * @since GOAL-025 (FAZ-2) portal erişim daveti
 */

import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type {
  PortalAcceptInput,
  PortalAcceptResult,
  PortalInvitation,
  PortalInviteInput,
  PortalUser,
} from "../../common/portal/portal.types.js";

import { OwnersService } from "../owners/owners.service.js";
import { PatientsService } from "../patients/patients.service.js";

import { PortalRepository } from "./portal.repository.js";

/** Davet expiration üst sınırı (gün). */
export const PORTAL_INVITE_MAX_DAYS = 30;
/** Davet expiration alt sınırı (gün). */
export const PORTAL_INVITE_MIN_DAYS = 1;

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);
  /**
   * In-memory portal user store. Davet kabul edildiğinde
   * tenant-scoped `PortalUser` burada tutulur. Production'da
   * ayrı `PortalUser` tablosu ile değiştirilecek; API sözleşmesi
   * sabit kalır.
   * key: tenantId|portalUserId → PortalUser.
   */
  private readonly portalUsers = new Map<string, PortalUser>();
  /** Session token index (tek seferlik). key: token → portalUserId. */
  private readonly sessionTokens = new Map<string, string>();

  public constructor(
    private readonly repo: PortalRepository,
    private readonly owners: OwnersService,
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Yeni portal daveti oluşturur. Owner ve hasta(lar) aynı
   * tenant'ta olmalı; email normalize; token UUID v4; expiresAt
   * now + expiresInDays gün.
   */
  public async invite(
    tenantId: string,
    input: PortalInviteInput,
    actor: ActorContext,
  ): Promise<PortalInvitation> {
    this.requireTenantScope(actor, tenantId);

    // 1) Owner doğrulama (cross-tenant → 404 VET-AUTHZ-0002).
    const owner = await this.owners.findById(tenantId, input.ownerId, actor);
    if (!owner) {
      throw new DomainError({
        errorCode: "VET-AUTHZ-0002",
        message: "Hasta sahibi bulunamadı",
        httpStatus: 404,
        severity: "info",
        i18nKey: "error.VET-AUTHZ-0002",
        details: { ownerId: input.ownerId },
      });
    }

    // 2) PatientIds doğrulama (cross-tenant → 404 VET-AUTHZ-0002).
    for (const pid of input.patientIds) {
      const patient = await this.patients.findById(tenantId, pid, actor);
      if (!patient) {
        throw new DomainError({
          errorCode: "VET-AUTHZ-0002",
          message: "Hayvan bulunamadı",
          httpStatus: 404,
          severity: "info",
          i18nKey: "error.VET-AUTHZ-0002",
          details: { patientId: pid },
        });
      }
    }

    // 3) Email normalize.
    const email = input.email.trim().toLowerCase();

    // 4) expiresInDays sınır kontrolü.
    if (
      !Number.isInteger(input.expiresInDays) ||
      input.expiresInDays < PORTAL_INVITE_MIN_DAYS ||
      input.expiresInDays > PORTAL_INVITE_MAX_DAYS
    ) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0003",
        message: "expiresInDays 1-30 aralığında olmalı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0003",
        details: {
          field: "expiresInDays",
          min: PORTAL_INVITE_MIN_DAYS,
          max: PORTAL_INVITE_MAX_DAYS,
        },
      });
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000,
    );
    const id = this.repo.nextId(tenantId);
    const record: PortalInvitation = {
      id,
      tenantId,
      ownerId: input.ownerId,
      email,
      status: "pending",
      invitedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      acceptedAt: null,
      revokedAt: null,
      invitationToken: randomUUID(),
      patientIds: input.patientIds,
      locale: input.locale,
      invitedBy: actor.actorId,
    };
    this.repo.insert(record);

    await this.audit.record({
      eventName: "audit:portal.invite.create",
      tenantId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "portal_invitation",
      targetId: id,
      action: "invite",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "info",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      after: {
        ownerId: input.ownerId,
        email,
        patientCount: input.patientIds.length,
        expiresInDays: input.expiresInDays,
        locale: input.locale,
      },
      metadata: { source: actor.source },
    });

    return record;
  }

  /**
   * Token ile daveti kabul eder. Pending + expired değilse kabul
   * edilir ve PortalUser oluşturulur; aksi durumda DomainError
   * fırlatır.
   */
  public async acceptInvitation(
    input: PortalAcceptInput,
    actor?: ActorContext,
  ): Promise<PortalAcceptResult> {
    const inv = this.repo.findByToken(input.token);
    if (!inv) {
      throw new DomainError({
        errorCode: "VET-PORTAL-0001",
        message: "Davet bulunamadı veya süresi dolmuş",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PORTAL-0001",
      });
    }

    if (inv.status === "accepted") {
      throw new DomainError({
        errorCode: "VET-PORTAL-0002",
        message: "Davet zaten kabul edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PORTAL-0002",
        details: { invitationId: inv.id },
      });
    }

    const now = new Date();
    const expiresAtMs = new Date(inv.expiresAt).getTime();
    if (inv.status === "expired" || (inv.status === "pending" && expiresAtMs <= now.getTime())) {
      // Pending ama süresi geçmiş → 410. Idempotent: status'ü expired olarak işaretle.
      if (inv.status === "pending") {
        const expired: PortalInvitation = { ...inv, status: "expired" };
        this.repo.update(expired);
      }
      throw new DomainError({
        errorCode: "VET-PORTAL-0001",
        message: "Davet süresi dolmuş",
        httpStatus: 410,
        severity: "warning",
        i18nKey: "error.VET-PORTAL-0001",
        details: { invitationId: inv.id },
      });
    }

    if (inv.status === "revoked") {
      throw new DomainError({
        errorCode: "VET-PORTAL-0001",
        message: "Davet iptal edilmiş",
        httpStatus: 410,
        severity: "warning",
        i18nKey: "error.VET-PORTAL-0001",
        details: { invitationId: inv.id },
      });
    }

    // Kabul et. Atomic update: status accepted, acceptedAt now.
    const accepted: PortalInvitation = {
      ...inv,
      status: "accepted",
      acceptedAt: now.toISOString(),
    };
    this.repo.update(accepted);

    // PortalUser oluştur (in-memory).
    const portalUserId = `pusr-${inv.tenantId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
    const portalUser: PortalUser = {
      id: portalUserId,
      tenantId: inv.tenantId,
      invitationId: inv.id,
      email: inv.email,
      ownerId: inv.ownerId,
      patientIds: inv.patientIds,
      createdAt: now.toISOString(),
    };
    this.portalUsers.set(`${inv.tenantId}|${portalUserId}`, portalUser);

    // Session token (UUID v4). Controller cookie/httpOnly ile bağlar.
    const sessionToken = randomUUID();
    this.sessionTokens.set(sessionToken, portalUserId);

    // Audit.
    await this.audit.record({
      eventName: "audit:portal.invite.accept",
      tenantId: inv.tenantId,
      actorId: actor?.actorId ?? null,
      actorType: actor?.actorType ?? "user",
      targetType: "portal_invitation",
      targetId: inv.id,
      action: "complete",
      correlationId: actor?.correlationId ?? `req-portal-${now.getTime()}`,
      country: "TR",
      severity: "info",
      ipAddress: actor?.ipAddress ?? null,
      userAgentHash: actor?.userAgentHash ?? null,
      after: {
        portalUserId,
        ownerId: inv.ownerId,
        patientCount: inv.patientIds.length,
        locale: inv.locale,
      },
      metadata: { source: actor?.source ?? "public" },
    });

    return { portalUserId, sessionToken };
  }

  /**
   * Daveti iptal eder. Yalnızca `pending` durumdaki davetler
   * iptal edilebilir; diğer durumlar no-op (idempotent). Aynı
   * tenant'ta olmalı.
   */
  public async revoke(
    tenantId: string,
    invitationId: string,
    actor: ActorContext,
  ): Promise<PortalInvitation> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, invitationId);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-PORTAL-0001",
        message: "Davet bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PORTAL-0001",
      });
    }
    if (existing.status !== "pending") {
      // Idempotent: mevcut kaydı döndür.
      return existing;
    }
    const at = new Date().toISOString();
    const revoked: PortalInvitation = {
      ...existing,
      status: "revoked",
      revokedAt: at,
    };
    this.repo.update(revoked);

    await this.audit.record({
      eventName: "audit:portal.invite.revoke",
      tenantId,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "portal_invitation",
      targetId: invitationId,
      action: "cancel",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "warning",
      ipAddress: actor.ipAddress,
      userAgentHash: actor.userAgentHash,
      before: { status: "pending", revokedAt: null },
      after: { status: "revoked", revokedAt: at },
      metadata: { source: actor.source },
    });

    return revoked;
  }

  /**
   * Owner'a ait tüm davetleri döner. Tenant-scoped, opsiyonel
   * status filtresi (controller'a bırakılmıştır; service her
   * status'ü döner).
   */
  public listForOwner(
    tenantId: string,
    ownerId: string,
    actor: ActorContext,
  ): PortalInvitation[] {
    this.requireTenantScope(actor, tenantId);
    return this.repo.listForOwner(tenantId, ownerId);
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
}
