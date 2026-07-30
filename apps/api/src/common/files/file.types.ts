/**
 * @file File varlık tipleri.
 * @module apps/api/common/files/file.types
 *
 * @description Dosya varlığının tip tanımları. Multipart upload sırasında
 * kullanılan `FileUpload` input şeması, DB'de saklanan `FileMeta` ve
 * yardımcı tipler burada yer alır. Şema katmanı (Zod) `@vetniva/contracts`
 * altında; burada sadece backend'in kullandığı iç tipler bulunur.
 *
 * @security Tenant izolasyonu: her meta `tenantId` taşır. Cross-tenant
 *   erişim denemesi 404 ile engellenir (bilgi sızdırmaz). `path` alanı
 *   doğrudan storage driver'a verilir; path injection storage katmanında
 *   validate edilir.
 *
 * @since GOAL-014 (FAZ-2) dosya ve medya servisi
 */

/**
 * Dosya kategorisi. Tenant başına kabul edilen kategoriler permission
 * kataloğunda yer alır; kategori değişimi audit edilir.
 */
export type FileCategory =
  | "patient_photo"
  | "lab_report"
  | "imaging"
  | "consent"
  | "invoice"
  | "other";

/**
 * İzin verilen MIME tipleri. Whitelist dışı MIME upload'da
 * `VET-FILE-0002` (415) ile reddedilir.
 */
export type FileMimeType =
  | "image/jpeg"
  | "image/png"
  | "application/pdf"
  | "application/dicom";

/**
 * Upload input. Multipart handler tarafından doldurulur, service'e
 * geçirilir. `buffer` FAZ-0'da in-memory taşınır; FAZ-3+ streaming.
 */
export interface FileUpload {
  category: FileCategory;
  mimeType: FileMimeType;
  originalName: string;
  sizeBytes: number;
  buffer: Buffer;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

/**
 * Persist edilmiş dosya meta verisi. Şu an in-memory Map'te tutulur
 * (FAZ-0). FAZ-2'nin sonunda Prisma `File` modeline taşınacak.
 */
export interface FileMeta {
  id: string;
  tenantId: string;
  category: FileCategory;
  mimeType: FileMimeType;
  originalName: string;
  sizeBytes: number;
  path: string;
  uploadedBy: string;
  uploadedAt: string;
  archivedAt?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}

/**
 * Upload sırasında uygulanan sınırlar. Tenant başına override
 * edilebilir (FAZ-3+); şimdilik global.
 */
export const FILE_LIMITS = {
  /** Byte. 50 MB. */
  MAX_SIZE_BYTES: 50 * 1024 * 1024,
  /** MIME whitelist. */
  ALLOWED_MIME_TYPES: [
    "image/jpeg",
    "image/png",
    "application/pdf",
    "application/dicom",
  ] as ReadonlyArray<FileMimeType>,
  /** Uzantı haritası (path üretimi için). */
  EXTENSION_BY_MIME: {
    "image/jpeg": "jpg",
    "image/png": "png",
    "application/pdf": "pdf",
    "application/dicom": "dcm",
  } as const,
} as const;
