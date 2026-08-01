/**
 * @file File DTO ve mapper.
 * @module apps/api/modules/file/dto
 *
 * @description Prisma `FileMeta` modeli ile API response şeması
 * arasındaki dönüşüm. PII / storage path / scan detayı gibi iç
 * alanlar mapper'da dönüştürülür.
 *
 * Not: `fileMetaSchema` (contracts) `category` alanı içerir; Prisma'da
 * bu alan yoktur (yerine `relatedEntityType` kullanılır). Mapper
 * `relatedEntityType` → `category` dönüşümünü bilinen kategori
 * listesine göre yapar; bilinmeyenler `other`'a map'lenir.
 *
 * @since GOAL-014 (FAZ-1) dosya ve medya servisi
 */

import type { FileMeta as PrismaFileMeta } from "@prisma/client";
import type {
  FileCategory,
  FileMeta,
  FileScanStatus,
  FileVisibility,
} from "@vetniva/contracts";

/**
 * MIME → category eşlemesi. Bilinmeyen MIME'lar `other` döner.
 */
const MIME_TO_CATEGORY: Record<string, FileCategory> = {
  "image/jpeg": "patient_photo",
  "image/png": "patient_photo",
  "application/pdf": "lab_report",
  "application/dicom": "imaging",
};

/**
 * relatedEntityType → category eşlemesi (opsiyonel; dosyanın hangi
 * klinik bağlama yüklendiğine göre kategori türetilir).
 */
const ENTITY_TYPE_TO_CATEGORY: Record<string, FileCategory> = {
  patient: "patient_photo",
  examination: "lab_report",
  lab: "lab_report",
  imaging: "imaging",
  surgery: "consent",
  consent: "consent",
  invoice: "invoice",
};

/**
 * Prisma FileMeta → API response şeması.
 */
export function toFileMetaResponse(m: PrismaFileMeta): FileMeta {
  const category = inferCategory(m.mimeType, m.relatedEntityType);
  return {
    id: m.id,
    tenantId: m.tenantId,
    category,
    mimeType: m.mimeType as FileMeta["mimeType"],
    originalName: m.originalName,
    sizeBytes: Number(m.sizeBytes),
    path: m.storageKey,
    uploadedBy: m.uploaderId,
    uploadedAt: m.createdAt.toISOString(),
    archivedAt: m.archivedAt ? m.archivedAt.toISOString() : null,
    relatedEntityType: m.relatedEntityType ?? null,
    relatedEntityId: m.relatedEntityId ?? null,
  };
}

/**
 * FileMeta görünürlük enum'unu Prisma enum'una çevirir. Zod şeması
 * aynı stringleri kullanır, bu nedenle identity map.
 */
export function toPrismaVisibility(v: FileVisibility): FileVisibility {
  return v;
}

/**
 * Prisma FileScanStatus → API enum. Identity map.
 */
export function toApiScanStatus(s: string): FileScanStatus {
  return s as FileScanStatus;
}

/**
 * Kategori çıkarımı: önce relatedEntityType, sonra MIME.
 */
function inferCategory(
  mime: string,
  relatedEntityType: string | null,
): FileCategory {
  if (relatedEntityType) {
    const fromEntity = Reflect.get(
      ENTITY_TYPE_TO_CATEGORY,
      relatedEntityType,
    ) as FileCategory | undefined;
    if (fromEntity) return fromEntity;
  }
  const fromMime = Reflect.get(MIME_TO_CATEGORY, mime) as
    FileCategory | undefined;
  return fromMime ?? "other";
}
