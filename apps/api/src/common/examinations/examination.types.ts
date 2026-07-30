/**
 * @file Examination (muayene) domain tipleri.
 * @module apps/api/common/examinations/examination.types
 *
 * @description GOAL-040 muayene domain modeli. Muayene bir
 * (tenant, patient, veterinarian, appointment) dörtlüsünün klinik
 * kayıt entity'sidir. Randevuya foreign key ile bağlanır; appointment
 * üzerinden patient + veterinarian tenant kapsamı zaten doğrulanır.
 *
 * Yaşam döngüsü:
 *   `in_progress` (start) → `completed` (complete) → imza (sign) →
 *   `amended` (amend, yeni ExaminationAmend kaydı ile append-only).
 *
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `Examination` + `ExaminationAmend` tabloları ile değiştirilecek
 * (API sözleşmesi sabit kalır).
 *
 * @security İmza sonrası UPDATE/DELETE tetiklenir (FAZ-0'da no-op
 *   flag); append-only politika DB trigger'ı ile korunur.
 *
 * @since GOAL-040 (FAZ-4) muayene başlatma ve yaşam döngüsü core
 */

import type {
  Examination,
  ExaminationAmend,
  ExaminationAmendInput,
  ExaminationCreateInput,
  ExaminationFilters,
  ExaminationListResponse,
  ExaminationStatus,
  ExaminationType,
} from "@vetniva/contracts";

export type {
  Examination,
  ExaminationAmend,
  ExaminationAmendInput,
  ExaminationCreateInput,
  ExaminationFilters,
  ExaminationListResponse,
  ExaminationStatus,
  ExaminationType,
};
