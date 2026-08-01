/**
 * @file Waitlist service.
 * @module apps/api/modules/waitlist/waitlist.service
 *
 * @description GOAL-032 bekleme listesi ve resepsiyon akışı iş
 * kuralları. Resepsiyon sırasında hasta için uygun bir randevu
 * slot'u bulunamadığında oluşturulan "sıra kaydı"; slot açıldığında
 * `convertToAppointment` ile randevuya dönüştürülür.
 *
 * İş kuralları:
 * - `add`: Patient aynı tenant'ta mı (cross-tenant → 404
 *   VET-CLINIC-0001); `expiresAt` verilmezse now+30 gün
 *   (WAITLIST_DEFAULT_TTL_DAYS); `status=waiting`. Audit
 *   `audit:waitlist.add` (info).
 * - `list`: tenant-scoped; status/priority/patientId/from/to
 *   filtreleri; emergency > urgent > normal, sonra createdAt asc.
 * - `notify`: status=notified, notifiedAt=now. NotificationService
 *   entegrasyonu stub (FAZ-0'da no-op; Faz 10+'da gerçek SMS/email).
 *   Audit `audit:waitlist.notify` (info).
 * - `convertToAppointment`: status=scheduled, scheduledAppointmentId
 *   set. Audit `audit:waitlist.schedule` (info).
 * - `cancel`: status=cancelled. Audit `audit:waitlist.cancel` (warning).
 * - `expireOverdue`: periyodik çağrı (FAZ-0'da manuel, FAZ-3+'da
 *   cron); status=waiting && expiresAt<now → status=expired. Dönen
 *   sayı kaç kayıt expire edildiğini gösterir.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez.
 *
 * @since GOAL-032 (FAZ-3) bekleme listesi core
 */

import { Injectable, Logger } from "@nestjs/common";

import {
  type WaitlistEntryRecord,
  WaitlistRepository,
} from "./waitlist.repository.js";
import { WAITLIST_DEFAULT_TTL_DAYS } from "./waitlist.types.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { PatientsService } from "../patients/patients.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  WaitlistEntry,
  WaitlistEntryCreate,
  WaitlistFilters,
} from "@vetniva/contracts";

/** Öncelik sıralaması (emergency > urgent > normal). */
const PRIORITY_RANK: Readonly<Record<string, number>> = {
  emergency: 0,
  urgent: 1,
  normal: 2,
};

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  public constructor(
    private readonly repo: WaitlistRepository,
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // add
  // -------------------------------------------------------------------------

  public async add(
    tenantId: string,
    input: WaitlistEntryCreate,
    actor: ActorContext,
  ): Promise<WaitlistEntry> {
    this.requireTenantScope(actor, tenantId);

    // 1) Patient aynı tenant'ta mı (cross-tenant → 404).
    const patient = await this.patients.findById(
      tenantId,
      input.patientId,
      actor,
    );
    if (!patient) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hayvan bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
        details: { patientId: input.patientId },
      });
    }

    const now = new Date();
    const expiresAt =
      input.expiresAt ??
      new Date(
        now.getTime() + WAITLIST_DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

    const id = this.repo.nextId(tenantId);
    const record = this.repo.toRecord({
      id,
      tenantId,
      patientId: patient.id,
      ownerId: patient.ownerId,
      status: "waiting",
      preferredDate: input.preferredDate ?? null,
      preferredVeterinarianId: input.preferredVeterinarianId ?? null,
      reason: input.reason,
      priority: input.priority,
      createdAt: now.toISOString(),
      notifiedAt: null,
      scheduledAppointmentId: null,
      expiresAt,
    });
    this.repo.insert(record);

    await this.audit.recordSimple(
      "audit:waitlist.add",
      "waitlist_entry",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        patientId: record.patientId,
        ownerId: record.ownerId,
        priority: record.priority,
        preferredDate: record.preferredDate,
        preferredVeterinarianId: record.preferredVeterinarianId,
        expiresAt: record.expiresAt,
      },
    );

    return this.toWaitlistEntry(record);
  }

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  public async findById(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<WaitlistEntry | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, id);
    return rec ? this.toWaitlistEntry(rec) : null;
  }

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  public async list(
    tenantId: string,
    filters: WaitlistFilters,
    actor: ActorContext,
  ): Promise<{ items: WaitlistEntry[]; total: number }> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, filters);
    const items = [...result.items].sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 99;
      const pb = PRIORITY_RANK[b.priority] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.createdAt.localeCompare(b.createdAt);
    });
    return {
      items: items.map((r) => this.toWaitlistEntry(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // notify
  // -------------------------------------------------------------------------

  public async notify(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<void> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Bekleme listesi kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    if (existing.status === "scheduled" || existing.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-CLINIC-0006",
        message:
          "Planlanmış veya iptal edilmiş bekleme listesi kaydı bildirilemez",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0006",
        details: { id, status: existing.status },
      });
    }

    const now = new Date().toISOString();
    // Repository `update` referansı mutate eder; audit'te kullanılacak
    // status snapshot'ı update'ten ÖNCE alınmalı.
    const previousStatus = existing.status;
    this.repo.update(tenantId, id, {
      status: "notified",
      notifiedAt: now,
    });

    // NotificationService stub (FAZ-0 no-op). Faz 10+'da gerçek
    // SMS/email kanalı üzerinden owner'a bildirim gider.
    // Hata durumunda akış durmaz — audit.info event'i yeterli iz
    // bırakır; gerçek provider eklenince retry/backoff eklenir.
    try {
      await this.notifications.send({
        tenantId,
        userId: existing.ownerId,
        channel: "in_app",
        category: "custom",
        templateKey: "waitlist.notify",
        locale: "tr-TR",
        data: {
          waitlistId: id,
          patientId: existing.patientId,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Waitlist notify notification best-effort başarısız: ${(err as Error).message}`,
      );
    }

    await this.audit.recordSimple(
      "audit:waitlist.notify",
      "waitlist_entry",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        patientId: existing.patientId,
        ownerId: existing.ownerId,
        notifiedAt: now,
        previousStatus,
      },
    );
  }

  // -------------------------------------------------------------------------
  // convertToAppointment
  // -------------------------------------------------------------------------

  public async convertToAppointment(
    tenantId: string,
    id: string,
    appointmentId: string,
    actor: ActorContext,
  ): Promise<void> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Bekleme listesi kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    if (existing.status === "scheduled") {
      // Idempotent: aynı appointmentId ile tekrar çağrı.
      if (existing.scheduledAppointmentId === appointmentId) return;
      throw new DomainError({
        errorCode: "VET-CLINIC-0006",
        message: "Bekleme listesi kaydı zaten başka bir randevuya atanmış",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0006",
        details: {
          id,
          currentAppointmentId: existing.scheduledAppointmentId,
          newAppointmentId: appointmentId,
        },
      });
    }
    if (existing.status === "cancelled" || existing.status === "expired") {
      throw new DomainError({
        errorCode: "VET-CLINIC-0006",
        message: "İptal/süresi dolmuş kayıt randevuya dönüştürülemez",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0006",
        details: { id, status: existing.status },
      });
    }

    // Repository `update` referansı mutate eder; audit snapshot'ı
    // update'ten ÖNCE alınmalı.
    const previousStatus = existing.status;
    this.repo.update(tenantId, id, {
      status: "scheduled",
      scheduledAppointmentId: appointmentId,
    });

    await this.audit.recordSimple(
      "audit:waitlist.schedule",
      "waitlist_entry",
      id,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        patientId: existing.patientId,
        ownerId: existing.ownerId,
        appointmentId,
        previousStatus,
      },
    );
  }

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  public async cancel(
    tenantId: string,
    id: string,
    reason: string,
    actor: ActorContext,
  ): Promise<void> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Bekleme listesi kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    if (existing.status === "cancelled") {
      // Idempotent.
      return;
    }
    if (existing.status === "scheduled" || existing.status === "expired") {
      throw new DomainError({
        errorCode: "VET-CLINIC-0006",
        message: "Planlanmış/süresi dolmuş kayıt iptal edilemez",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0006",
        details: { id, status: existing.status },
      });
    }

    // Repository `update` referansı mutate eder; audit snapshot'ı
    // update'ten ÖNCE alınmalı.
    const previousStatus = existing.status;
    this.repo.update(tenantId, id, { status: "cancelled" });

    await this.audit.recordSimple(
      "audit:waitlist.cancel",
      "waitlist_entry",
      id,
      "cancel",
      this.actorToAuditActor(actor),
      "warning",
      {
        patientId: existing.patientId,
        ownerId: existing.ownerId,
        reason,
        previousStatus,
      },
    );
  }

  // -------------------------------------------------------------------------
  // expireOverdue
  // -------------------------------------------------------------------------

  /**
   * Süresi dolmuş waiting kayıtlarını expired yapar. Periyodik
   * çağrı için tasarlandı; FAZ-0'da manuel, FAZ-3+'da cron. Dönen
   * değer expire edilen kayıt sayısıdır.
   */
  public async expireOverdue(): Promise<number> {
    const now = new Date();
    const overdue = this.repo.findOverdueAll(now);
    if (overdue.length === 0) return 0;

    for (const rec of overdue) {
      this.repo.update(rec.tenantId, rec.id, { status: "expired" });
      // SYSTEM event; actor bağlamı yok.
      await this.audit.record({
        eventName: "audit:waitlist.expire",
        tenantId: rec.tenantId,
        branchId: null,
        actorId: null,
        actorType: "system",
        targetType: "waitlist_entry",
        targetId: rec.id,
        action: "update",
        correlationId: `job-expire-${now.toISOString()}`,
        country: "TR",
        severity: "info",
        before: { status: "waiting", expiresAt: rec.expiresAt },
        after: { status: "expired" },
        metadata: { patientId: rec.patientId, ownerId: rec.ownerId },
      });
    }
    return overdue.length;
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

  private toWaitlistEntry(rec: WaitlistEntryRecord): WaitlistEntry {
    return {
      id: rec.id,
      tenantId: rec.tenantId,
      patientId: rec.patientId,
      ownerId: rec.ownerId,
      status: rec.status,
      preferredDate: rec.preferredDate,
      preferredVeterinarianId: rec.preferredVeterinarianId,
      reason: rec.reason,
      priority: rec.priority,
      createdAt: rec.createdAt,
      notifiedAt: rec.notifiedAt,
      scheduledAppointmentId: rec.scheduledAppointmentId,
      expiresAt: rec.expiresAt,
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
      actorType: actor.actorType,
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }
}
