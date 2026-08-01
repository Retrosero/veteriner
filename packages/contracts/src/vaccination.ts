/**
 * @file Vaccination (aşı uygulama kaydı) API sözleşmesi.
 * @module @vetniva/contracts/vaccination
 *
 * @description GOAL-051 aşı uygulama kaydı API sözleşmesi. Zod
 * şemaları + tipler. Backend (request/response doğrulama) ve
 * frontend (form/typing) aynı kaynaktan tüketir.
 *
 * Bir aşı uygulama kaydı, bir hayvana uygulanan aşının klinik
 * kaydıdır. Hasta + aşı + protokol + lot + doz + uygulayan
 * veteriner + tarih + sonraki tarih alanlarından oluşur.
 *
 * Düzeltme/iptal politikası:
 * - Fiziksel silme YOKTUR (klinik kayıt politikası).
 * - Tamamen iptal gerekirse `cancel` (status='cancelled') ile
 *   iptal edilir; kayıt korunur.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip. Tenant
 *   bilgisi sözleşmede taşınmaz; backend actor.tenantId'den
 *   alınır.
 * @since GOAL-051 (FAZ-5) aşı uygulama kaydı core
 */

import { z } from "zod";

/** ISO 8601 datetime regex (Z veya ±HH:MM). */
const ISO_DATETIME_REGEX =
  // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, tüm tekrarlar sabit/üst sınırlı ISO-8601 doğrulamasıdır.
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Aşı uygulama kaydı durumu.
 * - `administered` — uygulandı, geçerli kayıt.
 * - `scheduled`   — henüz uygulanmadı, planlanmış.
 * - `cancelled`   — iptal edildi.
 * - `overdue`     — türetilmiş: sonraki tarih geçmiş, henüz uygulanmamış.
 */
export const vaccinationStatusSchema = z.enum([
  "administered",
  "scheduled",
  "cancelled",
  "overdue",
]);
export type VaccinationStatus = z.infer<typeof vaccinationStatusSchema>;

/**
 * Yeni aşı uygulama kaydı oluşturma isteği.
 * - `patientId` zorunlu: hayvan ID.
 * - `protocolId` zorunlu: hangi protokolün uygulandığı.
 * - `vaccineName` zorunlu: uygulanan aşının adı (protokol adımından gelir).
 * - `dose` zorunlu: uygulanan doz (string, birim serbest; ör. "1 ml").
 * - `lotNumber` zorunlu: lot kodu.
 * - `manufacturer` opsiyonel: üretici.
 * - `administeredAt` opsiyonel; yoksa `now()`.
 * - `notes` opsiyonel serbest not.
 */
export const vaccinationCreateInputSchema = z.object({
  patientId: z.string().min(1).max(100),
  protocolId: z.string().min(1).max(100),
  vaccineName: z.string().min(1).max(200),
  dose: z.string().min(1).max(100),
  lotNumber: z.string().min(1).max(100),
  manufacturer: z.string().max(200).optional(),
  administeredAt: z.string().regex(ISO_DATETIME_REGEX).optional(),
  notes: z.string().max(2000).optional(),
});
export type VaccinationCreateInput = z.infer<
  typeof vaccinationCreateInputSchema
>;

/** Aşı uygulama kaydı iptal isteği. */
export const vaccinationCancelInputSchema = z.object({
  /** İptal gerekçesi (audit için). */
  reason: z.string().min(1).max(2000),
});
export type VaccinationCancelInput = z.infer<
  typeof vaccinationCancelInputSchema
>;

/** API response şeması. */
export const vaccinationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  patientId: z.string(),
  veterinarianId: z.string(),
  protocolId: z.string(),
  vaccineName: z.string(),
  dose: z.string(),
  lotNumber: z.string(),
  manufacturer: z.string().nullable(),
  administeredAt: z.string().datetime(),
  nextDueAt: z.string().datetime().nullable(),
  status: vaccinationStatusSchema,
  notes: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  cancelledAt: z.string().datetime().nullable(),
  cancellationReason: z.string().nullable(),
});
export type Vaccination = z.infer<typeof vaccinationSchema>;

/** Liste filtreleri. */
export const vaccinationFiltersSchema = z.object({
  patientId: z.string().optional(),
  protocolId: z.string().optional(),
  status: vaccinationStatusSchema.optional(),
  /** ISO 8601 datetime (UTC) — administeredAt >= from. */
  from: z.string().regex(ISO_DATETIME_REGEX).optional(),
  /** ISO 8601 datetime (UTC) — administeredAt <= to. */
  to: z.string().regex(ISO_DATETIME_REGEX).optional(),
});
export type VaccinationFilters = z.infer<typeof vaccinationFiltersSchema>;

/** Liste response şeması. */
export const vaccinationListResponseSchema = z.object({
  items: z.array(vaccinationSchema),
  total: z.number().int().nonnegative(),
});
export type VaccinationListResponse = z.infer<
  typeof vaccinationListResponseSchema
>;
