/**
 * @file KVKK ve veri yaşam döngüsü sözleşmesi.
 * @module @vetniva/contracts/kvkk
 *
 * @description GOAL-126 (FAZ-12) KVKK ve UK GDPR uyumlu veri
 * yaşam döngüsü endpoint'leri için paylaşılan Zod şemaları ve
 * tipler. Backend (request/response doğrulama) ve frontend
 * (form/typing) aynı kaynaktan tüketir.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/kvkk/erasure-requests`            — Yeni talep
 * - `GET    /api/v1/kvkk/erasure-requests`            — Liste (SUPERADMIN)
 * - `POST   /api/v1/kvkk/erasure-requests/:id/apply`  — Uygula (SUPERADMIN)
 * - `GET    /api/v1/kvkk/export`                      — Tenant JSON export
 *
 * @security Sözleşme PII taşımaz; yalnızca alan isimleri + tipler.
 *   Log/maskeleme backend katmanında yapılır. Tenant ID yalnızca
 *   `actor.tenantId`'den gelir (request body'den güvenilmez).
 *   Tüm aksiyonlar `audit:kvkk.*` event'i üretir.
 *
 * @since GOAL-126 (FAZ-12) KVKK controller + endpoint'ler
 */

import { z } from "zod";

/** KVKK erasure talebi durumu. */
export const kvkkErasureRequestStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "rejected",
]);
export type KvkkErasureRequestStatus = z.infer<
  typeof kvkkErasureRequestStatusSchema
>;

/** Yasal saklama dayanağı. */
export const kvkkLegalBasisSchema = z.enum([
  "KVKK_MADDE_7",
  "UK_GDPR_ART_6_1_C",
  "OTHER",
]);
export type KvkkLegalBasis = z.infer<typeof kvkkLegalBasisSchema>;

/** Yeni erasure talebi input. Body'de tenant ID taşınmaz. */
export const kvkkErasureRequestInputSchema = z.object({
  /** Hasta sahibi UUID (tenant-scoped). */
  ownerId: z.string().uuid(),
  /** Talep gerekçesi (>=10, <=1000 karakter). */
  reason: z.string().min(10).max(1000),
});
export type KvkkErasureRequestInput = z.infer<
  typeof kvkkErasureRequestInputSchema
>;

/** Erasure talebi yanıtı. */
export const kvkkErasureRequestSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().uuid(),
  ownerId: z.string().uuid(),
  requestedAt: z.string().datetime(),
  requestedBy: z.string().nullable(),
  reason: z.string(),
  status: kvkkErasureRequestStatusSchema,
  completedAt: z.string().datetime().nullable(),
  redactedFields: z.array(z.string()),
  retainedMedicalRecords: z.number().int().nonnegative(),
});
export type KvkkErasureRequest = z.infer<typeof kvkkErasureRequestSchema>;

/** Erasure listesi sorgu parametreleri. */
export const kvkkErasureRequestListQuerySchema = z.object({
  status: kvkkErasureRequestStatusSchema.optional(),
  /** "ownerId" filtresi (tenant-scoped). */
  ownerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type KvkkErasureRequestListQuery = z.infer<
  typeof kvkkErasureRequestListQuerySchema
>;

/** Erasure listesi yanıtı. */
export const kvkkErasureRequestListResponseSchema = z.object({
  items: z.array(kvkkErasureRequestSchema),
  total: z.number().int().nonnegative(),
});
export type KvkkErasureRequestListResponse = z.infer<
  typeof kvkkErasureRequestListResponseSchema
>;

/** Erasure uygulama sonucu. */
export const kvkkErasureApplyResponseSchema = z.object({
  /** Anonimleştirilen alanlar. */
  redacted: z.array(z.string()),
  /** Yasal saklama nedeniyle tutulan tıbbi kayıt sayısı. */
  retained: z.number().int().nonnegative(),
});
export type KvkkErasureApplyResponse = z.infer<
  typeof kvkkErasureApplyResponseSchema
>;

/** Tenant veri export gövdesi (yapısal; PII korunur). */
export const kvkkRetentionNoticeSchema = z.object({
  message: z.string(),
  legalBasis: kvkkLegalBasisSchema,
  retentionYears: z.number().int().positive(),
});
export type KvkkRetentionNotice = z.infer<typeof kvkkRetentionNoticeSchema>;

export const kvkkTenantDataExportSchema = z.object({
  exportedAt: z.string().datetime(),
  tenantId: z.string().uuid(),
  tenantSlug: z.string(),
  format: z.literal("json"),
  data: z.object({
    owners: z.array(z.unknown()),
    patients: z.array(z.unknown()),
    examinations: z.array(z.unknown()),
    vaccinations: z.array(z.unknown()),
    prescriptions: z.array(z.unknown()),
    sales: z.array(z.unknown()),
    payments: z.array(z.unknown()),
  }),
  retentionNotice: kvkkRetentionNoticeSchema,
});
export type KvkkTenantDataExport = z.infer<typeof kvkkTenantDataExportSchema>;

/** Yasal saklama süreleri (yıl). Backend ile aynı kaynaktan tüketilir. */
export const KVKK_LEGAL_RETENTION_YEARS = {
  /** KVKK Madde 7: Sağlık verileri — 7 yıl. */
  medical: 7,
  /** KVKK: Finansal kayıtlar — 5 yıl. */
  financial: 5,
  /** KVKK: Audit log'lar — 3 yıl. */
  audit: 3,
} as const;
export type KvkkLegalRetentionYears = typeof KVKK_LEGAL_RETENTION_YEARS;
