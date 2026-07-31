/**
 * @file Vaccine card (aşı kartı) domain tipleri.
 * @module apps/api/common/vaccines/vaccine-card.types
 *
 * @description GOAL-052 aşı kartı domain modeli. Bir hastanın tüm
 * aşı takvimini derleyen pure fonksiyonlar içerir. Bu katman
 * service'e veri sağlar; DB/IO burada YOK (pure compute).
 *
 * Hesaplama kuralları (bkz. `docs/domain/CLINICAL_FLOWS.md`):
 * - `completed`  — tüm steps uygulandı, ek doz gerekmiyor.
 * - `upcoming`   — sıradaki tarih 0..`upcomingWindowDays` gün
 *                  içinde.
 * - `overdue`    — sıradaki tarih geçmiş.
 * - `not_started`— hiç uygulama yok.
 *
 * `nextDueDate` çözümleme önceliği:
 * 1) En son aktif/amended uygulamanın `nextDueDate`'i (booster).
 * 2) Sonraki uygulanmamış step'in tahmini tarihi
 *    (patient.birthDate + ageWeeks).
 * 3) Tüm steps tamam ve booster yoksa `null`.
 *
 * In-memory; production'a geçişte Prisma `VaccineCard` view
 * veya materialized view ile değiştirilecek (API sözleşmesi
 * sabit).
 *
 * @security Tenant bilgisi burada YOK; service katmanı
 *   actor.tenantId'den alır ve tüm sorguları tenant-scoped
 *   yapar.
 *
 * @since GOAL-052 (FAZ-5) aşı kartı core
 */

import type {
  Patient,
  VaccineApplication,
  VaccineCard,
  VaccineCardEntry,
  VaccineCardEntryStatus,
  VaccineCardOptions,
  VaccineProtocol,
  VaccineProtocolStep,
} from "@vetniva/contracts";

import { VACCINE_CARD_UPCOMING_WINDOW_DAYS } from "@vetniva/contracts";

import { toVaccineApplication } from "./vaccine-application.types.js";
import { toVaccineProtocol } from "./vaccine.types.js";

/** Bugünün UTC ISO datetime'ı (gün başlangıcı, 00:00:00Z). */
export function todayUtcIso(referenceIso?: string): string {
  const ref = referenceIso ? new Date(referenceIso) : new Date();
  if (Number.isNaN(ref.getTime())) {
    return new Date().toISOString();
  }
  const y = ref.getUTCFullYear();
  const m = String(ref.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ref.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T00:00:00.000Z`;
}

/** ISO datetime → UTC `YYYY-MM-DD` date string. */
export function toUtcDateString(isoDatetime: string): string {
  const d = new Date(isoDatetime);
  if (Number.isNaN(d.getTime())) return isoDatetime.slice(0, 10);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** İki ISO date arasındaki tam gün farkı (b - a). */
export function diffDaysUtc(aIso: string, bIso: string): number {
  const a = new Date(`${toUtcDateString(aIso)}T00:00:00.000Z`).getTime();
  const b = new Date(`${toUtcDateString(bIso)}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** ISO date + gün sayısı → yeni ISO date. Negatif gün kabul edilir. */
export function addDaysUtc(isoDate: string, days: number): string {
  const base = new Date(`${toUtcDateString(isoDate)}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Patient'ın doğum tarihi + step.ageWeeks'ten beklenen uygulama
 * tarihini (ISO date) üretir. birthDate null ise bugüne
 * dayandırılır (en kötü senaryo: klinik yaş bilmiyor).
 */
export function expectedStepDate(
  birthDate: string | null,
  step: VaccineProtocolStep,
  referenceIso: string,
): string {
  const base = birthDate ?? toUtcDateString(referenceIso);
  return addDaysUtc(base, step.ageWeeks * 7);
}

/** Status çözümle. */
export function resolveEntryStatus(args: {
  totalSteps: number;
  completedSteps: number;
  nextDueDate: string | null;
  referenceDate: string;
  upcomingWindowDays: number;
}): VaccineCardEntryStatus {
  const { totalSteps, completedSteps, nextDueDate, referenceDate, upcomingWindowDays } =
    args;

  if (completedSteps === 0) return "not_started";
  if (nextDueDate === null) {
    // Tüm step'ler uygulandı ve ek doz yok.
    return "completed";
  }
  const days = diffDaysUtc(referenceDate, nextDueDate);
  if (days < 0) return "overdue";
  if (days <= upcomingWindowDays) return "upcoming";
  // Geçmiş ama hâlâ pencere içinde değilse "upcoming" yerine
  // "completed" kabul etmiyoruz; bu durumda sırada bir sonraki
  // step var ama tarihi uzak. Klinik karar: bunu "upcoming"
  // yerine "completed" kabul edip etmemek klinik politikaya
  // bağlı; burada `upcoming` (pencere dışında) için status'a
  // yeni değer eklemek yerine, completedSteps < totalSteps
  // ise "upcoming" döneriz.
  return completedSteps < totalSteps ? "upcoming" : "upcoming";
}

/**
 * Bir protokol için uygulamaları adım eşlemesiyle grupla ve
 * `nextDueDate` çözümle.
 *
 * Mantık:
 * - Tüm aktif/amended uygulamaları step'lere dağıt (en eski
 *   adım önce doldurulur).
 * - Eğer tüm steps uygulandıysa: son aktif uygulamanın
 *   `nextDueDate`'i döner; yoksa `null` (booster yok).
 * - Eğer steps eksik: sonraki eksik step'in `ageWeeks`'inden
 *   tahmini tarih (doğum tarihine göre).
 */
export function resolveEntryNextDueDate(args: {
  steps: VaccineProtocolStep[];
  applications: VaccineApplication[];
  birthDate: string | null;
  referenceDate: string;
}): string | null {
  const { steps, applications, birthDate, referenceDate } = args;

  // Sadece aktif/amended uygulamaları say (cancelled atlanır).
  const valid = applications
    .filter((a) => a.status === "active" || a.status === "amended")
    .sort((a, b) => a.applicationDate.localeCompare(b.applicationDate));

  if (valid.length === 0) {
    // Hiç uygulama yoksa ilk step'in tahmini tarihi.
    const firstStep = steps[0];
    if (!firstStep) return null;
    return expectedStepDate(birthDate, firstStep, referenceDate);
  }

  // Öncelik: son aktif uygulamanın kendi `nextDueDate`'i
  // (kliniğin gerçek booster kararı). Boşsa tahmini step
  // tarihine düş.
  const last = valid[valid.length - 1];
  if (!last) return null;
  if (last.nextDueDate !== null) return last.nextDueDate;

  if (valid.length >= steps.length) {
    // Tüm steps uygulandı; ek doz tarihi yoksa null.
    return null;
  }

  // Steps eksik ve son uygulamada nextDueDate yoksa sıradaki
  // step için tahmini tarih.
  const nextStep = steps[valid.length];
  if (!nextStep) return null;
  return expectedStepDate(birthDate, nextStep, referenceDate);
}

/**
 * Tek bir protokol için kart girdisi üret.
 *
 * Not: tüm `applications` zaten tenant-scoped ve patient'a
 * ait olduğu varsayılır; service katmanı filtreler.
 */
export function buildCardEntry(args: {
  protocol: VaccineProtocol;
  applications: VaccineApplication[];
  patientBirthDate: string | null;
  options: VaccineCardOptions;
  referenceDate: string;
}): VaccineCardEntry {
  const { protocol, applications, patientBirthDate, options, referenceDate } =
    args;

  // Sıralı liste (en yeni üstte).
  const sorted = [...applications].sort((a, b) =>
    b.applicationDate.localeCompare(a.applicationDate),
  );

  const completed = applications.filter(
    (a) => a.status === "active" || a.status === "amended",
  ).length;

  const lastActiveOrAmended = sorted.find(
    (a) => a.status === "active" || a.status === "amended",
  );
  const lastAny = sorted[0] ?? null;

  const nextDueDate = resolveEntryNextDueDate({
    steps: protocol.steps,
    applications,
    birthDate: patientBirthDate,
    referenceDate,
  });

  const daysUntilDue =
    nextDueDate !== null ? diffDaysUtc(referenceDate, nextDueDate) : null;

  const status = resolveEntryStatus({
    totalSteps: protocol.steps.length,
    completedSteps: completed,
    nextDueDate,
    referenceDate,
    upcomingWindowDays:
      options.upcomingWindowDays ?? VACCINE_CARD_UPCOMING_WINDOW_DAYS,
  });

  return {
    protocol,
    applications: sorted,
    completedStepsCount: completed,
    totalStepsCount: protocol.steps.length,
    lastApplicationDate: lastAny?.applicationDate ?? null,
    lastApplicationBy: lastActiveOrAmended?.administeredBy ?? null,
    lastLot: lastAny?.lot ?? null,
    nextDueDate,
    daysUntilDue,
    status,
  };
}

/** Default options. */
export function defaultCardOptions(): VaccineCardOptions {
  return { upcomingWindowDays: VACCINE_CARD_UPCOMING_WINDOW_DAYS };
}

/** VaccineProtocol record → public VaccineProtocol yardımcısı. */
export function publicProtocol(rec: {
  id: string;
  tenantId: string;
  name: string;
  species: VaccineProtocol["species"];
  category: VaccineProtocol["category"];
  manufacturer: string | null;
  defaultDose: VaccineProtocol["defaultDose"];
  steps: VaccineProtocol["steps"];
  totalDurationMonths: number;
  isCore: boolean;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  archivedAt: string | null;
}): VaccineProtocol {
  return toVaccineProtocol(rec);
}

/** VaccineApplication record → public VaccineApplication yardımcısı. */
export function publicApplication(rec: Parameters<typeof toVaccineApplication>[0]): VaccineApplication {
  return toVaccineApplication(rec);
}

/** Patient record → public Patient yardımcısı (re-export bağımlılığı). */
export type { Patient };
