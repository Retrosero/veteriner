/**
 * @file Operasyon notu (operation note) API sözleşmesi.
 * @module @vetniva/contracts/operation-note
 *
 * @description GOAL-083 (FAZ-8) ameliyat operasyon notu + ekip +
 * kullanılan malzeme kayıtları. Bir ameliyat planına (surgeryPlanId)
 * bağlı tek bir operasyon notu; alt kayıtlar (ekip, malzeme)
 * append-only zaman-bazlı tutulur.
 *
 * Kapsam:
 * - Prosedür (procedure) — ana işlem açıklaması.
 * - Bulgular (findings) — operasyon sırasında gözlem.
 * - Komplikasyon (complicationsText) — operasyon komplikasyonları.
 * - Teknik (technique) — cerrahi teknik.
 * - Ekip (team) — lead_surgeon / assistant_surgeon / anesthesiologist
 *   / technician / nurse.
 * - Kullanılan malzemeler (materials) — product bazında miktar.
 *
 * Yaşam döngüsü:
 * - `draft`     — alt kayıtlar (ekip, malzeme) eklenebilir.
 * - `finalized` — append-only; alt kayıt eklenemez. Finalize
 *   sonrası her material için bir `clinical_use` stock movement
 *   oluşturulur (append-only, ters kayıt ile düzeltme).
 * - `amended`   — finalize sonrası düzeltme yapıldı (amendment).
 *   Eski sürüm korunur; yeni revision oluşturulur.
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-083 (FAZ-8) operasyon notu ve kullanılan malzemeler core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * --------------------------------------------------------------------------
 */

export const operationNoteStatusSchema = z.enum([
  "draft",
  "finalized",
  "amended",
]);
export type OperationNoteStatus = z.infer<typeof operationNoteStatusSchema>;

/** Ekip rolü. */
export const operationNoteTeamRoleSchema = z.enum([
  "lead_surgeon",
  "assistant_surgeon",
  "anesthesiologist",
  "technician",
  "nurse",
  "other",
]);
export type OperationNoteTeamRole = z.infer<typeof operationNoteTeamRoleSchema>;

/* --------------------------------------------------------------------------
 * Yeni operasyon notu
 * --------------------------------------------------------------------------
 */

/**
 * Yeni operasyon notu.
 * - `surgeryPlanId` zorunlu (surgery_plan.id; in_progress olmalı).
 * - `patientId` zorunlu (Patient.id UUID; plan ile aynı olmalı).
 * - `procedure` zorunlu (ana işlem; ör. "Ovariohysterectomy").
 * - `findings` opsiyonel.
 * - `complicationsText` opsiyonel (serbest metin).
 * - `technique` opsiyonel.
 * - `closureNotes` opsiyonel.
 * - `estimatedBloodLoss` opsiyonel (string; ör. "50ml").
 */
export const operationNoteCreateInputSchema = z.object({
  surgeryPlanId: z.string().min(1).max(100),
  patientId: z.string().uuid(),
  procedure: z.string().min(1).max(500),
  findings: z.string().max(8000).optional(),
  complicationsText: z.string().max(8000).optional(),
  technique: z.string().max(8000).optional(),
  closureNotes: z.string().max(4000).optional(),
  estimatedBloodLoss: z.string().max(64).optional(),
});
export type OperationNoteCreateInput = z.infer<
  typeof operationNoteCreateInputSchema
>;

/** Operasyon notu kısmi güncelleme (yalnızca draft). */
export const operationNoteUpdateInputSchema = z
  .object({
    procedure: z.string().min(1).max(500).optional(),
    findings: z.string().max(8000).nullable().optional(),
    complicationsText: z.string().max(8000).nullable().optional(),
    technique: z.string().max(8000).nullable().optional(),
    closureNotes: z.string().max(4000).nullable().optional(),
    estimatedBloodLoss: z.string().max(64).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type OperationNoteUpdateInput = z.infer<
  typeof operationNoteUpdateInputSchema
>;

/* --------------------------------------------------------------------------
 * Alt kayıt inputları
 * --------------------------------------------------------------------------
 */

/**
 * Ekip üyesi ekleme.
 * - `userId` zorunlu (user id).
 * - `role` zorunlu (lead_surgeon/assistant_surgeon/...).
 * - `assignedAt` zorunlu (ISO datetime).
 * - `endedAt` opsiyonel.
 * - `notes` opsiyonel.
 */
export const operationNoteTeamInputSchema = z.object({
  userId: z.string().min(1).max(100),
  role: operationNoteTeamRoleSchema,
  assignedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type OperationNoteTeamInput = z.infer<
  typeof operationNoteTeamInputSchema
>;

/**
 * Kullanılan malzeme ekleme.
 * - `productId` zorunlu.
 * - `quantity` zorunlu (decimal string, pozitif; çıkış finalize'da
 *   işaretlenir).
 * - `unit` zorunlu (örn. "adet", "ml", "mg", "tablet").
 * - `usedAt` zorunlu (ISO datetime).
 * - `usedByUserId` zorunlu.
 * - `lotId` opsiyonel.
 * - `notes` opsiyonel.
 */
export const operationNoteMaterialInputSchema = z.object({
  productId: z.string().min(1).max(100),
  // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden miktar doğrulamasıdır.
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/, {
    message: "quantity pozitif decimal string olmalı (4 ondalık)",
  }),
  unit: z.string().min(1).max(16),
  usedAt: z.string().datetime(),
  usedByUserId: z.string().min(1).max(100),
  lotId: z.string().min(1).max(100).optional(),
  notes: z.string().max(2000).optional(),
});
export type OperationNoteMaterialInput = z.infer<
  typeof operationNoteMaterialInputSchema
>;

/** Finalize isteği. */
export const operationNoteFinalizeInputSchema = z.object({
  findings: z.string().max(8000).optional(),
  complicationsText: z.string().max(8000).optional(),
  technique: z.string().max(8000).optional(),
  closureNotes: z.string().max(4000).optional(),
  estimatedBloodLoss: z.string().max(64).optional(),
  notes: z.string().max(4000).optional(),
});
export type OperationNoteFinalizeInput = z.infer<
  typeof operationNoteFinalizeInputSchema
>;

/** Amendment (finalize sonrası düzeltme) isteği. */
export const operationNoteAmendInputSchema = z.object({
  reason: z.string().min(1).max(2000),
  notes: z.string().max(4000).optional(),
});
export type OperationNoteAmendInput = z.infer<
  typeof operationNoteAmendInputSchema
>;

/* --------------------------------------------------------------------------
 * API response şemaları
 * --------------------------------------------------------------------------
 */

export const operationNoteSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  surgeryPlanId: z.string(),
  patientId: z.string().uuid(),
  status: operationNoteStatusSchema,
  procedure: z.string(),
  findings: z.string().nullable(),
  complicationsText: z.string().nullable(),
  technique: z.string().nullable(),
  closureNotes: z.string().nullable(),
  estimatedBloodLoss: z.string().nullable(),
  finalizedAt: z.string().datetime().nullable(),
  finalizedBy: z.string().nullable(),
  amendsNoteId: z.string().nullable(),
  amendmentReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type OperationNote = z.infer<typeof operationNoteSchema>;

export const operationNoteTeamSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  operationNoteId: z.string(),
  userId: z.string(),
  role: operationNoteTeamRoleSchema,
  assignedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type OperationNoteTeam = z.infer<typeof operationNoteTeamSchema>;

export const operationNoteMaterialSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  operationNoteId: z.string(),
  productId: z.string(),
  quantity: z.string(),
  unit: z.string(),
  usedAt: z.string().datetime(),
  usedByUserId: z.string(),
  lotId: z.string().nullable(),
  notes: z.string().nullable(),
  /** Finalize sonrası oluşturulan stock movement id. */
  stockMovementId: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type OperationNoteMaterial = z.infer<typeof operationNoteMaterialSchema>;

/** Detay response — operation note + alt kayıtlar. */
export const operationNoteDetailSchema = z.object({
  operationNote: operationNoteSchema,
  team: z.array(operationNoteTeamSchema),
  materials: z.array(operationNoteMaterialSchema),
});
export type OperationNoteDetail = z.infer<typeof operationNoteDetailSchema>;

/** Liste filtreleri. */
export const operationNoteFiltersSchema = z.object({
  status: operationNoteStatusSchema.optional(),
  patientId: z.string().uuid().optional(),
  surgeryPlanId: z.string().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type OperationNoteFilters = z.infer<typeof operationNoteFiltersSchema>;

/** Liste response şeması. */
export const operationNoteListResponseSchema = z.object({
  items: z.array(operationNoteSchema),
  total: z.number().int().nonnegative(),
});
export type OperationNoteListResponse = z.infer<
  typeof operationNoteListResponseSchema
>;
