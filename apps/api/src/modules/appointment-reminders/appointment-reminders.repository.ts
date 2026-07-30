/**
 * @file Appointment reminder repository (in-memory).
 * @module apps/api/modules/appointment-reminders/appointment-reminders.repository
 *
 * @description GOAL-036 randevu hatırlatma kayıtları için tenant-scoped
 * in-memory store. DB migration sonraya bırakıldı; API sözleşmesi
 * sabit kalacak şekilde Prisma repository'si ile değiştirilebilir.
 *
 * Kayıt anahtarlama:
 * - Birincil anahtar: `id` (uuidv4).
 * - Idempotency anahtarı: `appointmentId|channel|scheduledForISO`
 *   (aynı randevu + kanal + zaman için tekrar planlama no-op).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı için
 *   uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-036 (FAZ-3) randevu hatırlatma core
 */

import { Injectable } from "@nestjs/common";

import type {
  Appointment,
  ReminderChannel,
  ReminderStatus,
} from "@vetniva/contracts";

/** Persist edilmiş reminder record. */
export interface AppointmentReminderRecord {
  id: string;
  tenantId: string;
  appointmentId: string;
  /** Kanal (sms / email / in_app). */
  channel: ReminderChannel;
  /**
   * Gönderim için planlanan an (ISO 8601). Gelecekte olmalı
   * (schedule anında); processDueReminders `now >= scheduledFor`
   * olanları işler.
   */
  scheduledFor: string;
  status: ReminderStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  /**
   * Aynı randevu için birden fazla hatırlatma olabilir (24 saat
   * önce + 2 saat önce). `dedupeKey` ile çift planlama engellenir.
   */
  dedupeKey: string;
  /**
   * Hatırlatma zamanı geldiğinde randevu durumunu kontrol etmek
   * için plan anındaki appointment snapshot'ı. AppointmentService'e
   * doğrudan bağımlılığı kırar (circular import koruması) ve job
   * çalışırken randevu verisinin tutarlı kalmasını sağlar.
   */
  snapshot: Appointment | null;
}

/** Tenant başına id counter. */
@Injectable()
export class AppointmentRemindersRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, AppointmentReminderRecord>();
  /** key: tenantId|dedupeKey → id. Idempotency için. */
  private readonly byDedupe = new Map<string, string>();
  /** Her tenant için sayaç. */
  private readonly counters = new Map<string, number>();

  /** Yeni id üretir. */
  public nextId(tenantId: string): string {
    const next = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, next);
    // uuidv4 benzeri deterministik test id.
    return `arm-${tenantId.slice(0, 8)}-${next.toString().padStart(6, "0")}`;
  }

  /** Idempotency anahtarı üretir. */
  public static buildDedupeKey(
    appointmentId: string,
    channel: ReminderChannel,
    scheduledFor: string,
  ): string {
    return `${appointmentId}|${channel}|${scheduledFor}`;
  }

  /** Yeni kayıt ekler. Idempotency: aynı tenant+dedupeKey varsa no-op. */
  public insert(
    record: AppointmentReminderRecord,
  ): { inserted: true; record: AppointmentReminderRecord } | { inserted: false; existing: AppointmentReminderRecord } {
    const existing = this.byDedupe.get(`${record.tenantId}|${record.dedupeKey}`);
    if (existing) {
      const found = this.byId.get(existing);
      if (found) return { inserted: false, existing: found };
    }
    this.byId.set(record.id, record);
    this.byDedupe.set(`${record.tenantId}|${record.dedupeKey}`, record.id);
    return { inserted: true, record };
  }

  /** Tenant-scoped id ile bul. */
  public findById(
    tenantId: string,
    id: string,
  ): AppointmentReminderRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /** Tenant + appointmentId ile tüm reminder'ları getir (sort: scheduledFor asc). */
  public listForAppointment(
    tenantId: string,
    appointmentId: string,
    status: ReminderStatus | undefined,
    limit: number,
    offset: number,
  ): { items: AppointmentReminderRecord[]; total: number } {
    const all: AppointmentReminderRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.appointmentId !== appointmentId) continue;
      if (status && rec.status !== status) continue;
      all.push(rec);
    }
    all.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    return {
      items: all.slice(offset, offset + limit),
      total: all.length,
    };
  }

  /**
   * Zamanı gelmiş + status='scheduled' olan reminder'ları tüm
   * tenant'lardan getirir (cron / job çağrısı için). Üst sınır
   * uygulanır (batch).
   */
  public listDue(
    now: number,
    limit: number,
  ): AppointmentReminderRecord[] {
    const out: AppointmentReminderRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.status !== "scheduled") continue;
      if (new Date(rec.scheduledFor).getTime() > now) continue;
      out.push(rec);
      if (out.length >= limit) break;
    }
    out.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    return out;
  }

  /** Status güncelle (idempotent retry sonrası status='sent' yapmak için). */
  public update(
    tenantId: string,
    id: string,
    patch: Partial<
      Pick<
        AppointmentReminderRecord,
        "status" | "attempts" | "lastError" | "sentAt"
      >
    >,
  ): AppointmentReminderRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    const next: AppointmentReminderRecord = { ...rec };
    if (patch.status !== undefined) next.status = patch.status;
    if (patch.attempts !== undefined) next.attempts = patch.attempts;
    if (patch.lastError !== undefined) next.lastError = patch.lastError;
    if (patch.sentAt !== undefined) next.sentAt = patch.sentAt;
    this.byId.set(id, next);
    return next;
  }

  /**
   * Snapshot patch (status değişikliği testlerinde kullanılır).
   * Status update'ten ayrı tutulur çünkü patch'in tip imzası
   * `status` alanı ile karışmasın.
   */
  public updateSnapshot(
    tenantId: string,
    id: string,
    snapshot: Appointment | null,
  ): AppointmentReminderRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    const next: AppointmentReminderRecord = { ...rec, snapshot };
    this.byId.set(id, next);
    return next;
  }

  /**
   * Bir appointment'ın tüm `scheduled` kayıtlarını `cancelled`
   * yapar. Randevu iptal edildiğinde çağrılır.
   */
  public cancelForAppointment(
    tenantId: string,
    appointmentId: string,
  ): number {
    let n = 0;
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.appointmentId !== appointmentId) continue;
      if (rec.status !== "scheduled") continue;
      this.byId.set(rec.id, { ...rec, status: "cancelled" });
      n += 1;
    }
    return n;
  }

  /**
   * Bir appointment'ın tüm `scheduled` kayıtlarını yeni start'a
   * göre offset hesabıyla taşır. `deltaMs` = newStart - oldStart.
   * Geçmişe kayıyorsa (negative delta) status='cancelled' yapılır.
   * Snapshot'taki start/end de güncellenir.
   */
  public rescheduleForAppointment(
    tenantId: string,
    appointmentId: string,
    deltaMs: number,
    newStartIso: string,
    newEndIso: string,
  ): number {
    let n = 0;
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.appointmentId !== appointmentId) continue;
      if (rec.status !== "scheduled") continue;
      const oldMs = new Date(rec.scheduledFor).getTime();
      const newMs = oldMs + deltaMs;
      if (newMs <= Date.now()) {
        // Yeni zaman geçmişte → hatırlatma anlamsız, iptal et.
        this.byId.set(rec.id, { ...rec, status: "cancelled" });
      } else {
        const newScheduledFor = new Date(newMs).toISOString();
        const newDedupe = AppointmentRemindersRepository.buildDedupeKey(
          rec.appointmentId,
          rec.channel,
          newScheduledFor,
        );
        // Eski dedupe anahtarını kaldır, yenisini ekle.
        this.byDedupe.delete(`${rec.tenantId}|${rec.dedupeKey}`);
        this.byDedupe.set(`${rec.tenantId}|${newDedupe}`, rec.id);
        // Snapshot'ı yeni start/end ile güncelle.
        const nextSnapshot = rec.snapshot
          ? { ...rec.snapshot, start: newStartIso, end: newEndIso }
          : rec.snapshot;
        this.byId.set(rec.id, {
          ...rec,
          scheduledFor: newScheduledFor,
          dedupeKey: newDedupe,
          snapshot: nextSnapshot,
        });
      }
      n += 1;
    }
    return n;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.byDedupe.clear();
    this.counters.clear();
  }
}
