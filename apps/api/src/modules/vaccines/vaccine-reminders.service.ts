/**
 * @file Vaccine reminder (aşı hatırlatma) service.
 * @module apps/api/modules/vaccines/vaccine-reminders.service
 *
 * @description GOAL-053 aşı hatırlatma iş kuralları. Uygulamanın
 * `nextDueDate`'i veya step'in `boosterIntervalDays`'i temelinde
 * hatırlatma planlar; tenant-bazlı, locale-bazlı mesaj, kullanıcı
 * iletişim izni, idempotent job, retry, delivery status, iptal
 * edilen uygulamaya mesaj göndermeme kuralları.
 *
 * İş kuralları:
 * - `scheduleForApplication`: aşı uygulaması oluşturulunca hook
 *   ile çağrılır. Default config: 7 gün önce + sms + in_app.
 *   `scheduledFor` gelecekte olmalı; geçmiş ise skip. Aynı
 *   (applicationId+channel+scheduledFor) idempotent. Owner
 *   marketing consent yoksa sms atlanır, in_app'e düşer.
 *   Audit `audit:vaccine.reminder.schedule`.
 * - `cancelForApplication`: uygulama iptal edilince hook. Tüm
 *   `status='scheduled'` kayıtlar `cancelled` olur. Audit
 *   `audit:vaccine.reminder.cancel`.
 * - `cancelForPatient`: hasta silindi/devredildi hook'u. Tüm
 *   `status='scheduled'` kayıtlar `cancelled` olur. Audit
 *   `audit:vaccine.reminder.cancel_patient`.
 * - `rescheduleForApplication`: uygulama `nextDueDate`
 *   amend edildiğinde hook. Delta hesabıyla scheduledFor
 *   kaydırılır; yeni zaman geçmişte ise `cancelled` yapılır.
 *   Audit `audit:vaccine.reminder.reschedule`.
 * - `processDueReminders`: now >= scheduledFor && status='scheduled'
 *   olanlar işlenir. NotificationService.send → status='sent',
 *   'failed' veya 'opted_out'. SYSTEM audit. Cross-tenant
 *   izolasyonu repo'da uygulanır.
 * - `listForPatient`: tenant-scoped listeleme; protokol /
 *   uygulama / status filtreleri.
 * - `getTenantConfig` / `updateTenantConfig`: tenant başına
 *   `daysBeforeDue` + `channels` override.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Cross-tenant erişim
 *   denemesi 404 ile maskelenir.
 *
 * @since GOAL-053 (FAZ-5) aşı hatırlatma core
 */

import { Injectable, Logger } from "@nestjs/common";

import { VaccineApplicationsService } from "./vaccine-applications.service.js";
import { VaccineRemindersRepository } from "./vaccine-reminders.repository.js";
import { VaccinesService } from "./vaccines.service.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { ConsentService } from "../../common/notifications/consent.service.js";
import {
  DEFAULT_VACCINE_REMINDER_CONFIG,
  computeScheduledFor,
  pickStepForApplication,
  toVaccineReminder,
  type VaccineReminder,
  type VaccineReminderConfig,
  type VaccineReminderRecord,
} from "../../common/vaccines/vaccine-reminder.types.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { OwnersService } from "../owners/owners.service.js";
import { PatientsService } from "../patients/patients.service.js";
import { TenantService } from "../tenant/tenant.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  NotificationChannel,
  Owner,
  Patient,
  VaccineApplication,
  VaccineProtocol,
  VaccineReminderChannel,
  VaccineReminderListQuery,
} from "@vetniva/contracts";

/** ProcessDueReminders tek seferde işleyeceği üst sınır. */
const DUE_BATCH_SIZE = 100;

@Injectable()
export class VaccineRemindersService {
  private readonly logger = new Logger(VaccineRemindersService.name);

  public constructor(
    private readonly repo: VaccineRemindersRepository,
    private readonly notifications: NotificationsService,
    private readonly consent: ConsentService,
    private readonly owners: OwnersService,
    private readonly patients: PatientsService,
    private readonly tenants: TenantService,
    private readonly vaccines: VaccinesService,
    private readonly applications: VaccineApplicationsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // scheduleForApplication — VaccineApplicationsService.create hook
  // -------------------------------------------------------------------------

  /**
   * Aşı uygulaması için default config ile hatırlatma planlar.
   * Uygulamanın `nextDueDate`'i veya step'in
   * `boosterIntervalDays`'i ile scheduledFor hesaplanır.
   * Geçmişe düşüyorsa planlama yapılmaz.
   *
   * @returns Oluşturulan (veya mevcut) reminder id'leri; skip
   *   durumunda boş dizi.
   */
  public async scheduleForApplication(
    tenantId: string,
    application: VaccineApplication,
    actor: ActorContext,
  ): Promise<string[]> {
    // 1) Patient + owner doğrula (cross-tenant → 404).
    const patient = await this.patients.findById(
      tenantId,
      application.patientId,
      actor,
    );
    if (!patient) {
      this.logger.warn({
        msg: "vaccine_reminder.schedule.skip",
        reason: "patient_not_found",
        applicationId: application.id,
      });
      return [];
    }
    const owner = await this.owners.findById(tenantId, patient.ownerId, actor);
    if (!owner) {
      this.logger.warn({
        msg: "vaccine_reminder.schedule.skip",
        reason: "owner_not_found",
        applicationId: application.id,
      });
      return [];
    }

    // 2) Protocol + step çözümle (boosterIntervalDays source).
    const protocol = await this.vaccines.getProtocol(
      tenantId,
      application.protocolId,
      actor,
    );
    if (!protocol) {
      this.logger.warn({
        msg: "vaccine_reminder.schedule.skip",
        reason: "protocol_not_found",
        applicationId: application.id,
      });
      return [];
    }
    const step = pickStepForApplication(protocol, application.applicationDate);

    // 3) Config (tenant override > default).
    const config = await this.resolveConfig(tenantId);
    const scheduledFor = computeScheduledFor({
      application,
      step,
      daysBeforeDue: config.daysBeforeDue,
    });
    if (!scheduledFor) {
      this.logger.debug({
        msg: "vaccine_reminder.schedule.skip",
        reason: "no_due_date",
        applicationId: application.id,
      });
      return [];
    }
    if (new Date(scheduledFor).getTime() <= Date.now()) {
      this.logger.debug({
        msg: "vaccine_reminder.schedule.skip",
        reason: "past_scheduled_for",
        applicationId: application.id,
      });
      return [];
    }
    const nextDueDate =
      application.nextDueDate ?? this.computeDueDateFromStep(application, step);
    if (!nextDueDate) {
      this.logger.debug({
        msg: "vaccine_reminder.schedule.skip",
        reason: "no_next_due_date",
        applicationId: application.id,
      });
      return [];
    }

    // 4) Tenant locale.
    const locale = await this.resolveTenantLocale(tenantId, actor);

    // 5) Her kanal için hatırlatma planla. Owner marketing
    //    consent yoksa sms/email atlanır, in_app'e düşer.
    const createdIds: string[] = [];
    for (const channel of config.channels) {
      if (channel !== "in_app" && !owner.consents.marketing) {
        continue;
      }
      const id = await this.scheduleOne(
        tenantId,
        application,
        protocol,
        step,
        nextDueDate,
        channel,
        scheduledFor,
        locale,
        actor,
      );
      if (id) createdIds.push(id);
    }
    return createdIds;
  }

  /**
   * Tek bir hatırlatma kaydı ekler. Idempotent: aynı
   * (applicationId, channel, scheduledFor) için mevcut kayıt döner.
   * Snapshot application'ı processDueReminders sırasında
   * kullanılmak üzere saklanır.
   */
  private async scheduleOne(
    tenantId: string,
    application: VaccineApplication,
    protocol: VaccineProtocol,
    step: ReturnType<typeof pickStepForApplication>,
    nextDueDate: string,
    channel: VaccineReminderChannel,
    scheduledFor: string,
    locale: "tr-TR" | "en-GB",
    actor: ActorContext,
  ): Promise<string | null> {
    const dedupeKey = VaccineRemindersRepository.buildDedupeKey(
      application.id,
      channel,
      scheduledFor,
    );
    const id = this.repo.nextId(tenantId);
    const now = new Date().toISOString();
    const result = await this.repo.persist({
      id,
      tenantId,
      applicationId: application.id,
      patientId: application.patientId,
      protocolId: application.protocolId,
      channel,
      scheduledFor,
      nextDueDate,
      status: "scheduled",
      attempts: 0,
      lastError: null,
      sentAt: null,
      createdAt: now,
      dedupeKey,
      applicationSnapshot: { ...application },
      stepSnapshot: step,
    });
    if (!result.inserted) {
      // Idempotent: mevcut kayıt no-op.
      return result.existing.id;
    }
    await this.audit.recordSimple(
      "audit:vaccine.reminder.schedule",
      "vaccine_reminder",
      result.record.id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        applicationId: application.id,
        patientId: application.patientId,
        protocolId: protocol.id,
        protocolName: protocol.name,
        channel,
        scheduledFor,
        nextDueDate,
        locale,
        daysBeforeDue: (await this.resolveConfig(tenantId)).daysBeforeDue,
      },
    );
    return result.record.id;
  }

  // -------------------------------------------------------------------------
  // cancelForApplication — VaccineApplicationsService.cancel hook
  // -------------------------------------------------------------------------

  /**
   * Uygulama iptal edildiğinde planlanmış hatırlatmaları iptal
   * eder. Zaten gönderilmiş olanlara dokunmaz. Tenant scope
   * guard zorunludur.
   */
  public async cancelForApplication(
    tenantId: string,
    applicationId: string,
    actor: ActorContext,
  ): Promise<number> {
    this.requireTenantScope(actor, tenantId);
    const cancelled = await this.repo.persistedCancelForApplication(tenantId, applicationId);
    if (cancelled > 0) {
      await this.audit.recordSimple(
        "audit:vaccine.reminder.cancel",
        "vaccine_reminder",
        applicationId,
        "cancel",
        this.actorToAuditActor(actor),
        "info",
        { applicationId, cancelledCount: cancelled },
      );
    }
    return cancelled;
  }

  // -------------------------------------------------------------------------
  // cancelForPatient — PatientsService.delete/transfer hook
  // -------------------------------------------------------------------------

  /**
   * Hasta silindi/devredildiğinde tüm planlanmış hatırlatmaları
   * iptal eder. Tenant scope guard zorunludur.
   */
  public async cancelForPatient(
    tenantId: string,
    patientId: string,
    actor: ActorContext,
  ): Promise<number> {
    this.requireTenantScope(actor, tenantId);
    const cancelled = await this.repo.persistedCancelForPatient(tenantId, patientId);
    if (cancelled > 0) {
      await this.audit.recordSimple(
        "audit:vaccine.reminder.cancel_patient",
        "vaccine_reminder",
        patientId,
        "cancel",
        this.actorToAuditActor(actor),
        "info",
        { patientId, cancelledCount: cancelled },
      );
    }
    return cancelled;
  }

  // -------------------------------------------------------------------------
  // rescheduleForApplication — VaccineApplicationsService.amend hook
  // -------------------------------------------------------------------------

  /**
   * Uygulamanın `nextDueDate`'i amend edildiğinde hatırlatmaları
   * yeni tarihe taşır. Geçmişe kayan hatırlatmalar iptal edilir.
   * Tenant scope guard zorunludur.
   */
  public async rescheduleForApplication(
    tenantId: string,
    applicationId: string,
    newNextDueDate: string,
    actor: ActorContext,
  ): Promise<number> {
    this.requireTenantScope(actor, tenantId);
    const moved = await this.repo.persistedRescheduleForApplication({
      tenantId,
      applicationId,
      newNextDueDate,
    });
    if (moved > 0) {
      await this.audit.recordSimple(
        "audit:vaccine.reminder.reschedule",
        "vaccine_reminder",
        applicationId,
        "update",
        this.actorToAuditActor(actor),
        "info",
        { applicationId, newNextDueDate, movedCount: moved },
      );
    }
    return moved;
  }

  // -------------------------------------------------------------------------
  // processDueReminders — worker / cron job çağrısı
  // -------------------------------------------------------------------------

  /**
   * Zamanı gelmiş `scheduled` hatırlatmaları işler. Her biri
   * için tenant/owner/patient/template çözümlenir,
   * NotificationsService.send çağrılır. Sonuca göre status
   * güncellenir.
   */
  public async processDueReminders(now: number = Date.now()): Promise<{
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
  }> {
    const due = await this.repo.persistedDue(now, DUE_BATCH_SIZE);
    if (due.length === 0) {
      return { processed: 0, sent: 0, failed: 0, skipped: 0 };
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const rec of due) {
      const systemActor = this.systemActor(rec.tenantId);

      // 1) Snapshot'tan uygulama durumunu kontrol et.
      const app = rec.applicationSnapshot;
      if (!app) {
        await this.repo.persistedUpdate(rec.tenantId, rec.id, {
          attempts: rec.attempts + 1,
          lastError: "missing_snapshot",
        });
        skipped += 1;
        continue;
      }
      if (app.status === "cancelled" || app.status === "amended") {
        // İptal/amend edilmiş uygulamaya hatırlatma gitmez.
        await this.repo.persistedUpdate(rec.tenantId, rec.id, {
          status: "cancelled",
          lastError: `application_status_${app.status}`,
        });
        skipped += 1;
        continue;
      }

      // 2) Patient + owner.
      const patient: Patient | null = await this.patients.findById(
        rec.tenantId,
        app.patientId,
        systemActor,
      );
      if (!patient) {
        await this.repo.persistedUpdate(rec.tenantId, rec.id, {
          status: "failed",
          lastError: "patient_not_found",
          attempts: rec.attempts + 1,
        });
        failed += 1;
        continue;
      }
      const owner: Owner | null = await this.owners.findById(
        rec.tenantId,
        patient.ownerId,
        systemActor,
      );
      if (!owner) {
        await this.repo.persistedUpdate(rec.tenantId, rec.id, {
          status: "failed",
          lastError: "owner_not_found",
          attempts: rec.attempts + 1,
        });
        failed += 1;
        continue;
      }
      const locale = await this.resolveTenantLocale(rec.tenantId, systemActor);

      // 3) Consent kontrolü: vaccine_reminder category.
      const notifChannel: NotificationChannel =
        rec.channel === "in_app" ? "in_app" : rec.channel;
      if (!this.consent.canSend(owner.id, notifChannel, "vaccine_reminder")) {
        await this.repo.persistedUpdate(rec.tenantId, rec.id, {
          status: "cancelled",
          lastError: "opted_out",
          attempts: rec.attempts + 1,
        });
        skipped += 1;
        continue;
      }

      // 4) Template data hazırla.
      const data = this.buildTemplateData({
        app,
        patientName: patient.name,
        owner,
        protocolName:
          (
            await this.vaccines.getProtocol(
              rec.tenantId,
              app.protocolId,
              systemActor,
            )
          )?.name ?? "",
        locale,
      });
      const idempotencyKey = `vacc-reminder|${rec.id}`;

      // 5) NotificationsService.send.
      try {
        const notification = await this.notifications.send(
          {
            tenantId: rec.tenantId,
            userId: owner.id,
            channel: notifChannel,
            category: "vaccine_reminder",
            templateKey: "vaccine_reminder",
            locale,
            data,
            idempotencyKey,
          },
          systemActor,
        );
        if (notification.status === "sent") {
          await this.repo.persistedUpdate(rec.tenantId, rec.id, {
            status: "sent",
            attempts: rec.attempts + 1,
            sentAt: notification.sentAt ?? new Date().toISOString(),
            lastError: null,
          });
          sent += 1;
        } else if (notification.status === "failed") {
          await this.repo.persistedUpdate(rec.tenantId, rec.id, {
            status: "failed",
            attempts: rec.attempts + 1,
            lastError: notification.lastError ?? "send_failed",
          });
          failed += 1;
        } else if (notification.status === "opted_out") {
          await this.repo.persistedUpdate(rec.tenantId, rec.id, {
            status: "cancelled",
            attempts: rec.attempts + 1,
            lastError: "opted_out",
          });
          skipped += 1;
        } else {
          // queued / sending → schedule'a bırak (job tekrar çalışacak).
          await this.repo.persistedUpdate(rec.tenantId, rec.id, {
            attempts: rec.attempts + 1,
            lastError: `notification_${notification.status}`,
          });
          skipped += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.repo.persistedUpdate(rec.tenantId, rec.id, {
          status: "failed",
          attempts: rec.attempts + 1,
          lastError: message,
        });
        failed += 1;
      }
    }

    await this.audit.record({
      eventName: "audit:vaccine.reminder.process_due",
      tenantId: "system",
      branchId: null,
      actorId: "system",
      actorType: "system",
      targetType: "vaccine_reminder",
      targetId: "batch",
      action: "send",
      correlationId: "system-job",
      country: "TR",
      severity: failed > 0 ? "warning" : "info",
      metadata: {
        processed: due.length,
        sent,
        failed,
        skipped,
        at: new Date(now).toISOString(),
      },
    });

    return { processed: due.length, sent, failed, skipped };
  }

  // -------------------------------------------------------------------------
  // listForPatient — controller
  // -------------------------------------------------------------------------

  /**
   * Bir hastaya ait hatırlatmaları tenant-scoped listeler.
   */
  public async listForPatient(
    tenantId: string,
    patientId: string,
    query: VaccineReminderListQuery,
    actor: ActorContext,
  ): Promise<{ items: VaccineReminder[]; total: number }> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.persistedListForPatient(
      tenantId,
      patientId,
      {
        ...(query.protocolId ? { protocolId: query.protocolId } : {}),
        ...(query.applicationId ? { applicationId: query.applicationId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      query.limit,
      query.offset,
    );
    return {
      items: result.items.map((r) => toVaccineReminder(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // Tenant config
  // -------------------------------------------------------------------------

  /**
   * Tenant config'ini getirir. Kayıt yoksa default config döner.
   * Tenant scope guard zorunludur.
   */
  public async getTenantConfig(
    tenantId: string,
    actor: ActorContext,
  ): Promise<VaccineReminderConfig> {
    this.requireTenantScope(actor, tenantId);
    return this.resolveConfig(tenantId);
  }

  /**
   * Tenant config'ini günceller. Boş kanal listesi kabul edilmez.
   * Audit `audit:vaccine.reminder.config.update` (info).
   */
  public async updateTenantConfig(
    tenantId: string,
    input: { daysBeforeDue: number; channels: VaccineReminderChannel[] },
    actor: ActorContext,
  ): Promise<VaccineReminderConfig> {
    this.requireTenantScope(actor, tenantId);
    if (input.daysBeforeDue < 1 || input.daysBeforeDue > 90) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0010",
        message: "daysBeforeDue 1-90 arasında olmalı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0010",
        details: { daysBeforeDue: input.daysBeforeDue },
      });
    }
    if (input.channels.length === 0 || input.channels.length > 3) {
      throw new DomainError({
        errorCode: "VET-VALIDATION-0010",
        message: "Kanal listesi 1-3 arasında olmalı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-VALIDATION-0010",
        details: { channelsLength: input.channels.length },
      });
    }
    const now = new Date().toISOString();
    await this.repo.persistedUpsertTenantConfig({
      tenantId,
      daysBeforeDue: input.daysBeforeDue,
      channels: input.channels,
      updatedAt: now,
    });
    await this.audit.recordSimple(
      "audit:vaccine.reminder.config.update",
      "vaccine_reminder_config",
      tenantId,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        daysBeforeDue: input.daysBeforeDue,
        channels: input.channels,
      },
    );
    return this.resolveConfig(tenantId);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Tenant config'ini çözer. Override varsa onu, yoksa default'u
   * döner.
   */
  private async resolveConfig(tenantId: string): Promise<VaccineReminderConfig> {
    const cfg = await this.repo.persistedGetTenantConfig(tenantId);
    if (cfg) {
      return {
        daysBeforeDue: cfg.daysBeforeDue,
        channels: [...cfg.channels],
      };
    }
    return {
      ...DEFAULT_VACCINE_REMINDER_CONFIG,
      channels: [...DEFAULT_VACCINE_REMINDER_CONFIG.channels],
    };
  }

  /**
   * step.boostIntervalDays + applicationDate'den nextDueDate
   * hesaplar (YYYY-MM-DD). nextDueDate yoksa buradan türetilir.
   */
  private computeDueDateFromStep(
    application: VaccineApplication,
    step: ReturnType<typeof pickStepForApplication>,
  ): string | null {
    if (!step || step.boosterIntervalDays === undefined) return null;
    const baseMs = new Date(application.applicationDate).getTime();
    if (Number.isNaN(baseMs)) return null;
    const dueMs = baseMs + step.boosterIntervalDays * 86_400_000;
    return new Date(dueMs).toISOString().slice(0, 10);
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

  private systemActor(tenantId: string): ActorContext {
    return {
      actorId: "system-reminder-job",
      actorType: "system",
      role: "STAFF",
      tenantId,
      branchId: null,
      isSuperadmin: false,
      correlationId: "system-job",
      ipAddress: null,
      userAgentHash: null,
      source: "system",
    };
  }

  private async resolveTenantLocale(
    tenantId: string,
    actor: ActorContext,
  ): Promise<"tr-TR" | "en-GB"> {
    try {
      const t = await this.tenants.findById(tenantId, actor);
      if (t && (t.defaultLocale === "tr-TR" || t.defaultLocale === "en-GB")) {
        return t.defaultLocale;
      }
    } catch {
      // tenant.service.findById hata fırlatırsa default'a düş.
    }
    return "tr-TR";
  }

  private buildTemplateData(args: {
    app: VaccineApplication;
    patientName: string;
    owner: { firstName: string; lastName: string };
    protocolName: string;
    locale: "tr-TR" | "en-GB";
  }): Record<string, unknown> {
    const { app, patientName, owner, protocolName, locale } = args;
    const dueDate = new Date(`${app.nextDueDate ?? ""}T00:00:00.000Z`);
    const dateStr = Number.isNaN(dueDate.getTime())
      ? ""
      : dueDate.toLocaleDateString(locale === "tr-TR" ? "tr-TR" : "en-GB", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
    const ownerName =
      `${owner.firstName} ${owner.lastName}`.trim() ||
      (locale === "tr-TR" ? "Sayın Hasta Sahibi" : "Dear Owner");
    return {
      ownerName,
      petName: patientName || (locale === "tr-TR" ? "Hayvanınız" : "Your pet"),
      protocolName: protocolName || (locale === "tr-TR" ? "Aşı" : "Vaccine"),
      date: dateStr,
      nextDueDate: app.nextDueDate ?? "",
      applicationId: app.id,
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

/** Internal export: re-export helpers to keep test surface stable. */
export const __vaccineReminderHelpers = {
  toVaccineReminder,
  computeScheduledFor,
  pickStepForApplication,
  DEFAULT_VACCINE_REMINDER_CONFIG,
};

/** Re-export internal record tipi (test + dış modüller için). */
export type { VaccineReminderRecord };
