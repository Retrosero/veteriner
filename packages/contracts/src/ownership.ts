/**
 * @file Ownership history (sahiplik geçmişi) API sözleşmesi.
 * @module @vetniva/contracts/ownership
 *
 * @description GOAL-022 hayvan sahiplik geçmişi API sözleşmesi. Zod
 * şemaları + tipler. Backend (request/response doğrulama) ve frontend
 * (form/typing) aynı kaynaktan tüketir.
 *
 * İş kuralları:
 * - Bir hayvanın aktif sahiplik kaydı en fazla bir tane olabilir.
 * - Yeni kayıt oluşturulduğunda eski aktif kaydın `endDate`'i set
 *   edilir (append-only; fiziksel silme yok).
 * - Her transfer için `reason` zorunludur.
 * - Aktif kayıtta `endDate` null'dır.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip.
 *
 * @since GOAL-022 (FAZ-2) sahiplik geçmişi core
 */

import { z } from "zod";

/**
 * Sahiplik değişikliği nedeni. Klinik dışı/alımsatım senaryoları
 * için ortak sözlük. Yeni değer eklemek geriye dönük uyumlu kabul
 * edilir; silmek/kısaltmak breaking change'dir.
 */
export const ownershipReasonSchema = z.enum([
  /** Hayvanın ilk kaydı (yeni patient). */
  "initial",
  /** Satın alma/devralma. */
  "transfer",
  /** Hibe. */
  "gift",
  /** Barınak/kurtarma. */
  "rescue",
  /** Sahibinin vefatı/terk. */
  "abandonment",
  /** Diğer (serbest metin ile). */
  "other",
]);
export type OwnershipReason = z.infer<typeof ownershipReasonSchema>;

/** Yeni sahiplik kaydı oluşturma isteği. */
export const ownershipTransferInputSchema = z.object({
  /** Yeni sahip (owner) ID. */
  newOwnerId: z.string().uuid(),
  /**
   * Değişiklik nedeni. Serbest metin `otherNote` ile birlikte
   * kullanılabilir.
   */
  reason: ownershipReasonSchema,
  /** `reason=other` ise serbest açıklama. */
  otherNote: z.string().max(500).optional(),
  /**
   * Yeni kaydın başlangıç tarihi (ISO 8601). Verilmezse sunucu
   * zamanı kullanılır.
   */
  startDate: z
    .string()
    .datetime({ offset: true })
    .optional(),
});
export type OwnershipTransferInput = z.infer<typeof ownershipTransferInputSchema>;

/** API response şeması (sahiplik kaydı). */
export const ownershipRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  patientId: z.string().uuid(),
  ownerId: z.string().uuid(),
  /** ISO 8601. */
  startDate: z.string().datetime({ offset: true }),
  /** ISO 8601; null = aktif kayıt. */
  endDate: z.string().datetime({ offset: true }).nullable(),
  reason: ownershipReasonSchema,
  otherNote: z.string().nullable(),
  /** Transferi yapan kullanıcı ID; ilk kayıtta null olabilir. */
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime({ offset: true }),
});
export type OwnershipRecord = z.infer<typeof ownershipRecordSchema>;

/** Liste response şeması. */
export const ownershipListResponseSchema = z.object({
  items: z.array(ownershipRecordSchema),
  total: z.number().int().nonnegative(),
});
export type OwnershipListResponse = z.infer<typeof ownershipListResponseSchema>;
