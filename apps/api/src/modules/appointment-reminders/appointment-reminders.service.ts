/**
 * @file Appointment reminder service.
 * @module apps/api/modules/appointment-reminders/appointment-reminders.service
 * @description GOAL-036 randevu hatırlatma iş kuralları. Queue
 * tabanlı zamanlama; tenant-bazlı, locale-bazlı mesaj, kullanıcı
 * iletişim izni, idempotent job, retry, delivery status, iptal
 * edilen randevuya mesaj göndermeme kuralları.
 *
 * İş kuralları:
 * - `scheduleForAppointment`: Randevu oluşturulunca hook ile çağrılır.
 *   Default config: 24 saat önce + sms + in_app. `scheduledFor`
 *   gelecekte olmalı; geçmiş ise skip. Aynı (appointmentId+channel+
 *   scheduledFor) idempotent. Owner marketing consent yoksa
 *   channel='in_app' fallback. Audit `audit:appointment_reminder.schedule`.
 * - `cancelForAppointment`: Randevu iptal edilince hook. Tüm
 *   `status='scheduled'` kayıtlar `cancelled` olur. Audit
 *   `audit:appointment_reminder.cancel`.
 * - `rescheduleForAppointment`: Randevu güncellenince hook. Delta
 *   hesabıyla scheduledFor kaydırılır; yeni zaman geçmişte ise
 *   `cancelled` yapılır. Audit `audit:appointment_reminder.reschedule`.
 * - `processDueReminders`: now >= scheduledFor && status='scheduled'
 *   olanlar işlenir. NotificationService.send → status='sent' veya
 *   'failed'. SYSTEM audit. Cross-tenant izolasyonu repo'da uygulanır.
 * - `listForAppointment`: tenant-scoped listeleme.
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Cross-tenant erişim denemesi
 *   404 ile maskelenir.
 * @since GOAL-036 (FAZ-3) randevu hatırlatma core
 */

import { Injectable, Logger } from "@nestjs/common";

import {
  AppointmentRemindersRepository,
  type AppointmentReminderRecord,
} from "./appointment-reminders.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { ConsentService } from "../../common/notifications/consent.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { OwnersService } from "../owners/owners.service.js";
import { PatientsService } from "../patients/patients.service.js";
import { TenantService } from "../tenant/tenant.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { Owner } from "../../common/owners/owner.types.js";
import type { Patient } from "../../common/patients/patient.types.js";
import type {
  Appointment,
  NotificationChannel,
  ReminderChannel,
  ReminderListQuery,
  ReminderStatus,
} from "@vetniva/contracts";

/** Default hatırlatma config (tenant override etmediği sürece). */
const DEFAULT_HOURS_BEFORE = 24;
const DEFAULT_CHANNELS: ReminderChannel[] = ["sms", "in_app"];

/** ProcessDueReminders tek seferde işleyeceği üst sınır. */
const DUE_BATCH_SIZE = 100;

export interface ScheduledReminder {
  id: string;
  tenantId: string;
  appointmentId: string;
  channel: ReminderChannel;
  scheduledFor: string;
  status: ReminderStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

@Injectable()
export class AppointmentRemindersService {
  private readonly logger = new Logger(AppointmentRemindersService.name);

  public constructor(
    private readonly repo: AppointmentRemindersRepository,
    private readonly notifications: NotificationsService,
    private readonly consent: ConsentService,
    private readonly owners: OwnersService,
    private readonly patients: PatientsService,
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // scheduleForAppointment — AppointmentsService.create hook
  // -------------------------------------------------------------------------

  /**
   * Randevu için default config ile hatırlatma planlar. Randevu
   * zaten planlanmışsa idempotent no-op. Randevu başlangıcı
   * defaultHours'tan daha yakınsa planlama yapılmaz.
   * @param tenantId
   * @param appointment
   * @param actor
   * @returns Oluşturulan (veya mevcut) reminder id; skip durumunda null.
   */
  public async scheduleForAppointment(
    tenantId: string,
    appointment: Appointment,
    actor: ActorContext,
  ): Promise<string | null> {
    const startMs = new Date(appointment.start).getTime();
    if (Number.isNaN(startMs)) {
      this.logger.warn({
        msg: "appointment_reminder.schedule.skip",
        reason: "invalid_start",
        appointmentId: appointment.id,
      });
      return null;
    }
    const scheduledForMs = startMs - DEFAULT_HOURS_BEFORE * 3600_000;
    if (scheduledForMs <= Date.now()) {
      // Start çok yakın → hatırlatma anlamsız.
      this.logger.debug({
        msg: "appointment_reminder.schedule.skip",
        reason: "past_scheduled_for",
        appointmentId: appointment.id,
      });
      return null;
    }
    const scheduledFor = new Date(scheduledForMs).toISOString();

    // Patient → owner → tenant locale resolve.
    const patient = await this.patients.findById(
      tenantId,
      appointment.patientId,
      actor,
    );
    if (!patient) {
      this.logger.warn({
        msg: "appointment_reminder.schedule.skip",
        reason: "patient_not_found",
        appointmentId: appointment.id,
      });
      return null;
    }
    const owner = await this.owners.findById(tenantId, patient.ownerId, actor);
    if (!owner) {
      this.logger.warn({
        msg: "appointment_reminder.schedule.skip",
        reason: "owner_not_found",
        appointmentId: appointment.id,
      });
      return null;
    }
    const locale = await this.resolveTenantLocale(tenantId, actor);
    const userId = owner.id;

    let createdId: string | null = null;
    for (const channel of DEFAULT_CHANNELS) {
      // Marketing consent yalnızca sms/email için zorunlu; in_app
      // her zaman için (tenant içi bildirim). Owner consent yoksa
      // sms atlanır, in_app'e düşülür.
      if (channel !== "in_app" && !owner.consents.marketing) {
        continue;
      }
      const id = await this.scheduleOne(
        tenantId,
        appointment,
        userId,
        channel,
        scheduledFor,
        locale,
        actor,
      );
      if (id && !createdId) createdId = id;
    }
    return createdId;
  }

  /**
   * Tek bir hatırlatma kaydı ekler. Idempotent: aynı
   * (appointmentId, channel, scheduledFor) için mevcut kayıt döner.
   * Snapshot appointment'ı processDueReminders sırasında
   * kullanılmak üzere saklanır.
   * @param tenantId
   * @param appointment
   * @param userId
   * @param channel
   * @param scheduledFor
   * @param locale
   * @param actor
   */
  private async scheduleOne(
    tenantId: string,
    appointment: Appointment,
    userId: string,
    channel: ReminderChannel,
    scheduledFor: string,
    locale: "tr-TR" | "en-GB",
    actor: ActorContext,
  ): Promise<string | null> {
    const dedupeKey = AppointmentRemindersRepository.buildDedupeKey(
      appointment.id,
      channel,
      scheduledFor,
    );
    const id = this.repo.nextId(tenantId);
    const now = new Date().toISOString();
    const result = this.repo.insert({
      id,
      tenantId,
      appointmentId: appointment.id,
      channel,
      scheduledFor,
      status: "scheduled",
      attempts: 0,
      lastError: null,
      sentAt: null,
      createdAt: now,
      dedupeKey,
      snapshot: { ...appointment },
    });
    if (!result.inserted) {
      // Idempotent: mevcut kayıt no-op.
      return result.existing.id;
    }
    await this.audit.record({
      eventName: "audit:appointment_reminder.schedule",
      tenantId,
      branchId: actor.branchId ?? null,
      actorId: actor.actorId,
      actorType: actor.actorType,
      targetType: "appointment_reminder",
      targetId: result.record.id,
      action: "create",
      correlationId: actor.correlationId,
      country: "TR",
      severity: "info",
      metadata: {
        appointmentId: appointment.id,
        patientId: appointment.patientId,
        channel,
        scheduledFor,
        userId,
        locale,
      },
    });
    return result.record.id;
  }

  // -------------------------------------------------------------------------
  // cancelForAppointment — AppointmentsService.cancel hook
  // -------------------------------------------------------------------------

  /**
   * Randevu iptal edildiğinde planlanmış hatırlatmaları iptal eder.
   * Zaten gönderilmiş olanlara dokunmaz. Tenant scope guard
   * zorunludur — actor farklı tenant'tan geliyorsa 403.
   * @param tenantId
   * @param appointmentId
   * @param actor
   */
  public async cancelForAppointment(
    tenantId: string,
    appointmentId: string,
    actor: ActorContext,
  ): Promise<number> {
    this.requireTenantScope(actor, tenantId);
    const cancelled = this.repo.cancelForAppointment(tenantId, appointmentId);
    if (cancelled > 0) {
      await this.audit.record({
        eventName: "audit:appointment_reminder.cancel",
        tenantId,
        branchId: actor.branchId ?? null,
        actorId: actor.actorId,
        actorType: actor.actorType,
        targetType: "appointment_reminder",
        targetId: appointmentId,
        action: "cancel",
        correlationId: actor.correlationId,
        country: "TR",
        severity: "info",
        metadata: { appointmentId, cancelledCount: cancelled },
      });
    }
    return cancelled;
  }

  // -------------------------------------------------------------------------
  // rescheduleForAppointment — AppointmentsService.update hook
  // -------------------------------------------------------------------------

  /**
   * Randevu zamanı değiştiğinde hatırlatmaları yeni zamana taşır.
   * Geçmişe kayan hatırlatmalar iptal edilir. Tenant scope guard
   * zorunludur.
   * @param tenantId
   * @param appointmentId
   * @param oldStartIso
   * @param newStartIso
   * @param newEndIso
   * @param actor
   * @returns Taşınan/kaydırılan kayıt sayısı.
   */
  public async rescheduleForAppointment(
    tenantId: string,
    appointmentId: string,
    oldStartIso: string,
    newStartIso: string,
    newEndIso: string,
    actor: ActorContext,
  ): Promise<number> {
    this.requireTenantScope(actor, tenantId);
    const oldMs = new Date(oldStartIso).getTime();
    const newMs = new Date(newStartIso).getTime();
    if (Number.isNaN(oldMs) || Number.isNaN(newMs) || oldMs === newMs) {
      return 0;
    }
    const deltaMs = newMs - oldMs;
    const moved = this.repo.rescheduleForAppointment(
      tenantId,
      appointmentId,
      deltaMs,
      newStartIso,
      newEndIso,
    );
    if (moved > 0) {
      await this.audit.record({
        eventName: "audit:appointment_reminder.reschedule",
        tenantId,
        branchId: actor.branchId ?? null,
        actorId: actor.actorId,
        actorType: actor.actorType,
        targetType: "appointment_reminder",
        targetId: appointmentId,
        action: "update",
        correlationId: actor.correlationId,
        country: "TR",
        severity: "info",
        metadata: { appointmentId, deltaMs, movedCount: moved },
      });
    }
    return moved;
  }

  // -------------------------------------------------------------------------
  // processDueReminders — worker / cron job çağrısı
  // -------------------------------------------------------------------------

  /**
   * Zamanı gelmiş `scheduled` hatırlatmaları işler. Her biri için
   * tenant/owner/patient/template çözümlenir, NotificationsService.send
   * çağrılır. Sonuca göre status güncellenir.
   * @param now
   * @returns İşlenen kayıt sayısı + (sent, failed, retried) breakdown.
   */
  public async processDueReminders(now: number = Date.now()): Promise<{
    processed: number;
    sent: number;
    failed: number;
    skipped: number;
  }> {
    const due = this.repo.listDue(now, DUE_BATCH_SIZE);
    if (due.length === 0) {
      return { processed: 0, sent: 0, failed: 0, skipped: 0 };
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const rec of due) {
      // Randevu durumu kontrolü: randevu iptal/tamamlanma hook'ları
      // (AppointmentsService.cancel → cancelForAppointment,
      //  AppointmentsService.complete → cancelForAppointment) bu
      //  reminder'ı zaten 'cancelled' yapar. listDue() yalnızca
      //  status='scheduled' olanları döndürür. Bu yüzden burada
      //  appointment'ı yeniden okumaya gerek yok; circular import
      //  riski de bu sayede yoktur.
      const systemActor = this.systemActor(rec.tenantId);

      // 1) snapshot alanı: scheduleForAppointment sırasında
      //    repository'ye kopyalanır (patientId, status, type,
      //    start). İleride appointment detayı değişirse
      //    (reschedule hook'u tetiklenmediyse) bu snapshot
      //    kullanılır; cross-tenant bilgi sızdırmaz çünkü
      //    rec.tenantId altında izole.
      const appt: Appointment | null = rec.snapshot ?? null;
      if (!appt) {
        // Snapshot yoksa process edilemez → skip (defensive).
        this.repo.update(rec.tenantId, rec.id, {
          attempts: rec.attempts + 1,
          lastError: "missing_snapshot",
        });
        skipped += 1;
        continue;
      }
      if (
        appt.status === "cancelled" ||
        appt.status === "completed" ||
        appt.status === "no_show"
      ) {
        // İptal/tamamlanmış randevuya hatırlatma gitmez.
        this.repo.update(rec.tenantId, rec.id, {
          status: "cancelled",
          lastError: `appointment_status_${appt.status}`,
        });
        skipped += 1;
        continue;
      }

      const patient: Patient | null = await this.patients.findById(
        rec.tenantId,
        appt.patientId,
        systemActor,
      );
      if (!patient) {
        this.repo.update(rec.tenantId, rec.id, {
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
        this.repo.update(rec.tenantId, rec.id, {
          status: "failed",
          lastError: "owner_not_found",
          attempts: rec.attempts + 1,
        });
        failed += 1;
        continue;
      }
      const locale = await this.resolveTenantLocale(rec.tenantId, systemActor);

      // 3) Consent kontrolü: appointment_reminder category.
      const notifChannel: NotificationChannel =
        rec.channel === "in_app" ? "in_app" : rec.channel;
      if (
        !this.consent.canSend(owner.id, notifChannel, "appointment_reminder")
      ) {
        this.repo.update(rec.tenantId, rec.id, {
          status: "cancelled",
          lastError: "opted_out",
          attempts: rec.attempts + 1,
        });
        skipped += 1;
        continue;
      }

      // 4) Template data hazırla.
      const data = this.buildTemplateData(appt, patient.name, owner, locale);
      const idempotencyKey = `appt-reminder|${rec.id}`;

      // 5) NotificationsService.send.
      try {
        const notification = await this.notifications.send(
          {
            tenantId: rec.tenantId,
            userId: owner.id,
            channel: notifChannel,
            category: "appointment_reminder",
            templateKey: "appointment_reminder",
            locale,
            data,
            idempotencyKey,
          },
          systemActor,
        );
        if (notification.status === "sent") {
          this.repo.update(rec.tenantId, rec.id, {
            status: "sent",
            attempts: rec.attempts + 1,
            sentAt: notification.sentAt ?? new Date().toISOString(),
            lastError: null,
          });
          sent += 1;
        } else if (notification.status === "failed") {
          this.repo.update(rec.tenantId, rec.id, {
            status: "failed",
            attempts: rec.attempts + 1,
            lastError: notification.lastError ?? "send_failed",
          });
          failed += 1;
        } else if (notification.status === "opted_out") {
          this.repo.update(rec.tenantId, rec.id, {
            status: "cancelled",
            attempts: rec.attempts + 1,
            lastError: "opted_out",
          });
          skipped += 1;
        } else {
          // queued / sending → schedule'a bırak (job tekrar çalışacak).
          this.repo.update(rec.tenantId, rec.id, {
            attempts: rec.attempts + 1,
            lastError: `notification_${notification.status}`,
          });
          skipped += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.repo.update(rec.tenantId, rec.id, {
          status: "failed",
          attempts: rec.attempts + 1,
          lastError: message,
        });
        failed += 1;
      }
    }

    await this.audit.record({
      eventName: "audit:appointment_reminder.process_due",
      tenantId: "system",
      branchId: null,
      actorId: "system",
      actorType: "system",
      targetType: "appointment_reminder",
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
  // listForAppointment — controller
  // -------------------------------------------------------------------------

  /**
   * Bir randevuya ait hatırlatmaları tenant-scoped listeler.
   * Cross-tenant durumunda repository zaten boş döner; randevunun
   * kendisi burada kontrol edilmez (AppointmentsService'e
   * bağımlılık circular import yaratır). Bu nedenle appointmentId
   * geçersizse boş liste + total=0 döner; controller 404 atmaz
   * (kullanıcı kendi tenant'ında sorgu atıyor).
   * @param tenantId
   * @param appointmentId
   * @param query
   * @param actor
   */
  public async listForAppointment(
    tenantId: string,
    appointmentId: string,
    query: ReminderListQuery,
    actor: ActorContext,
  ): Promise<{ items: ScheduledReminder[]; total: number }> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.listForAppointment(
      tenantId,
      appointmentId,
      query.status,
      query.limit,
      query.offset,
    );
    return {
      items: result.items.map((r) => this.toScheduledReminder(r)),
      total: result.total,
    };
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

  private systemActor(tenantId: string): ActorContext {
    // Tenant-bazlı actor — NotificationsService bu actor.tenantId ile
    // cross-tenant guard uygular (actor.tenantId === request.tenantId).
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

  /**
   * Tenant locale'ini TenantService üzerinden çözer. System
   * job context'inde actor.tenantId set edilir, bu sayede service
   * kendi tenant'ını okuyabilir.
   * @param tenantId
   * @param actor
   */
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
      // tenant.service.findById hata fırlatırsa (404 vs.) default'a düş.
    }
    return "tr-TR";
  }

  private toScheduledReminder(
    rec: AppointmentReminderRecord,
  ): ScheduledReminder {
    return {
      id: rec.id,
      tenantId: rec.tenantId,
      appointmentId: rec.appointmentId,
      channel: rec.channel,
      scheduledFor: rec.scheduledFor,
      status: rec.status,
      attempts: rec.attempts,
      lastError: rec.lastError,
      sentAt: rec.sentAt,
      createdAt: rec.createdAt,
    };
  }

  private buildTemplateData(
    appt: Appointment,
    petName: string,
    owner: { firstName: string; lastName: string },
    locale: "tr-TR" | "en-GB",
  ): Record<string, unknown> {
    const startDate = new Date(appt.start);
    const dateStr = startDate.toLocaleDateString(
      locale === "tr-TR" ? "tr-TR" : "en-GB",
      { year: "numeric", month: "long", day: "numeric" },
    );
    const timeStr = startDate.toLocaleTimeString(
      locale === "tr-TR" ? "tr-TR" : "en-GB",
      { hour: "2-digit", minute: "2-digit" },
    );
    const ownerName = `${owner.firstName} ${owner.lastName}`.trim();
    return {
      ownerName:
        ownerName || (locale === "tr-TR" ? "Sayın Hasta Sahibi" : "Dear Owner"),
      petName: petName || (locale === "tr-TR" ? "Hayvanınız" : "Your pet"),
      clinicName: "", // tenant.name çekilebilir; şimdilik boş bırakıldı (template boş handle eder)
      date: dateStr,
      time: timeStr,
      appointmentId: appt.id,
      type: appt.type,
    };
  }
}
