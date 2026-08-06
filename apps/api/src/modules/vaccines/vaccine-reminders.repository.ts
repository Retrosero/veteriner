/**
 * @file Vaccine reminder repository (in-memory).
 * @module apps/api/modules/vaccines/vaccine-reminders.repository
 *
 * @description GOAL-053 aşı hatırlatma kayıtları için tenant-scoped
 * in-memory store. DB migration sonraya bırakıldı; API sözleşmesi
 * sabit kalacak şekilde Prisma repository'si ile değiştirilebilir.
 *
 * Kayıt anahtarlama:
 * - Birincil anahtar: `id` (uuidv4-benzeri).
 * - Idempotency anahtarı: `applicationId|channel|scheduledForISO`
 *   (aynı uygulama + kanal + zaman için tekrar planlama no-op).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-053 (FAZ-5) aşı hatırlatma core
 */

import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import { buildVaccineReminderDedupeKey } from "../../common/vaccines/vaccine-reminder.types.js";
import { PrismaService } from "../../prisma/prisma.service.js";

import type { VaccineReminderRecord } from "../../common/vaccines/vaccine-reminder.types.js";
import type {
  Prisma,
  VaccineReminderRecord as DbReminder,
} from "@prisma/client";
import type {
  VaccineReminderChannel,
  VaccineReminderStatus,
} from "@vetniva/contracts";

/**
 * Tenant başına hatırlatma config kaydı (in-memory). Faz 11+ için
 * Prisma modeline taşınacak. Ayar tenant override'ı tutar; yoksa
 * service default config'e düşer.
 */
export interface VaccineReminderTenantConfig {
  tenantId: string;
  daysBeforeDue: number;
  channels: VaccineReminderChannel[];
  updatedAt: string;
}

@Injectable()
export class VaccineRemindersRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, VaccineReminderRecord>();
  /** key: tenantId|dedupeKey → id. Idempotency için. */
  private readonly byDedupe = new Map<string, string>();
  /** Her tenant için sayaç. */
  private readonly counters = new Map<string, number>();
  /** Tenant config'leri. */
  private readonly tenantConfigs = new Map<
    string,
    VaccineReminderTenantConfig
  >();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  /** Yeni id üretir. */
  public nextId(tenantId: string): string {
    if (this.prisma) return `vrm-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const next = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, next);
    return `vrm-${tenantId.slice(0, 8)}-${next.toString().padStart(6, "0")}`;
  }

  /** Dedupe anahtarı tenant içinde benzersiz olacak şekilde kalıcı kayıt ekler. */
  public async persist(
    record: VaccineReminderRecord,
  ): Promise<
    | { inserted: true; record: VaccineReminderRecord }
    | { inserted: false; existing: VaccineReminderRecord }
  > {
    if (!this.prisma) return this.insert(record);
    return this.inTenant(record.tenantId, async (tx) => {
      const existing = await tx.vaccineReminderRecord.findFirst({
        where: { tenantId: record.tenantId, dedupeKey: record.dedupeKey },
      });
      if (existing) return { inserted: false, existing: this.map(existing) };
      const row = await tx.vaccineReminderRecord.create({
        data: {
          ...record,
          applicationSnapshot:
            record.applicationSnapshot as Prisma.InputJsonValue,
          stepSnapshot: record.stepSnapshot as Prisma.InputJsonValue,
          scheduledFor: new Date(record.scheduledFor),
          sentAt: record.sentAt ? new Date(record.sentAt) : null,
          createdAt: new Date(record.createdAt),
        },
      });
      return { inserted: true, record: this.map(row) };
    });
  }
  public async persistedDue(
    now: number,
    limit: number,
  ): Promise<VaccineReminderRecord[]> {
    if (!this.prisma) return this.listDue(now, limit);
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin','true',true)`;
      return tx.vaccineReminderRecord.findMany({
        where: { status: "scheduled", scheduledFor: { lte: new Date(now) } },
        orderBy: { scheduledFor: "asc" },
        take: limit,
      });
    });
    return rows.map((row) => this.map(row));
  }

  /** Idempotency anahtarı üretir (public static helper). */
  public static buildDedupeKey(
    applicationId: string,
    channel: VaccineReminderChannel,
    scheduledFor: string,
  ): string {
    return buildVaccineReminderDedupeKey(applicationId, channel, scheduledFor);
  }

  /** Yeni kayıt ekler. Idempotency: aynı tenant+dedupeKey varsa no-op. */
  public insert(
    record: VaccineReminderRecord,
  ):
    | { inserted: true; record: VaccineReminderRecord }
    | { inserted: false; existing: VaccineReminderRecord } {
    const existing = this.byDedupe.get(
      `${record.tenantId}|${record.dedupeKey}`,
    );
    if (existing) {
      const found = this.byId.get(existing);
      if (found) return { inserted: false, existing: found };
    }
    this.byId.set(record.id, record);
    this.byDedupe.set(`${record.tenantId}|${record.dedupeKey}`, record.id);
    return { inserted: true, record };
  }

  /** Tenant-scoped id ile bul. */
  public findById(tenantId: string, id: string): VaccineReminderRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /** Tenant + patientId ile tüm reminder'ları getir (sort: scheduledFor asc). */
  public listForPatient(
    tenantId: string,
    patientId: string,
    filters: {
      protocolId?: string | undefined;
      applicationId?: string | undefined;
      status?: VaccineReminderStatus | undefined;
    },
    limit: number,
    offset: number,
  ): { items: VaccineReminderRecord[]; total: number } {
    const all: VaccineReminderRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.patientId !== patientId) continue;
      if (filters.protocolId && rec.protocolId !== filters.protocolId) continue;
      if (filters.applicationId && rec.applicationId !== filters.applicationId)
        continue;
      if (filters.status && rec.status !== filters.status) continue;
      all.push(rec);
    }
    all.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    return {
      items: all.slice(offset, offset + limit),
      total: all.length,
    };
  }

  /** Kalıcı hasta listesi; RLS transaction içinde sayfalama yapar. */
  public async persistedListForPatient(
    tenantId: string,
    patientId: string,
    filters: {
      protocolId?: string;
      applicationId?: string;
      status?: VaccineReminderStatus;
    },
    limit: number,
    offset: number,
  ): Promise<{ items: VaccineReminderRecord[]; total: number }> {
    if (!this.prisma)
      return this.listForPatient(tenantId, patientId, filters, limit, offset);
    return this.inTenant(tenantId, async (tx) => {
      const where = { tenantId, patientId, ...filters };
      const [items, total] = await Promise.all([
        tx.vaccineReminderRecord.findMany({
          where,
          orderBy: { scheduledFor: "asc" },
          skip: offset,
          take: limit,
        }),
        tx.vaccineReminderRecord.count({ where }),
      ]);
      return { items: items.map((row) => this.map(row)), total };
    });
  }

  /**
   * Zamanı gelmiş + status='scheduled' olan reminder'ları tüm
   * tenant'lardan getirir (cron / job çağrısı için). Üst sınır
   * uygulanır (batch).
   */
  public listDue(now: number, limit: number): VaccineReminderRecord[] {
    const out: VaccineReminderRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.status !== "scheduled") continue;
      if (new Date(rec.scheduledFor).getTime() > now) continue;
      out.push(rec);
      if (out.length >= limit) break;
    }
    out.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    return out;
  }

  /** Status güncelle. */
  public update(
    tenantId: string,
    id: string,
    patch: Partial<
      Pick<
        VaccineReminderRecord,
        "status" | "attempts" | "lastError" | "sentAt"
      >
    >,
  ): VaccineReminderRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    const next: VaccineReminderRecord = { ...rec };
    if (patch.status !== undefined) next.status = patch.status;
    if (patch.attempts !== undefined) next.attempts = patch.attempts;
    if (patch.lastError !== undefined) next.lastError = patch.lastError;
    if (patch.sentAt !== undefined) next.sentAt = patch.sentAt;
    this.byId.set(id, next);
    return next;
  }

  /** Kalıcı status/teslimat sonucu güncellemesi. */
  public async persistedUpdate(
    tenantId: string,
    id: string,
    patch: Partial<
      Pick<
        VaccineReminderRecord,
        "status" | "attempts" | "lastError" | "sentAt"
      >
    >,
  ): Promise<VaccineReminderRecord | null> {
    if (!this.prisma) return this.update(tenantId, id, patch);
    return this.inTenant(tenantId, async (tx) => {
      const result = await tx.vaccineReminderRecord.updateMany({
        where: { id, tenantId },
        data: {
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
          ...(patch.lastError !== undefined
            ? { lastError: patch.lastError }
            : {}),
          ...(patch.sentAt !== undefined
            ? { sentAt: patch.sentAt ? new Date(patch.sentAt) : null }
            : {}),
        },
      });
      if (result.count === 0) return null;
      const row = await tx.vaccineReminderRecord.findFirstOrThrow({
        where: { id, tenantId },
      });
      return this.map(row);
    });
  }

  /**
   * Bir uygulamanın tüm `scheduled` kayıtlarını `cancelled`
   * yapar. Uygulama iptal edildiğinde hook ile çağrılır.
   */
  public cancelForApplication(tenantId: string, applicationId: string): number {
    let n = 0;
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.applicationId !== applicationId) continue;
      if (rec.status !== "scheduled") continue;
      this.byId.set(rec.id, { ...rec, status: "cancelled" });
      n += 1;
    }
    return n;
  }

  /** Uygulamanın bekleyen kayıtlarını kalıcı olarak iptal eder. */
  public async persistedCancelForApplication(
    tenantId: string,
    applicationId: string,
  ): Promise<number> {
    if (!this.prisma) return this.cancelForApplication(tenantId, applicationId);
    return this.inTenant(
      tenantId,
      async (tx) =>
        (
          await tx.vaccineReminderRecord.updateMany({
            where: { tenantId, applicationId, status: "scheduled" },
            data: { status: "cancelled" },
          })
        ).count,
    );
  }

  /**
   * Bir hastanın tüm `scheduled` kayıtlarını `cancelled` yapar.
   * Hasta silindiğinde (soft) veya devredildiğinde hook ile
   * çağrılır.
   */
  public cancelForPatient(tenantId: string, patientId: string): number {
    let n = 0;
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.patientId !== patientId) continue;
      if (rec.status !== "scheduled") continue;
      this.byId.set(rec.id, { ...rec, status: "cancelled" });
      n += 1;
    }
    return n;
  }

  /** Hastanın bekleyen kayıtlarını kalıcı olarak iptal eder. */
  public async persistedCancelForPatient(
    tenantId: string,
    patientId: string,
  ): Promise<number> {
    if (!this.prisma) return this.cancelForPatient(tenantId, patientId);
    return this.inTenant(
      tenantId,
      async (tx) =>
        (
          await tx.vaccineReminderRecord.updateMany({
            where: { tenantId, patientId, status: "scheduled" },
            data: { status: "cancelled" },
          })
        ).count,
    );
  }

  /**
   * Bir uygulamanın tüm `scheduled` kayıtlarını yeni `nextDueDate`'e
   * göre offset hesabıyla taşır. `deltaMs` = newNextDueMs - oldNextDueMs.
   * Geçmişe kayıyorsa (negative delta veya sonuç <= now) status='cancelled'
   * yapılır. Snapshot'taki `nextDueDate` ve `applicationSnapshot.nextDueDate`
   * de güncellenir.
   */
  public rescheduleForApplication(args: {
    tenantId: string;
    applicationId: string;
    newNextDueDate: string;
  }): number {
    const { tenantId, applicationId, newNextDueDate } = args;
    let n = 0;
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.applicationId !== applicationId) continue;
      if (rec.status !== "scheduled") continue;
      // Snapshot'tan eski scheduledFor'ı hesapla, delta çıkar.
      // ScheduledFor = nextDueDate - daysBeforeDue. daysBeforeDue'yu
      // snapshot'ın zamanından türetmek için eski nextDueDate'i
      // kullanıyoruz (rec.nextDueDate zaten o anki snapshot).
      const oldDueMs = new Date(`${rec.nextDueDate}T00:00:00.000Z`).getTime();
      const newDueMs = new Date(`${newNextDueDate}T00:00:00.000Z`).getTime();
      if (Number.isNaN(oldDueMs) || Number.isNaN(newDueMs)) {
        this.byId.set(rec.id, { ...rec, status: "cancelled" });
        n += 1;
        continue;
      }
      const deltaMs = newDueMs - oldDueMs;
      const oldScheduledMs = new Date(rec.scheduledFor).getTime();
      if (Number.isNaN(oldScheduledMs)) {
        this.byId.set(rec.id, { ...rec, status: "cancelled" });
        n += 1;
        continue;
      }
      const newScheduledMs = oldScheduledMs + deltaMs;
      if (newScheduledMs <= Date.now()) {
        // Yeni zaman geçmişte → hatırlatma anlamsız, iptal et.
        this.byId.set(rec.id, { ...rec, status: "cancelled" });
      } else {
        const newScheduledFor = new Date(newScheduledMs).toISOString();
        const newDedupe = VaccineRemindersRepository.buildDedupeKey(
          rec.applicationId,
          rec.channel,
          newScheduledFor,
        );
        // Eski dedupe anahtarını kaldır, yenisini ekle.
        this.byDedupe.delete(`${rec.tenantId}|${rec.dedupeKey}`);
        this.byDedupe.set(`${rec.tenantId}|${newDedupe}`, rec.id);
        // Snapshot'ı güncelle.
        const nextSnapshot = rec.applicationSnapshot
          ? { ...rec.applicationSnapshot, nextDueDate: newNextDueDate }
          : rec.applicationSnapshot;
        this.byId.set(rec.id, {
          ...rec,
          scheduledFor: newScheduledFor,
          nextDueDate: newNextDueDate,
          dedupeKey: newDedupe,
          applicationSnapshot: nextSnapshot,
        });
      }
      n += 1;
    }
    return n;
  }

  /** Yeni sonraki aşı tarihine göre kalıcı planları atomik taşır veya iptal eder. */
  public async persistedRescheduleForApplication(args: {
    tenantId: string;
    applicationId: string;
    newNextDueDate: string;
  }): Promise<number> {
    if (!this.prisma) return this.rescheduleForApplication(args);
    const { tenantId, applicationId, newNextDueDate } = args;
    return this.inTenant(tenantId, async (tx) => {
      const records = await tx.vaccineReminderRecord.findMany({
        where: { tenantId, applicationId, status: "scheduled" },
      });
      let moved = 0;
      for (const row of records) {
        const record = this.map(row);
        const oldDueMs = new Date(
          `${record.nextDueDate}T00:00:00.000Z`,
        ).getTime();
        const newDueMs = new Date(`${newNextDueDate}T00:00:00.000Z`).getTime();
        const oldScheduledMs = new Date(record.scheduledFor).getTime();
        if (
          Number.isNaN(oldDueMs) ||
          Number.isNaN(newDueMs) ||
          Number.isNaN(oldScheduledMs)
        ) {
          await tx.vaccineReminderRecord.update({
            where: { id: record.id },
            data: { status: "cancelled" },
          });
          moved += 1;
          continue;
        }
        const newScheduledMs = oldScheduledMs + newDueMs - oldDueMs;
        if (newScheduledMs <= Date.now()) {
          await tx.vaccineReminderRecord.update({
            where: { id: record.id },
            data: { status: "cancelled" },
          });
          moved += 1;
          continue;
        }
        const scheduledFor = new Date(newScheduledMs).toISOString();
        const dedupeKey = VaccineRemindersRepository.buildDedupeKey(
          record.applicationId,
          record.channel,
          scheduledFor,
        );
        const applicationSnapshot = record.applicationSnapshot
          ? { ...record.applicationSnapshot, nextDueDate: newNextDueDate }
          : undefined;
        await tx.vaccineReminderRecord.update({
          where: { id: record.id },
          data: {
            scheduledFor: new Date(scheduledFor),
            nextDueDate: newNextDueDate,
            dedupeKey,
            applicationSnapshot: applicationSnapshot as Prisma.InputJsonValue,
          },
        });
        moved += 1;
      }
      return moved;
    });
  }

  // -------------------------------------------------------------------------
  // Tenant config
  // -------------------------------------------------------------------------

  /** Tenant config'i getirir; yoksa null. */
  public getTenantConfig(tenantId: string): VaccineReminderTenantConfig | null {
    return this.tenantConfigs.get(tenantId) ?? null;
  }

  /** Tenant config ekle/güncelle. */
  public upsertTenantConfig(
    config: VaccineReminderTenantConfig,
  ): VaccineReminderTenantConfig {
    this.tenantConfigs.set(config.tenantId, config);
    return config;
  }

  /** Tenant hatırlatma ayarını RLS kapsamlı upsert eder. */
  public async persistedUpsertTenantConfig(
    config: VaccineReminderTenantConfig,
  ): Promise<VaccineReminderTenantConfig> {
    if (!this.prisma) return this.upsertTenantConfig(config);
    return this.inTenant(config.tenantId, async (tx) => {
      const row = await tx.vaccineReminderTenantConfigRecord.upsert({
        where: { tenantId: config.tenantId },
        create: {
          tenantId: config.tenantId,
          daysBeforeDue: config.daysBeforeDue,
          channels: config.channels,
          updatedAt: new Date(config.updatedAt),
        },
        update: {
          daysBeforeDue: config.daysBeforeDue,
          channels: config.channels,
          updatedAt: new Date(config.updatedAt),
        },
      });
      return {
        tenantId: row.tenantId,
        daysBeforeDue: row.daysBeforeDue,
        channels: row.channels as VaccineReminderChannel[],
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }

  /** Tenant hatırlatma ayarını RLS kapsamlı getirir. */
  public async persistedGetTenantConfig(
    tenantId: string,
  ): Promise<VaccineReminderTenantConfig | null> {
    if (!this.prisma) return this.getTenantConfig(tenantId);
    return this.inTenant(tenantId, async (tx) => {
      const row = await tx.vaccineReminderTenantConfigRecord.findUnique({
        where: { tenantId },
      });
      return row
        ? {
            tenantId: row.tenantId,
            daysBeforeDue: row.daysBeforeDue,
            channels: row.channels as VaccineReminderChannel[],
            updatedAt: row.updatedAt.toISOString(),
          }
        : null;
    });
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.byDedupe.clear();
    this.counters.clear();
    this.tenantConfigs.clear();
  }
  private map(row: DbReminder): VaccineReminderRecord {
    return {
      ...row,
      channel: row.channel as VaccineReminderRecord["channel"],
      status: row.status as VaccineReminderRecord["status"],
      scheduledFor: row.scheduledFor.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      applicationSnapshot:
        row.applicationSnapshot as VaccineReminderRecord["applicationSnapshot"],
      stepSnapshot: row.stepSnapshot as VaccineReminderRecord["stepSnapshot"],
    };
  }
  private async inTenant<T>(
    tenantId: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;
      return callback(tx);
    });
  }
}
