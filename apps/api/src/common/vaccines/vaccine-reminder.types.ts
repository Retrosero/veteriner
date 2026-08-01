/**
 * @file Vaccine reminder (aşı hatırlatma) domain tipleri.
 * @module apps/api/common/vaccines/vaccine-reminder.types
 *
 * @description GOAL-053 aşı hatırlatma domain modeli. Bir reminder
 * kaydı tenant kapsamında, bir aşı uygulamasına (application)
 * bağlıdır. Uygulama + protokol bilgisi üzerinden hesaplanan
 * `scheduledFor` tarihinde bildirim gönderilir.
 *
 * Domain modeli (in-memory; Prisma geçişinde API sözleşmesi sabit).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Fiziksel silme YOKTUR.
 *
 * @since GOAL-053 (FAZ-5) aşı hatırlatma core
 */

import type {
  VaccineApplication,
  VaccineProtocol,
  VaccineProtocolStep,
  VaccineReminderChannel,
  VaccineReminderStatus,
} from "@vetniva/contracts";

/** Hatırlatma yapılandırması (tenant başına override edilebilir). */
export interface VaccineReminderConfig {
  /**
   * Sonraki aşı tarihinden kaç gün önce hatırlatma gönderileceği.
   * Default: 7.
   */
  daysBeforeDue: number;
  /** Tenant için izinli kanallar. */
  channels: VaccineReminderChannel[];
}

/** Default config — service katmanı kullanır. */
export const DEFAULT_VACCINE_REMINDER_CONFIG: VaccineReminderConfig = {
  daysBeforeDue: 7,
  channels: ["sms", "in_app"],
};

/**
 * Persist edilmiş aşı hatırlatma kaydı.
 */
export interface VaccineReminderRecord {
  id: string;
  tenantId: string;
  /**
   * Bağlı olduğu aşı uygulaması ID. Cancel/Reschedule hook'ları
   * buradan tetiklenir.
   */
  applicationId: string;
  patientId: string;
  protocolId: string;
  /** Kanal (sms / email / in_app). */
  channel: VaccineReminderChannel;
  /**
   * Gönderim için planlanan an (ISO 8601). Gelecekte olmalı
   * (schedule anında); processDueReminders `now >= scheduledFor`
   * olanları işler.
   */
  scheduledFor: string;
  /**
   * Hatırlatmanın atıfta bulunduğu sonraki aşı tarihi (ISO date).
   * Snapshot amacıyla saklanır; uygulama amend edilirse
   * reschedule hook'u ile bu alan da güncellenir.
   */
  nextDueDate: string;
  status: VaccineReminderStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  /**
   * Aynı uygulama için birden fazla hatırlatma olabilir (farklı
   * kanallar). `dedupeKey` ile çift planlama engellenir.
   */
  dedupeKey: string;
  /**
   * Plan anındaki uygulama snapshot'ı. processDueReminders
   * sırasında uygulama durumunu kontrol etmek için kullanılır;
   * VaccineApplicationsService'e doğrudan bağımlılığı kırar
   * (circular import koruması) ve job çalışırken tutarlılık
   * sağlar.
   */
  applicationSnapshot: VaccineApplication | null;
  /**
   * Snapshot anındaki protokol step'ı (boosterIntervalDays vb.).
   * Protocol güncellenirse snapshot'taki step kullanılır
   * (mevcut takvimi bozmamak için).
   */
  stepSnapshot: VaccineProtocolStep | null;
}

/** Record → public VaccineReminder response objesi. */
export interface VaccineReminder {
  id: string;
  tenantId: string;
  applicationId: string;
  patientId: string;
  protocolId: string;
  channel: VaccineReminderChannel;
  scheduledFor: string;
  nextDueDate: string;
  status: VaccineReminderStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export function toVaccineReminder(rec: VaccineReminderRecord): VaccineReminder {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    applicationId: rec.applicationId,
    patientId: rec.patientId,
    protocolId: rec.protocolId,
    channel: rec.channel,
    scheduledFor: rec.scheduledFor,
    nextDueDate: rec.nextDueDate,
    status: rec.status,
    attempts: rec.attempts,
    lastError: rec.lastError,
    sentAt: rec.sentAt,
    createdAt: rec.createdAt,
  };
}

/**
 * Bir uygulama + step için sonraki hatırlatma zamanını hesaplar.
 * Mantık:
 * 1) `nextDueDate` (uygulamanın kendi alanı) varsa
 *    `nextDueDate - daysBeforeDue` döner.
 * 2) `nextDueDate` yoksa + step varsa
 *    `applicationDate + step.boosterIntervalDays` döner; bundan
 *    `daysBeforeDue` çıkarılır.
 * 3) Aksi halde `null` (hatırlatma planlanamaz).
 *
 * @param application Uygulama (nextDueDate + applicationDate).
 * @param step Protokol step'ı (boosterIntervalDays için).
 * @param daysBeforeDue Tenant config (default 7).
 * @returns ISO 8601 datetime; null ise planlanamaz.
 */
export function computeScheduledFor(args: {
  application: VaccineApplication;
  step: VaccineProtocolStep | null;
  daysBeforeDue: number;
}): string | null {
  const { application, step, daysBeforeDue } = args;
  if (daysBeforeDue < 1) return null;

  let dueMs: number | null = null;
  if (application.nextDueDate) {
    const parsed = new Date(
      `${application.nextDueDate}T00:00:00.000Z`,
    ).getTime();
    if (!Number.isNaN(parsed)) dueMs = parsed;
  }
  if (dueMs === null && step && step.boosterIntervalDays !== undefined) {
    const baseMs = new Date(application.applicationDate).getTime();
    if (!Number.isNaN(baseMs)) {
      dueMs = baseMs + step.boosterIntervalDays * 86_400_000;
    }
  }
  if (dueMs === null) return null;
  const scheduledMs = dueMs - daysBeforeDue * 86_400_000;
  if (Number.isNaN(scheduledMs)) return null;
  return new Date(scheduledMs).toISOString();
}

/**
 * Idempotency anahtarı üretir: application + kanal + zaman.
 * Aynı uygulama için birden fazla kanal hatırlatması planlanabilir;
 * her kanal ayrı kayıt, aynı kanal + zaman idempotent.
 */
export function buildVaccineReminderDedupeKey(
  applicationId: string,
  channel: VaccineReminderChannel,
  scheduledFor: string,
): string {
  return `${applicationId}|${channel}|${scheduledFor}`;
}

/**
 * Bir uygulamaya ait "completed" steps listesinden, son tamamlanan
 * step'ı bulur. Vaccine card ile uyumlu; burada yalnızca son step
 * gerekiyor (boosterIntervalDays source olarak).
 *
 * @param completedSteps Tamamlanmış step'lar (VaccineProtocolStep[]).
 * @returns Son step; yoksa null.
 */
export function pickLastStep(
  completedSteps: VaccineProtocolStep[],
): VaccineProtocolStep | null {
  if (completedSteps.length === 0) return null;
  const sorted = [...completedSteps].sort(
    (a, b) => (a.ageWeeks ?? 0) - (b.ageWeeks ?? 0),
  );
  return sorted[sorted.length - 1] ?? null;
}

/**
 * VaccineProtocol adım listesinden en uygun step'ı seçer.
 * Kural: `applicationDate`'e en yakın step (yaşça en yakın).
 *
 * @param protocol Uygulamanın bağlı olduğu protokol.
 * @param applicationDate ISO 8601 datetime.
 * @returns Step; protokol steps yoksa null.
 */
export function pickStepForApplication(
  protocol: VaccineProtocol,
  applicationDate: string,
): VaccineProtocolStep | null {
  if (!protocol.steps || protocol.steps.length === 0) return null;
  const appMs = new Date(applicationDate).getTime();
  if (Number.isNaN(appMs)) return protocol.steps[0] ?? null;
  // En küçük ageWeeks farkı (büyük step = rapel).
  const sorted = [...protocol.steps].sort((a, b) => a.ageWeeks - b.ageWeeks);
  return sorted[sorted.length - 1] ?? null;
}
