/**
 * @file Anestezi takip (anesthesia) API sözleşmesi.
 * @module @vetniva/contracts/anesthesia
 *
 * @description GOAL-082 (FAZ-8) ameliyat içi anestezi takip için
 * Zod şemaları + tipler. Bir ameliyat planına (surgeryPlanId) bağlı
 * tek bir anestezi kaydı; alt kayıtlar (ilaç, vital, komplikasyon,
 * personel) append-only zaman-bazlı tutulur.
 *
 * Kapsam:
 * - Protokol (protocol) — anestezi protokolü etiketi (string).
 * - İlaçlar (medications) — anestezi sırasında uygulanan ilaçlar.
 * - Vital kayıtları (vitals) — zamana bağlı vital bulgu girişleri.
 * - Komplikasyonlar (complications) — oluşan komplikasyonlar.
 * - Sorumlu personel (staff) — atanan anestezist + teknisyen.
 *
 * Yaşam döngüsü:
 * - `draft`     — oluşturulmuş; alt kayıtlar eklenebilir.
 * - `finalized` — kilitli; alt kayıt eklenemez (append-only).
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-082 (FAZ-8) anestezi takip core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * --------------------------------------------------------------------------
 */

export const anesthesiaStatusSchema = z.enum(["draft", "finalized"]);
export type AnesthesiaStatus = z.infer<typeof anesthesiaStatusSchema>;

/** İlaç uygulama yolu. */
export const anesthesiaMedicationRouteSchema = z.enum([
  "iv",
  "im",
  "sc",
  "po",
  "inhalation",
  "topical",
  "other",
]);
export type AnesthesiaMedicationRoute = z.infer<
  typeof anesthesiaMedicationRouteSchema
>;

/** Vital bulgu türü. */
export const anesthesiaVitalKindSchema = z.enum([
  "heart_rate",
  "respiratory_rate",
  "spo2",
  "temperature",
  "blood_pressure_systolic",
  "blood_pressure_diastolic",
  "etco2",
  "other",
]);
export type AnesthesiaVitalKind = z.infer<typeof anesthesiaVitalKindSchema>;

/** Komplikasyon şiddeti. */
export const anesthesiaComplicationSeveritySchema = z.enum([
  "mild",
  "moderate",
  "severe",
]);
export type AnesthesiaComplicationSeverity = z.infer<
  typeof anesthesiaComplicationSeveritySchema
>;

/** Personel rolü. */
export const anesthesiaStaffRoleSchema = z.enum([
  "anesthesiologist",
  "technician",
  "surgeon",
  "assistant",
]);
export type AnesthesiaStaffRole = z.infer<typeof anesthesiaStaffRoleSchema>;

/* --------------------------------------------------------------------------
 * Yeni anestezi kaydı
 * --------------------------------------------------------------------------
 */

/**
 * Yeni anestezi takip kaydı.
 * - `surgeryPlanId` zorunlu (surgery_plan.id; in_progress olmalı).
 * - `patientId` zorunlu (Patient.id UUID; plan ile aynı olmalı).
 * - `protocol` zorunlu (anestezi protokolü etiketi; ör. "TIVA",
 *   "inhalasyon", "epidural"). Serbest metin; ileride ayrı tablo.
 * - `protocolNotes` opsiyonel (serbest; doz/ilaç seçimi açıklaması).
 * - `inductionAt` opsiyonel (indüksiyon zamanı ISO datetime).
 * - `notes` opsiyonel (ek notlar).
 */
export const anesthesiaCreateInputSchema = z.object({
  surgeryPlanId: z.string().min(1).max(100),
  patientId: z.string().uuid(),
  protocol: z.string().min(1).max(200),
  protocolNotes: z.string().max(2000).optional(),
  inductionAt: z.string().datetime().optional(),
  notes: z.string().max(4000).optional(),
});
export type AnesthesiaCreateInput = z.infer<typeof anesthesiaCreateInputSchema>;

/* --------------------------------------------------------------------------
 * Alt kayıt inputları
 * --------------------------------------------------------------------------
 */

/**
 * İlaç uygulama kaydı ekleme.
 * - `medicationName` zorunlu (serbest; ör. "Propofol", "Isoflurane").
 * - `dose` zorunlu (serbest; ör. "10mg", "0.5ml", "2%"). Birim
 *   standartlaştırma MVP'de zorunlu değil; ilaç kartına bağlanırsa
 *   sonradan numeric alan eklenebilir.
 * - `route` zorunlu (iv/im/sc/po/inhalation/topical/other).
 * - `administeredAt` zorunlu (ISO datetime).
 * - `administeredByUserId` zorunlu (user id).
 * - `notes` opsiyonel.
 */
export const anesthesiaMedicationInputSchema = z.object({
  medicationName: z.string().min(1).max(200),
  dose: z.string().min(1).max(64),
  route: anesthesiaMedicationRouteSchema,
  administeredAt: z.string().datetime(),
  administeredByUserId: z.string().min(1).max(100),
  notes: z.string().max(2000).optional(),
});
export type AnesthesiaMedicationInput = z.infer<
  typeof anesthesiaMedicationInputSchema
>;

/**
 * Vital bulgu kaydı ekleme.
 * - `kind` zorunlu (vital türü).
 * - `value` zorunlu (string; numerik normalize ileride).
 * - `unit` zorunlu (örn. "bpm", "°C", "mmHg", "%").
 * - `observedAt` zorunlu (ISO datetime).
 * - `observedByUserId` zorunlu.
 * - `notes` opsiyonel.
 */
export const anesthesiaVitalInputSchema = z.object({
  kind: anesthesiaVitalKindSchema,
  value: z.string().min(1).max(64),
  unit: z.string().min(1).max(16),
  observedAt: z.string().datetime(),
  observedByUserId: z.string().min(1).max(100),
  notes: z.string().max(2000).optional(),
});
export type AnesthesiaVitalInput = z.infer<typeof anesthesiaVitalInputSchema>;

/**
 * Komplikasyon kaydı ekleme.
 * - `description` zorunlu.
 * - `severity` zorunlu (mild/moderate/severe).
 * - `occurredAt` zorunlu (ISO datetime).
 * - `resolvedAt` opsiyonel.
 * - `reportedByUserId` zorunlu.
 * - `action` opsiyonel (müdahale açıklaması).
 */
export const anesthesiaComplicationInputSchema = z.object({
  description: z.string().min(1).max(2000),
  severity: anesthesiaComplicationSeveritySchema,
  occurredAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
  reportedByUserId: z.string().min(1).max(100),
  action: z.string().max(2000).optional(),
});
export type AnesthesiaComplicationInput = z.infer<
  typeof anesthesiaComplicationInputSchema
>;

/**
 * Personel atama.
 * - `userId` zorunlu.
 * - `role` zorunlu (anesthesiologist/technician/surgeon/assistant).
 * - `assignedAt` zorunlu (ISO datetime).
 * - `endedAt` opsiyonel (görev değişimi / çıkış).
 * - `notes` opsiyonel.
 */
export const anesthesiaStaffInputSchema = z.object({
  userId: z.string().min(1).max(100),
  role: anesthesiaStaffRoleSchema,
  assignedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type AnesthesiaStaffInput = z.infer<typeof anesthesiaStaffInputSchema>;

/** Finalize isteği. */
export const anesthesiaFinalizeInputSchema = z.object({
  recoveryAt: z.string().datetime().optional(),
  notes: z.string().max(4000).optional(),
});
export type AnesthesiaFinalizeInput = z.infer<
  typeof anesthesiaFinalizeInputSchema
>;

/* --------------------------------------------------------------------------
 * API response şemaları
 * --------------------------------------------------------------------------
 */

export const anesthesiaSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  surgeryPlanId: z.string(),
  patientId: z.string().uuid(),
  protocol: z.string(),
  protocolNotes: z.string().nullable(),
  status: anesthesiaStatusSchema,
  inductionAt: z.string().datetime().nullable(),
  recoveryAt: z.string().datetime().nullable(),
  finalizedAt: z.string().datetime().nullable(),
  finalizedBy: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type Anesthesia = z.infer<typeof anesthesiaSchema>;

export const anesthesiaMedicationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  anesthesiaId: z.string(),
  medicationName: z.string(),
  dose: z.string(),
  route: anesthesiaMedicationRouteSchema,
  administeredAt: z.string().datetime(),
  administeredByUserId: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AnesthesiaMedication = z.infer<typeof anesthesiaMedicationSchema>;

export const anesthesiaVitalSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  anesthesiaId: z.string(),
  kind: anesthesiaVitalKindSchema,
  value: z.string(),
  unit: z.string(),
  observedAt: z.string().datetime(),
  observedByUserId: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AnesthesiaVital = z.infer<typeof anesthesiaVitalSchema>;

export const anesthesiaComplicationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  anesthesiaId: z.string(),
  description: z.string(),
  severity: anesthesiaComplicationSeveritySchema,
  occurredAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  reportedByUserId: z.string(),
  action: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AnesthesiaComplication = z.infer<
  typeof anesthesiaComplicationSchema
>;

export const anesthesiaStaffSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  anesthesiaId: z.string(),
  userId: z.string(),
  role: anesthesiaStaffRoleSchema,
  assignedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AnesthesiaStaff = z.infer<typeof anesthesiaStaffSchema>;

/** Detay response — anesthesia + tüm alt kayıtlar. */
export const anesthesiaDetailSchema = z.object({
  anesthesia: anesthesiaSchema,
  medications: z.array(anesthesiaMedicationSchema),
  vitals: z.array(anesthesiaVitalSchema),
  complications: z.array(anesthesiaComplicationSchema),
  staff: z.array(anesthesiaStaffSchema),
});
export type AnesthesiaDetail = z.infer<typeof anesthesiaDetailSchema>;

/** Liste filtreleri. */
export const anesthesiaFiltersSchema = z.object({
  status: anesthesiaStatusSchema.optional(),
  patientId: z.string().uuid().optional(),
  surgeryPlanId: z.string().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type AnesthesiaFilters = z.infer<typeof anesthesiaFiltersSchema>;

/** Liste response şeması. */
export const anesthesiaListResponseSchema = z.object({
  items: z.array(anesthesiaSchema),
  total: z.number().int().nonnegative(),
});
export type AnesthesiaListResponse = z.infer<
  typeof anesthesiaListResponseSchema
>;
