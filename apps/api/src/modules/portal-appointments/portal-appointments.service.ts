/**
 * @file Portal appointments service.
 * @module apps/api/modules/portal-appointments/portal-appointments.service
 *
 * @description GOAL-035 hasta sahibi portal — online randevu talebi
 * iş kuralları. Portal user kendi hayvanları için talep oluşturur;
 * personel onaylar/reddeder veya talep iptal edilir.
 *
 * İş kuralları:
 * - `create`: portalUser → ownerId → patientId doğrulama (cross-tenant
 *   veya başka owner → 404 VET-CLINIC-0001); `preferredDate` gelecekte
 *   olmalı (geçmiş → 422 VET-VALIDATION-0009); in-memory Map'e ekle;
 *   bildirim: hasta sahibine (in_app) + klinik personeline (in_app).
 *   Audit `audit:portal.appointment.request` (info).
 * - `list`: portal user yalnızca kendi ownerId'sine ait request'leri
 *   görür (bilgi sızdırmaz).
 * - `cancel`: yalnızca sahibi (`ownerId === portalUser.ownerId`)
 *   iptal edebilir; status=cancelled. Audit
 *   `audit:portal.appointment.cancel` (info).
 * - `approve`: staff onayı → status=approved, decidedAt set,
 *   approvedAppointmentId set. `AppointmentsService.create` çağrısı
 *   preferredDate'i start olarak kullanır (duration 30dk default);
 *   preferredVeterinarianId yoksa dummy vet UUID kullanılır
 *   (FAZ-0 stub; FAZ-3+'da round-robin/skill match ile).
 *   Audit `audit:portal.appointment.approve` (info).
 * - `reject`: staff reddi → status=rejected + reason. Audit
 *   `audit:portal.appointment.reject` (warning).
 *
 * @security
 * - Tenant bilgisi yalnızca session/actor üzerinden alınır.
 * - Cross-owner / cross-tenant erişim 404 ile maskelenir.
 * - Cancel yalnızca talep sahibine açık; staff cancel yapamaz.
 *
 * @since GOAL-035 (FAZ-3) online randevu talebi core
 */

import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type {
  Appointment,
  AppointmentRequest,
  AppointmentRequestCreateInput,
} from "@vetniva/contracts";

import type { AppointmentsService } from "../appointments/appointments.service.js";
import type { NotificationsService } from "../notifications/notifications.service.js";
import type { PatientsService } from "../patients/patients.service.js";
import { PortalAuthService } from "../portal-auth/portal-auth.service.js";

import type {
  AppointmentRequestApproveResult,
  AppointmentRequestRecord,
} from "./portal-appointments.types.js";

/** Approve edilen talep için default randevu süresi (dakika). */
const APPROVE_DEFAULT_DURATION_MIN = 30;

/** preferredVeterinarianId yoksa kullanılan placeholder UUID.
 *  Service seviyesinde tenant-scoped veterinarian kaydı yok; FAZ-3+'da
 *  round-robin/skill-match ataması yapılacak. */
const PLACEHOLDER_VETERINARIAN_ID = "vet-unassigned-stub";

@Injectable()
export class PortalAppointmentsService {
  private readonly logger = new Logger(PortalAppointmentsService.name);

  /** key: id → record. */
  private readonly byId = new Map<string, AppointmentRequestRecord>();

  public constructor(
    private readonly portalAuth: PortalAuthService,
    private readonly patients: PatientsService,
    private readonly appointments: AppointmentsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ===========================================================================
  // CREATE
  // ===========================================================================

  /**
   * Portal kullanıcısı kendi hayvanı için randevu talebi oluşturur.
   * Owner doğrulaması, hasta doğrulaması, tarih kontrolü yapılır.
   * In-memory Map'e eklenir; audit + bildirim yayınlanır.
   */
  public async create(
    tenantId: string,
    portalUserId: string,
    input: AppointmentRequestCreateInput,
    actor: ActorContext,
  ): Promise<AppointmentRequest> {
    this.requireTenantScope(actor, tenantId);

    // 1) PortalUser → ownerId (bilgi sızdırmaz: bulunamazsa 404).
    const portalUser = this.portalAuth.findById(tenantId, portalUserId);
    if (!portalUser) {
      throw this.notFound("portal_user_not_found", { portalUserId });
    }
    const ownerId = portalUser.ownerId;

    // 2) Patient aynı tenant'ta ve bu owner'a mı ait?
    const patient = await this.patients.findById(
      tenantId,
      input.patientId,
      actor,
    );
    if (!patient || patient.ownerId !== ownerId) {
      throw this.notFound("patient_not_found", { patientId: input.patientId });
    }

    // 3) preferredDate gelecekte mi?
    const preferredMs = new Date(input.preferredDate).getTime();
    if (Number.isNaN(preferredMs)) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0009",
        message: "Geçersiz tercih edilen tarih",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0009",
        details: { field: "preferredDate", value: input.preferredDate },
      });
    }
    if (preferredMs <= Date.now()) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0009",
        message: "Tercih edilen tarih gelecekte olmalı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0009",
        details: { preferredDate: input.preferredDate },
      });
    }

    // 4) In-memory kayıt oluştur.
    const now = new Date().toISOString();
    const id = this.nextId(tenantId);
    const record: AppointmentRequestRecord = {
      id,
      tenantId,
      patientId: patient.id,
      ownerId: patient.ownerId,
      status: "pending",
      preferredDate: input.preferredDate,
      preferredVeterinarianId: input.preferredVeterinarianId ?? null,
      type: input.type,
      reason: input.reason,
      contactPreference: input.contactPreference,
      requestedAt: now,
      decidedAt: null,
      decidedBy: null,
      rejectionReason: null,
      approvedAppointmentId: null,
    };
    this.byId.set(id, record);

    // 5) Bildirimler (best-effort; hata durumunda akış durmaz).
    await this.dispatchNotificationsBestEffort(record);

    // 6) Audit.
    await this.audit.recordSimple(
      "audit:portal.appointment.request",
      "portal_appointment_request",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        patientId: record.patientId,
        ownerId: record.ownerId,
        type: record.type,
        preferredDate: record.preferredDate,
        preferredVeterinarianId: record.preferredVeterinarianId,
        contactPreference: record.contactPreference,
      },
    );

    return this.toRequest(record);
  }

  // ===========================================================================
  // LIST
  // ===========================================================================

  /**
   * Portal kullanıcısının kendi oluşturduğu talepleri listeler. Owner
   * filtresi zorunlu; bilgi sızdırmaz.
   */
  public async list(
    tenantId: string,
    portalUserId: string,
    actor: ActorContext,
  ): Promise<AppointmentRequest[]> {
    this.requireTenantScope(actor, tenantId);

    const portalUser = this.portalAuth.findById(tenantId, portalUserId);
    if (!portalUser) {
      return [];
    }
    const ownerId = portalUser.ownerId;

    const items: AppointmentRequest[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.ownerId !== ownerId) continue;
      items.push(this.toRequest(rec));
    }
    // En yeni talep üstte.
    items.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return items;
  }

  // ===========================================================================
  // CANCEL
  // ===========================================================================

  /**
   * Portal sahibi kendi talebini iptal eder. Yalnızca `pending`
   * statüsündeki talepler iptal edilebilir; onaylanmış/iptal edilmiş
   * talepler idempotent davranır veya 422 fırlatır.
   */
  public async cancel(
    tenantId: string,
    portalUserId: string,
    requestId: string,
    actor: ActorContext,
  ): Promise<void> {
    this.requireTenantScope(actor, tenantId);

    const portalUser = this.portalAuth.findById(tenantId, portalUserId);
    if (!portalUser) {
      throw this.notFound("portal_user_not_found", { portalUserId });
    }

    const existing = this.byId.get(requestId);
    if (!existing || existing.tenantId !== tenantId) {
      throw this.notFound("request_not_found", { requestId });
    }
    if (existing.ownerId !== portalUser.ownerId) {
      // Bilgi sızdırmaz: başka owner'ın talebi → 404.
      throw this.notFound("request_not_found", { requestId });
    }
    if (existing.status === "cancelled") {
      return; // idempotent
    }
    if (
      existing.status === "approved" ||
      existing.status === "rejected"
    ) {
      throw new DomainError({
        errorCode: "VET-PORTAL-0006",
        message: "Onaylanmış veya reddedilmiş talep iptal edilemez",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PORTAL-0006",
        details: { id: requestId, status: existing.status },
      });
    }

    const now = new Date().toISOString();
    this.byId.set(requestId, { ...existing, status: "cancelled", decidedAt: now });

    await this.audit.recordSimple(
      "audit:portal.appointment.cancel",
      "portal_appointment_request",
      requestId,
      "cancel",
      this.actorToAuditActor(actor),
      "info",
      {
        patientId: existing.patientId,
        ownerId: existing.ownerId,
        previousStatus: existing.status,
      },
    );
  }

  // ===========================================================================
  // APPROVE (staff)
  // ===========================================================================

  /**
   * Personel talebi onaylar. AppointmentsService.create ile gerçek
   * randevuyu oluşturur; talep `approved` statüsüne geçer.
   * Calendar uygunluk çakışması veya geçersiz tarihte 409/422 fırlatır.
   */
  public async approve(
    tenantId: string,
    requestId: string,
    decidedBy: string,
    actor: ActorContext,
  ): Promise<AppointmentRequestApproveResult> {
    this.requireTenantScope(actor, tenantId);

    const existing = this.byId.get(requestId);
    if (!existing || existing.tenantId !== tenantId) {
      throw this.notFound("request_not_found", { requestId });
    }
    if (existing.status !== "pending") {
      throw new DomainError({
        errorCode: "VET-PORTAL-0006",
        message: `Yalnızca bekleyen talepler onaylanabilir (mevcut: ${existing.status})`,
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PORTAL-0006",
        details: { id: requestId, status: existing.status },
      });
    }

    // 1) AppointmentsService.create ile randevuyu oluştur.
    const veterinarianId =
      existing.preferredVeterinarianId ?? PLACEHOLDER_VETERINARIAN_ID;
    const startIso = existing.preferredDate;
    const startMs = new Date(startIso).getTime();
    if (Number.isNaN(startMs) || startMs <= Date.now()) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0009",
        message: "Onay anında tercih edilen tarih artık geçerli değil",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0009",
        details: { preferredDate: startIso },
      });
    }

    let appointment: Appointment;
    try {
      appointment = await this.appointments.create(
        tenantId,
        {
          patientId: existing.patientId,
          veterinarianId,
          type: existing.type,
          start: startIso,
          durationMin: APPROVE_DEFAULT_DURATION_MIN,
        },
        { ...actor, actorId: decidedBy },
      );
    } catch (err) {
      // Calendar çakışması veya benzeri hata → talep hala pending kalır.
      this.logger.warn(
        `Portal appointment approve → appointments.create başarısız: ${(err as Error).message}`,
      );
      throw err;
    }

    // 2) Talebi approved yap.
    const now = new Date().toISOString();
    const updated: AppointmentRequestRecord = {
      ...existing,
      status: "approved",
      decidedAt: now,
      decidedBy,
      approvedAppointmentId: appointment.id,
    };
    this.byId.set(requestId, updated);

    // 3) Onay bildirimi (sahibine in_app).
    await this.dispatchNotificationBestEffort({
      tenantId,
      userId: existing.ownerId,
      channel: "in_app",
      category: "custom",
      templateKey: "portal.appointment.approved",
      locale: "tr-TR",
      data: {
        requestId,
        appointmentId: appointment.id,
        patientId: existing.patientId,
        preferredDate: existing.preferredDate,
      },
    });

    // 4) Audit.
    await this.audit.recordSimple(
      "audit:portal.appointment.approve",
      "portal_appointment_request",
      requestId,
      "update",
      this.actorToAuditActor({ ...actor, actorId: decidedBy }),
      "info",
      {
        patientId: existing.patientId,
        ownerId: existing.ownerId,
        appointmentId: appointment.id,
        decidedBy,
        previousStatus: existing.status,
      },
    );

    return { request: this.toRequest(updated), appointmentId: appointment.id };
  }

  // ===========================================================================
  // REJECT (staff)
  // ===========================================================================

  /**
   * Personel talebi reddeder. `rejectionReason` zorunlu.
   */
  public async reject(
    tenantId: string,
    requestId: string,
    decidedBy: string,
    reason: string,
    actor: ActorContext,
  ): Promise<void> {
    this.requireTenantScope(actor, tenantId);

    const existing = this.byId.get(requestId);
    if (!existing || existing.tenantId !== tenantId) {
      throw this.notFound("request_not_found", { requestId });
    }
    if (existing.status !== "pending") {
      throw new DomainError({
        errorCode: "VET-PORTAL-0006",
        message: `Yalnızca bekleyen talepler reddedilebilir (mevcut: ${existing.status})`,
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PORTAL-0006",
        details: { id: requestId, status: existing.status },
      });
    }

    const now = new Date().toISOString();
    this.byId.set(requestId, {
      ...existing,
      status: "rejected",
      decidedAt: now,
      decidedBy,
      rejectionReason: reason,
    });

    // Red bildirimi (sahibine in_app).
    await this.dispatchNotificationBestEffort({
      tenantId,
      userId: existing.ownerId,
      channel: "in_app",
      category: "custom",
      templateKey: "portal.appointment.rejected",
      locale: "tr-TR",
      data: {
        requestId,
        patientId: existing.patientId,
        reason,
      },
    });

    await this.audit.recordSimple(
      "audit:portal.appointment.reject",
      "portal_appointment_request",
      requestId,
      "update",
      this.actorToAuditActor({ ...actor, actorId: decidedBy }),
      "warning",
      {
        patientId: existing.patientId,
        ownerId: existing.ownerId,
        decidedBy,
        reason,
        previousStatus: existing.status,
      },
    );
  }

  // ===========================================================================
  // FIND APPOINTMENT BY ID (cross-module helper)
  // ===========================================================================

  /**
   * Approve sonrası oluşturulan randevunun detayını dışarıya
   * sunmak için yardımcı. `AppointmentsService.findById` üzerinden
   * geçer; bulunamazsa null.
   */
  public async findAppointmentById(
    tenantId: string,
    appointmentId: string,
    actor: ActorContext,
  ): Promise<Appointment | null> {
    return this.appointments.findById(tenantId, appointmentId, actor);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /** Tenant izolasyonu kontrolü. SUPERADMIN bypass. */
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

  private notFound(
    kind: "portal_user_not_found" | "patient_not_found" | "request_not_found",
    details: Record<string, unknown>,
  ): DomainError {
    return new DomainError({
      errorCode: "VET-CLINIC-0001",
      message:
        kind === "patient_not_found"
          ? "Hayvan bulunamadı"
          : kind === "request_not_found"
            ? "Talep bulunamadı"
            : "Portal kullanıcısı bulunamadı",
      httpStatus: 404,
      severity: "info",
      i18nKey: "error.VET-CLINIC-0001",
      details: { kind, ...details },
    });
  }

  private nextId(tenantId: string): string {
    const stamp = Date.now().toString(36);
    const suffix = randomUUID().slice(0, 8);
    return `pareq-${tenantId.slice(0, 8)}-${stamp}-${suffix}`;
  }

  private toRequest(rec: AppointmentRequestRecord): AppointmentRequest {
    return {
      id: rec.id,
      tenantId: rec.tenantId,
      patientId: rec.patientId,
      ownerId: rec.ownerId,
      status: rec.status,
      preferredDate: rec.preferredDate,
      preferredVeterinarianId: rec.preferredVeterinarianId,
      type: rec.type,
      reason: rec.reason,
      contactPreference: rec.contactPreference,
      requestedAt: rec.requestedAt,
      decidedAt: rec.decidedAt,
      decidedBy: rec.decidedBy,
      rejectionReason: rec.rejectionReason,
      approvedAppointmentId: rec.approvedAppointmentId,
    };
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
      actorType: actor.actorType as "user" | "system" | "portal_user",
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }

  private async dispatchNotificationsBestEffort(
    record: AppointmentRequestRecord,
  ): Promise<void> {
    // 1) Sahibine: talep alındı.
    await this.dispatchNotificationBestEffort({
      tenantId: record.tenantId,
      userId: record.ownerId,
      channel: "in_app",
      category: "custom",
      templateKey: "portal.appointment.requested",
      locale: "tr-TR",
      data: {
        requestId: record.id,
        patientId: record.patientId,
        preferredDate: record.preferredDate,
        type: record.type,
        contactPreference: record.contactPreference,
      },
    });

    // 2) Klinik personeline: yeni talep var. Sahibin kendisine de
    //    bildirim gitmemesi için userId'yi boş bırakıp generic stub
    //    recipient'a yönlendiriyoruz. FAZ-3+'da tenant staff roster
    //    üzerinden fan-out yapılır.
    await this.dispatchNotificationBestEffort({
      tenantId: record.tenantId,
      userId: `staff-${record.tenantId}`,
      channel: "in_app",
      category: "custom",
      templateKey: "clinic.appointment.requested",
      locale: "tr-TR",
      data: {
        requestId: record.id,
        patientId: record.patientId,
        ownerId: record.ownerId,
        preferredDate: record.preferredDate,
        type: record.type,
        contactPreference: record.contactPreference,
        reason: record.reason,
      },
    });
  }

  private async dispatchNotificationBestEffort(args: {
    tenantId: string;
    userId: string;
    channel: "sms" | "email" | "in_app" | "whatsapp";
    category: "appointment_reminder" | "vaccination_due" | "lab_result_ready" | "invoice" | "portal_invite" | "custom";
    templateKey: string;
    locale: "tr-TR" | "en-GB";
    data: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.notifications.send({
        tenantId: args.tenantId,
        userId: args.userId,
        channel: args.channel,
        category: args.category,
        templateKey: args.templateKey,
        locale: args.locale,
        data: args.data,
        idempotencyKey: `portal-appt-req:${args.templateKey}:${args.userId}:${args.data["requestId"] ?? ""}`,
      });
    } catch (err) {
      this.logger.warn(
        `Portal appointment notification best-effort başarısız: ${(err as Error).message}`,
      );
    }
  }
}
