/**
 * @file Vaccine application (aşı uygulama) API sözleşmesi.
 * @module @vetniva/contracts/vaccine-application
 *
 * @description GOAL-051 aşı uygulama kaydı API sözleşmesi. Zod
 * şemaları + tipler. Backend (request/response doğrulama) ve
 * frontend (form/typing) aynı kaynaktan tüketir.
 *
 * Bir aşı uygulama kaydı, bir hayvana (patient) uygulanan aşının
 * klinik kaydıdır. Hayvan + aşı + lot + SKT + doz + uygulayan
 * veteriner + tarih + sonraki tarih zorunludur. Uygulama
 * anında stok düşümü aynı transaction içinde yapılır (aşı
 * kaydı ve stok hareketi atomik).
 *
 * Düzeltme/iptal politikası:
 * - Fiziksel silme YOKTUR (klinik kayıt politikası).
 * - Hatalı uygulama `amend` (amendment) ile düzeltilir; önceki
 *   kayıt üzerinde `amendedAt` / `amendedBy` set edilir ve
 *   amendment zinciri tutulur.
 * - Tamamen iptal gerekirse `cancel` (status='cancelled') ile
 *   iptal edilir; stok düşümü ters kayıt ile geri alınır.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip. Tenant
 *   bilgisi sözleşmede taşınmaz; backend actor.tenantId'den
 *   alınır.
 * @since GOAL-051 (FAZ-5) aşı uygulama kaydı core
 */

import { z } from "zod";

import { vaccineDoseSchema } from "./vaccine.js";

/** ISO 8601 datetime regex (Z veya ±HH:MM). */
const ISO_DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/** ISO `YYYY-MM-DD` formatı. */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Aşı uygulama kaydı durumu.
 * - `active`     — uygulandı, geçerli kayıt.
 * - `amended`    — sonradan düzeltildi (amendment zinciri var).
 * - `cancelled`  — iptal edildi; stok düşümü ters kayıt ile alındı.
 */
export const vaccineApplicationStatusSchema = z.enum([
  "active",
  "amended",
  "cancelled",
]);
export type VaccineApplicationStatus = z.infer<
  typeof vaccineApplicationStatusSchema
>;

/**
 * Aşı lotu bilgisi. SKT (son kullanma tarihi) zorunlu; lot
 * string zorunlu (üretici kodu). Stok düşümü bu lot üzerinden
 * yapılır.
 */
export const vaccineLotInfoSchema = z.object({
  /** Lot kodu (üretici/dağıtıcı verisi). */
  lot: z.string().min(1).max(100),
  /** Son kullanma tarihi (ISO `YYYY-MM-DD`). */
  expiryDate: z.string().regex(ISO_DATE_REGEX),
  /** Stok ürünü ID. Faz 6 stok modülü ile referanslanacak. */
  stockProductId: z.string().min(1).max(100),
});
export type VaccineLotInfo = z.infer<typeof vaccineLotInfoSchema>;

/**
 * Yeni aşı uygulama kaydı oluşturma isteği.
 * - `patientId` zorunlu: hayvan ID.
 * - `protocolId` zorunlu: uygulanan aşı protokolü ID.
 * - `lot` zorunlu: hangi lot'tan düşüleceği.
 * - `dose` opsiyonel; yoksa protokolün `defaultDose`'u kullanılır.
 * - `administeredBy` opsiyonel; yoksa actor.actorId kullanılır.
 * - `applicationDate` zorunlu (ISO datetime UTC).
 * - `nextDueDate` opsiyonel (ISO date); sonraki booster/rapel.
 * - `notes` opsiyonel serbest not.
 *
 * Service katmanı:
 * - protocol + patient aynı tenant'ta mı (cross-tenant → 404).
 * - lot SKT'si geçmiş mi (evet → 422 VET-VACC-0002).
 * - lot yeterli stok var mı (yok → 422 VET-VACC-0003).
 * - aşı kaydı + stok düşümü atomik.
 */
export const vaccineApplicationCreateInputSchema = z.object({
  patientId: z.string().min(1).max(100),
  protocolId: z.string().min(1).max(100),
  lot: vaccineLotInfoSchema,
  dose: vaccineDoseSchema.optional(),
  administeredBy: z.string().min(1).max(100).optional(),
  applicationDate: z.string().regex(ISO_DATETIME_REGEX),
  nextDueDate: z
    .string()
    .regex(ISO_DATE_REGEX)
    .optional(),
  notes: z.string().max(2000).optional(),
});
export type VaccineApplicationCreateInput = z.infer<
  typeof vaccineApplicationCreateInputSchema
>;

/**
 * Aşı uygulama kaydı düzeltme (amendment) isteği. Yalnızca
 * klinik olarak yanlış girilen alanlar düzeltilebilir: doz,
 * sonraki tarih, lot, notlar. `patientId` / `protocolId` /
 * `applicationDate` değiştirilemez; bunlar için iptal +
 * yeniden kayıt yapılmalıdır.
 */
export const vaccineApplicationAmendInputSchema = z.object({
  dose: vaccineDoseSchema.optional(),
  nextDueDate: z
    .string()
    .regex(ISO_DATE_REGEX)
    .optional(),
  notes: z.string().max(2000).optional(),
  /** Amendment gerekçesi (audit için). */
  reason: z.string().min(1).max(2000),
});
export type VaccineApplicationAmendInput = z.infer<
  typeof vaccineApplicationAmendInputSchema
>;

/** Aşı uygulama kaydı iptal isteği. */
export const vaccineApplicationCancelInputSchema = z.object({
  /** İptal gerekçesi (audit için). */
  reason: z.string().min(1).max(2000),
});
export type VaccineApplicationCancelInput = z.infer<
  typeof vaccineApplicationCancelInputSchema
>;

/** API response şeması. */
export const vaccineApplicationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  patientId: z.string(),
  protocolId: z.string(),
  lot: vaccineLotInfoSchema,
  dose: vaccineDoseSchema.nullable(),
  administeredBy: z.string(),
  applicationDate: z.string().datetime(),
  nextDueDate: z.string().nullable(),
  notes: z.string().nullable(),
  status: vaccineApplicationStatusSchema,
  /** İlk oluşturma zamanı. */
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  /** Son güncelleme zamanı (amend dahil). */
  updatedAt: z.string().datetime(),
  /** Amendment zamanı; null = henüz düzeltilmedi. */
  amendedAt: z.string().datetime().nullable(),
  amendedBy: z.string().nullable(),
  /** İptal zamanı; null = aktif. */
  cancelledAt: z.string().datetime().nullable(),
  cancellationReason: z.string().nullable(),
  /** Stok düşüm/geri alma hareket ID listesi. */
  stockMovementIds: z.array(z.string()),
});
export type VaccineApplication = z.infer<typeof vaccineApplicationSchema>;

/** Liste filtreleri. */
export const vaccineApplicationFiltersSchema = z.object({
  patientId: z.string().optional(),
  protocolId: z.string().optional(),
  status: vaccineApplicationStatusSchema.optional(),
  /** ISO 8601 datetime (UTC) — applicationDate >= from. */
  from: z.string().regex(ISO_DATETIME_REGEX).optional(),
  /** ISO 8601 datetime (UTC) — applicationDate <= to. */
  to: z.string().regex(ISO_DATETIME_REGEX).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type VaccineApplicationFilters = z.infer<
  typeof vaccineApplicationFiltersSchema
>;

/** Liste response şeması. */
export const vaccineApplicationListResponseSchema = z.object({
  items: z.array(vaccineApplicationSchema),
  total: z.number().int().nonnegative(),
});
export type VaccineApplicationListResponse = z.infer<
  typeof vaccineApplicationListResponseSchema
>;
