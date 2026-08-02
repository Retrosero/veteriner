/**
 * @file Calendar service (klinik takvimi).
 * @module apps/api/modules/calendar/calendar.service
 * @description GOAL-030 klinik takvimi (calendar / time slot yönetimi)
 * iş kuralları. Veterinarian başına working hours tanımı, gün için
 * slot üretimi, mevcut appointment'lar ile booked durumunun
 * hesaplanması, blocked slot (mola/izin) yönetimi.
 *
 * İş kuralları:
 * - `getDay(tenantId, date, query, actor)`:
 *   - Tarih ISO `YYYY-MM-DD`; o günün `DayOfWeek`'i hesaplanır.
 *   - Tenant + (opsiyonel) veterinarian için working hours
 *     kaydı varsa kullanılır; yoksa **varsayılan** çalışma
 *     saati (Pzt-Cum 09:00-17:00, 30 dk slot) uygulanır.
 *   - Working hours'tan `slotDurationMin` aralıklarla slot'lar
 *     üretilir (`startTime`'dan `endTime`'a kadar, exclusive
 *     end dahil değil).
 *   - Booked slot'lar: GOAL-031 Appointment modeli henüz
 *     tanımlı değil; bu sebeple `bookedSlots` in-memory Map'inde
 *     tutulur. Her slot bir appointment ID'si ile eşleşir.
 *   - Blocked slot'lar: `blockedById` Map'inde tutulur. Bir
 *     slot blocked aralıkla kesişiyorsa `status='blocked'`.
 *   - `veterinarianId` filtresi: yalnızca o veterinarian'ın
 *     slot'ları döner.
 *   - Audit: takvim okuması audit YAYINLAMAZ (gürültü kontrolü).
 * - `setWorkingHours(tenantId, input, actor)`: tenant (veya
 *   belirtilen veterinarian) için çalışma saatlerini günceller.
 *   Audit `audit:calendar.hours.update` (info). Gün içi
 *   değişiklikler mevcut booked slot'ları ETKİLEMEZ (gelecek
 *   slot'lar yeniden üretilir).
 * - `blockSlot(tenantId, input, actor)`: slot'u blocked yapar
 *   (mola, izin). Audit `audit:calendar.block` (info).
 * - `unblockSlot(tenantId, blockId, actor)`: blocked slot'u
 *   kaldırır. Audit `audit:calendar.unblock` (info).
 *   Cross-tenant blockId → 404.
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Cross-tenant blockId → 404 VET-AUTHZ-0001.
 * @since GOAL-030 (FAZ-3) klinik takvimi core
 */

import { randomUUID } from "node:crypto";

import { Injectable, Logger, OnApplicationBootstrap, Optional } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { AppointmentsRepository } from "../appointments/appointments.repository.js";

import { AuditService } from "../../common/audit/audit.service.js";
import {
  type BlockedSlotRecord,
  type DayOfWeek,
} from "../../common/calendar/calendar.types.js";
import { DomainError } from "../../common/errors/domain-error.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  BlockSlotInput,
  CalendarDay,
  CalendarSlot,
  GetDayQuery,
  SetWorkingHoursInput,
  WorkingHours,
} from "@vetniva/contracts";

/** Varsayılan çalışma saati: Pzt-Cum 09:00-17:00, 30 dk slot. */
const DEFAULT_WORKING_HOURS: ReadonlyArray<WorkingHours> = [
  { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", slotDurationMin: 30 },
  { dayOfWeek: 2, startTime: "09:00", endTime: "17:00", slotDurationMin: 30 },
  { dayOfWeek: 3, startTime: "09:00", endTime: "17:00", slotDurationMin: 30 },
  { dayOfWeek: 4, startTime: "09:00", endTime: "17:00", slotDurationMin: 30 },
  { dayOfWeek: 5, startTime: "09:00", endTime: "17:00", slotDurationMin: 30 },
];

/** Booked slot kaydı (GOAL-031 Appointment modeli yerine). */
interface BookedSlotRecord {
  tenantId: string;
  /** Şube (branch) filtresi. NULL = tenant-wide. */
  branchId: string | null;
  veterinarianId: string;
  appointmentId: string;
  start: string;
  end: string;
}

/**
 * Tenant + veterinarian için default veterinarian ID placeholder
 *  (veterinarianId belirtilmediğinde kullanılır).
 */
const DEFAULT_VETERINARIAN_ID = "vet-default";

@Injectable()
export class CalendarService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CalendarService.name);

  /** key: `${tenantId}|${veterinarianId}` → WorkingHours[] */
  private readonly workingHoursByTenant = new Map<
    string,
    ReadonlyArray<WorkingHours>
  >();

  /** key: `${tenantId}|${veterinarianId}|${start}` → BookedSlotRecord */
  private readonly bookedSlots = new Map<string, BookedSlotRecord>();

  /** Key: blockId → BlockedSlotRecord */
  private readonly blockedById = new Map<string, BlockedSlotRecord>();

  public constructor(private readonly audit: AuditService, @Optional() private readonly moduleRef?: ModuleRef) {}

  /**
   * Kalıcı scheduled randevuları süreç başlangıcında tekrar booked slot'a
   * dönüştürür. Repository ModuleRef ile çözülür; Calendar↔Appointments
   * modül döngüsü yaratılmaz. Hata uygulamayı başlatmaktan alıkoymaz ama
   * görünür loglanır; sonraki restart'ta tekrar denenir.
   */
  public async onApplicationBootstrap(): Promise<void> {
    try {
      if (!this.moduleRef) return;
      const repo = this.moduleRef.get(AppointmentsRepository, { strict: false });
      const appointments = await repo.listScheduledForBootstrap();
      for (const appointment of appointments) this.bookSlot({ tenantId: appointment.tenantId, branchId: appointment.branchId, veterinarianId: appointment.veterinarianId, appointmentId: appointment.id, start: appointment.start, end: appointment.end });
      this.logger.log(`Kalıcı randevulardan ${appointments.length} takvim slotu yüklendi`);
    } catch (error) {
      this.logger.error(`Takvim slotları yüklenemedi: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Bir günün tam takvimini döner: working hours'tan üretilen
   * slot'lar, mevcut booked slot'lar ve blocked slot'lar ile
   * birlikte. `branchId` filtresi verildiğinde yalnızca o
   * şubenin booked/blocked slot'ları dikkate alınır; tenant-wide
   * (branchId=null) kayıtlar HER şubede görünür.
   * @param tenantId
   * @param date
   * @param query
   * @param actor
   */
  public async getDay(
    tenantId: string,
    date: string,
    query: GetDayQuery,
    actor: ActorContext,
  ): Promise<CalendarDay> {
    this.requireTenantScope(actor, tenantId);

    const veterinarianId = query.veterinarianId ?? DEFAULT_VETERINARIAN_ID;
    const dayOfWeek = this.dayOfWeekForDate(date);

    const hours =
      this.workingHoursByTenant.get(this.hoursKey(tenantId, veterinarianId)) ??
      DEFAULT_WORKING_HOURS;

    const dayHours = hours.filter((h) => h.dayOfWeek === dayOfWeek);

    const slots: CalendarSlot[] = [];
    for (const block of dayHours) {
      slots.push(
        ...this.generateSlots(
          tenantId,
          veterinarianId,
          date,
          block,
          query.branchId,
        ),
      );
    }

    return { date, slots };
  }

  /**
   * Tenant (veya belirtilen veterinarian) için çalışma
   * saatlerini günceller. Mevcut booked/blocked slot'lar
   * ETKİLENMEZ; yalnızca gelecekte üretilecek slot'lar yeni
   * kuralla hesaplanır.
   * @param tenantId
   * @param input
   * @param actor
   */
  public async setWorkingHours(
    tenantId: string,
    input: SetWorkingHoursInput,
    actor: ActorContext,
  ): Promise<void> {
    this.requireTenantScope(actor, tenantId);

    const veterinarianId = input.veterinarianId ?? DEFAULT_VETERINARIAN_ID;
    this.validateWorkingHours(input.hours);

    const key = this.hoursKey(tenantId, veterinarianId);
    const previous = this.workingHoursByTenant.get(key) ?? null;
    this.workingHoursByTenant.set(key, [...input.hours]);

    await this.audit.recordSimple(
      "audit:calendar.hours.update",
      "calendar.working_hours",
      `${tenantId}:${veterinarianId}`,
      "update",
      this.actorToAuditActor(actor),
      "info",
      {
        veterinarianId,
        previous: previous ? [...previous] : null,
        next: [...input.hours],
      },
    );
  }

  /**
   * Veterinarian için slot aralığını blocked yapar (mola, izin).
   * @param tenantId
   * @param input
   * @param actor
   */
  public async blockSlot(
    tenantId: string,
    input: BlockSlotInput,
    actor: ActorContext,
  ): Promise<BlockedSlotRecord> {
    this.requireTenantScope(actor, tenantId);

    if (new Date(input.end) <= new Date(input.start)) {
      throw new DomainError({
        errorCode: "VET-APPT-0001",
        message: "Bitiş zamanı başlangıçtan sonra olmalı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-APPT-0001",
        details: { start: input.start, end: input.end },
      });
    }

    const id = `blk-${randomUUID()}`;
    const now = new Date().toISOString();
    const record: BlockedSlotRecord = {
      id,
      tenantId,
      branchId: input.branchId ?? null,
      veterinarianId: input.veterinarianId,
      start: input.start,
      end: input.end,
      reason: input.reason,
      createdBy: actor.actorId,
      createdAt: now,
    };
    this.blockedById.set(id, record);

    await this.audit.recordSimple(
      "audit:calendar.block",
      "calendar.blocked_slot",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        veterinarianId: input.veterinarianId,
        branchId: input.branchId ?? null,
        start: input.start,
        end: input.end,
        reason: input.reason,
      },
    );

    return record;
  }

  /**
   * Engellenmiş slot'u kaldırır. Cross-tenant blockId → 404.
   * @param tenantId
   * @param blockId
   * @param actor
   */
  public async unblockSlot(
    tenantId: string,
    blockId: string,
    actor: ActorContext,
  ): Promise<void> {
    this.requireTenantScope(actor, tenantId);

    const record = this.blockedById.get(blockId);
    if (!record || record.tenantId !== tenantId) {
      throw new DomainError({
        errorCode: "VET-APPT-0002",
        message: "Engellenen slot bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-APPT-0002",
        details: { blockId },
      });
    }

    this.blockedById.delete(blockId);

    await this.audit.recordSimple(
      "audit:calendar.unblock",
      "calendar.blocked_slot",
      blockId,
      "archive",
      this.actorToAuditActor(actor),
      "info",
      {
        veterinarianId: record.veterinarianId,
        start: record.start,
        end: record.end,
      },
    );
  }

  /**
   * Test amaçlı: booked slot ekler (manuel seed için).
   * @param record
   */
  public seedBookedSlot(record: BookedSlotRecord): void {
    const key = this.bookedKey(
      record.tenantId,
      record.veterinarianId,
      record.start,
    );
    this.bookedSlots.set(key, record);
  }

  /**
   * GOAL-031: Appointment oluşturma sırasında slot'u booked yapar.
   * Aynı tenant + vet + start için tek bir booked slot olabilir
   * (çakışma kontrolü service katmanında yapılır).
   * @param record
   */
  public bookSlot(record: BookedSlotRecord): void {
    const key = this.bookedKey(
      record.tenantId,
      record.veterinarianId,
      record.start,
    );
    this.bookedSlots.set(key, record);
  }

  /**
   * GOAL-031: Appointment iptali / yeniden planlaması sonrasında
   * booked slot'u kaldırır. Key bulunamazsa false döner.
   * @param tenantId
   * @param veterinarianId
   * @param startIso
   */
  public releaseSlot(
    tenantId: string,
    veterinarianId: string,
    startIso: string,
  ): boolean {
    const key = this.bookedKey(tenantId, veterinarianId, startIso);
    return this.bookedSlots.delete(key);
  }

  /**
   * GOAL-031: Belirtilen [start, end) aralığının uygunluğunu kontrol
   * eder. Booked veya blocked slot ile overlap → uygun değil.
   * Branch filtresi verildiğinde yalnızca o şubenin booked/blocked
   * kayıtlarına bakılır (tenant-wide kayıtlar her şubede görünür).
   * @param tenantId
   * @param veterinarianId
   * @param startIso
   * @param endIso
   * @param branchId
   * @returns Available=false durumda `reason` ve `conflictId` döner
   *   (booked → appointmentId, blocked → blockId).
   */
  public checkAvailability(
    tenantId: string,
    veterinarianId: string,
    startIso: string,
    endIso: string,
    branchId?: string,
  ): {
    available: boolean;
    reason: "booked" | "blocked" | null;
    conflictId: string | null;
  } {
    const s = new Date(startIso).getTime();
    const e = new Date(endIso).getTime();

    for (const rec of this.bookedSlots.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.veterinarianId !== veterinarianId) continue;
      if (
        branchId !== undefined &&
        rec.branchId !== null &&
        rec.branchId !== branchId
      ) {
        continue;
      }
      const rs = new Date(rec.start).getTime();
      const re = new Date(rec.end).getTime();
      if (s < re && rs < e) {
        return {
          available: false,
          reason: "booked",
          conflictId: rec.appointmentId,
        };
      }
    }

    for (const rec of this.blockedById.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.veterinarianId !== veterinarianId) continue;
      if (
        branchId !== undefined &&
        rec.branchId !== null &&
        rec.branchId !== branchId
      ) {
        continue;
      }
      const rs = new Date(rec.start).getTime();
      const re = new Date(rec.end).getTime();
      if (s < re && rs < e) {
        return { available: false, reason: "blocked", conflictId: rec.id };
      }
    }

    return { available: true, reason: null, conflictId: null };
  }

  /**
   * Test amaçlı: tüm in-memory state'i temizler.
   */
  public clearAll(): void {
    this.workingHoursByTenant.clear();
    this.bookedSlots.clear();
    this.blockedById.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private generateSlots(
    tenantId: string,
    veterinarianId: string,
    date: string,
    block: WorkingHours,
    branchId: string | undefined,
  ): CalendarSlot[] {
    const slots: CalendarSlot[] = [];
    const [startH, startM] = this.parseHhMm(block.startTime);
    const [endH, endM] = this.parseHhMm(block.endTime);
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const start = new Date(
      dayStart.getTime() + (startH * 60 + startM) * 60_000,
    );
    const end = new Date(dayStart.getTime() + (endH * 60 + endM) * 60_000);
    const stepMs = block.slotDurationMin * 60_000;

    let cursor = start;
    while (cursor.getTime() + stepMs <= end.getTime()) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor.getTime() + stepMs);
      const startIso = slotStart.toISOString();
      const endIso = slotEnd.toISOString();

      // 1) Booked mı? — branch filtresine uygun entry ara
      const booked = this.findBookedSlot(
        tenantId,
        veterinarianId,
        startIso,
        branchId,
      );

      // 2) Blocked mı? — branch filtresine uygun entry ara
      const blocked = this.isBlocked(
        tenantId,
        veterinarianId,
        startIso,
        endIso,
        branchId,
      );

      let status: CalendarSlot["status"] = "available";
      let appointmentId: string | undefined;
      if (booked) {
        status = "booked";
        appointmentId = booked.appointmentId;
      } else if (blocked) {
        status = "blocked";
      }

      slots.push({
        start: startIso,
        end: endIso,
        status,
        ...(appointmentId !== undefined && { appointmentId }),
        veterinarianId,
      });

      cursor = slotEnd;
    }
    return slots;
  }

  /**
   * Branch filtresine uygun booked slot arar. `branchId` verildiğinde
   * yalnızca o şubenin booked slot'ları eşleşir; tenant-wide
   * (branchId=null) booked slot'lar her şubede görünür.
   * @param tenantId
   * @param veterinarianId
   * @param startIso
   * @param branchId
   */
  private findBookedSlot(
    tenantId: string,
    veterinarianId: string,
    startIso: string,
    branchId: string | undefined,
  ): BookedSlotRecord | undefined {
    for (const rec of this.bookedSlots.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.veterinarianId !== veterinarianId) continue;
      if (rec.start !== startIso) continue;
      // Branch filtresi: branchId=null (tenant-wide) tüm şubelerde
      // görünür; branchId=<X> yalnızca o şubede görünür.
      if (
        branchId !== undefined &&
        rec.branchId !== null &&
        rec.branchId !== branchId
      ) {
        continue;
      }
      return rec;
    }
    return undefined;
  }

  private isBlocked(
    tenantId: string,
    veterinarianId: string,
    startIso: string,
    endIso: string,
    branchId: string | undefined,
  ): boolean {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    for (const rec of this.blockedById.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.veterinarianId !== veterinarianId) continue;
      // Branch filtresi: branchId=null (tenant-wide) tüm şubelerde
      // görünür; branchId=<X> yalnızca o şubede görünür.
      if (
        branchId !== undefined &&
        rec.branchId !== null &&
        rec.branchId !== branchId
      ) {
        continue;
      }
      const bs = new Date(rec.start).getTime();
      const be = new Date(rec.end).getTime();
      // Overlap kontrolü: [start,end) ∩ [bs,be) ≠ ∅
      if (start < be && bs < end) return true;
    }
    return false;
  }

  private validateWorkingHours(hours: ReadonlyArray<WorkingHours>): void {
    const seen = new Set<DayOfWeek>();
    for (const h of hours) {
      if (seen.has(h.dayOfWeek as DayOfWeek)) {
        throw new DomainError({
          errorCode: "VET-APPT-0003",
          message: "Aynı gün için birden fazla çalışma saati tanımlanamaz",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-APPT-0003",
          details: { dayOfWeek: h.dayOfWeek },
        });
      }
      seen.add(h.dayOfWeek as DayOfWeek);
      if (h.startTime >= h.endTime) {
        throw new DomainError({
          errorCode: "VET-APPT-0003",
          message: "Bitiş saati başlangıç saatinden sonra olmalı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-APPT-0003",
          details: { startTime: h.startTime, endTime: h.endTime },
        });
      }
    }
  }

  private dayOfWeekForDate(date: string): DayOfWeek {
    const d = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
      throw new DomainError({
        errorCode: "VET-APPT-0004",
        message: "Geçersiz tarih",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-APPT-0004",
        details: { date },
      });
    }
    return d.getUTCDay() as DayOfWeek;
  }

  private parseHhMm(value: string): [number, number] {
    const parts = value.split(":");
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    return [h, m];
  }

  private hoursKey(tenantId: string, veterinarianId: string): string {
    return `${tenantId}|${veterinarianId}`;
  }

  private bookedKey(
    tenantId: string,
    veterinarianId: string,
    startIso: string,
  ): string {
    return `${tenantId}|${veterinarianId}|${startIso}`;
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
    branchId?: string | null;
    correlationId: string;
    country: string;
    ipAddress?: string | null;
    userAgentHash?: string | null;
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
