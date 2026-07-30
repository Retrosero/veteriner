/**
 * @file File sözleşmesi.
 * @module @vetniva/contracts/file
 *
 * @description Dosya yükleme, meta ve signed URL için Zod şemaları.
 * API ile frontend arasındaki tek doğruluk kaynağı.
 *
 * @security Yalnızca alan isimleri ve tipleri; PII bulunmaz. Upload
 *   işleminde kategori ve mime alanları whitelist ile sınırlandığı
 *   için şemalar enum olarak tanımlanır.
 *
 * @since GOAL-014 (FAZ-2) dosya ve medya servisi
 */

import { z } from "zod";

/**
 * Dosya kategorileri. Permission kataloğu ile aynı küme.
 */
export const fileCategorySchema = z.enum([
  "patient_photo",
  "lab_report",
  "imaging",
  "consent",
  "invoice",
  "other",
]);
export type FileCategory = z.infer<typeof fileCategorySchema>;

/**
 * İzin verilen MIME tipleri. Backend whitelist'i ile bire bir eşleşir.
 */
export const fileMimeTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "application/pdf",
  "application/dicom",
]);
export type FileMimeType = z.infer<typeof fileMimeTypeSchema>;

/**
 * Upload input. Multipart body parse edildikten sonra backend
 * service'e geçirilir. Buffer backend tarafında taşınır; sözleşmede
 * yalnızca metadata yer alır.
 */
export const fileUploadInputSchema = z.object({
  category: fileCategorySchema,
  mimeType: fileMimeTypeSchema,
  originalName: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  relatedEntityType: z.string().min(1).max(64).optional(),
  relatedEntityId: z.string().uuid().optional(),
});
export type FileUploadInput = z.infer<typeof fileUploadInputSchema>;

/**
 * Dosya meta verisi response şeması.
 */
export const fileMetaSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  category: fileCategorySchema,
  mimeType: fileMimeTypeSchema,
  originalName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  path: z.string(),
  uploadedBy: z.string(),
  uploadedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable().optional(),
  relatedEntityType: z.string().nullable().optional(),
  relatedEntityId: z.string().uuid().nullable().optional(),
});
export type FileMeta = z.infer<typeof fileMetaSchema>;

/**
 * Signed URL response şeması. URL kısa süreli (≤ 1 saat) erişim sağlar.
 */
export const signedUrlResponseSchema = z.object({
  url: z.string().min(1),
  expiresInSec: z.number().int().positive(),
});
export type SignedUrlResponse = z.infer<typeof signedUrlResponseSchema>;

/**
 * Signed URL istek parametreleri.
 */
export const signedUrlRequestSchema = z.object({
  expiresInSec: z.number().int().min(60).max(3600).default(300),
});
export type SignedUrlRequest = z.infer<typeof signedUrlRequestSchema>;

// ----------------------------------------------------------------------------
// GOAL-014 ek sözleşmeler: listeleme, arşiv, görünürlük, tarama durumu.
// ----------------------------------------------------------------------------

/**
 * Dosya görünürlük kapsamı. `visibility` Prisma enum ile bire bir.
 * - `private`: yalnızca yükleyen kullanıcı.
 * - `branch`: yükleyen şubenin personeli.
 * - `tenant`: tenant'taki tüm yetkili personel.
 * - `portal`: hasta sahibi portalı dahil.
 */
export const fileVisibilitySchema = z.enum([
  "private",
  "branch",
  "tenant",
  "portal",
]);
export type FileVisibility = z.infer<typeof fileVisibilitySchema>;

/**
 * Zararlı içerik tarama durumu. Prisma `FileScanStatus` enum ile bire bir.
 */
export const fileScanStatusSchema = z.enum([
  "pending",
  "clean",
  "infected",
  "skipped",
  "error",
]);
export type FileScanStatus = z.infer<typeof fileScanStatusSchema>;

/**
 * Listeleme sorgu parametreleri. Tenant context service'te set edilir;
 * burada yalnızca opsiyonel filtre.
 */
export const fileListQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  category: fileCategorySchema.optional(),
  mimeType: fileMimeTypeSchema.optional(),
  relatedEntityType: z.string().min(1).max(64).optional(),
  relatedEntityId: z.string().uuid().optional(),
  visibility: fileVisibilitySchema.optional(),
  /**
   * `true` ise arşivlenmiş kayıtlar da döner. Default `false`.
   */
  includeArchived: z.boolean().default(false),
});
export type FileListQuery = z.infer<typeof fileListQuerySchema>;

/**
 * Sayfalı liste response şeması.
 */
export const fileListResponseSchema = z.object({
  items: z.array(fileMetaSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type FileListResponse = z.infer<typeof fileListResponseSchema>;

/**
 * Upload input (genişletilmiş). Backend service tarafından
 * doğrulanır; frontend multipart body hazırlarken bu alanları form
 * field olarak gönderir.
 */
export const fileUploadExtendedSchema = z.object({
  category: fileCategorySchema,
  mimeType: fileMimeTypeSchema,
  originalName: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
  relatedEntityType: z.string().min(1).max(64).optional(),
  relatedEntityId: z.string().uuid().optional(),
  visibility: fileVisibilitySchema.default("branch"),
  description: z.string().max(500).optional(),
});
export type FileUploadExtended = z.infer<typeof fileUploadExtendedSchema>;

/**
 * Service katmanı için alias. `fileUploadExtendedSchema` ile aynı
 * şema; controller'ın import kolaylığı için.
 */
export const uploadRequestSchema = fileUploadExtendedSchema;
export type UploadRequest = FileUploadExtended;

/**
 * Arşivleme istek gövdesi.
 */
export const fileArchiveRequestSchema = z.object({
  reason: z.string().min(3).max(500),
});
export type FileArchiveRequest = z.infer<typeof fileArchiveRequestSchema>;
