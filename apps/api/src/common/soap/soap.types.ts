/**
 * @file SOAP klinik kaydı domain tipleri.
 * @module apps/api/common/soap/soap.types
 *
 * @description GOAL-041 SOAP (Subjective, Objective, Assessment, Plan)
 * domain modeli. Sözleşme katmanındaki (@vetniva/contracts/soap)
 * tipleri re-export eder; ileride domain'e özgü yardımcı tipler
 * (örn. create için initial partial) buraya eklenebilir.
 *
 * Yaşam döngüsü:
 *   `draft` (create/update) → `signed` (sign) → `amended`
 *   (imza sonrası düzeltme; yeni SoapAmendRecord kaydı ile append-only).
 *
 * In-memory Map'te tutulur; production'a geçişte Prisma `SoapNote`
 * + `SoapAmendRecord` tabloları ile değiştirilecek (API sözleşmesi
 * sabit kalır).
 *
 * @security İmza sonrası UPDATE/DELETE tetiklenir (FAZ-0'da no-op
 *   flag); append-only politika DB trigger'ı ile korunur.
 *
 * @since GOAL-041 (FAZ-4) SOAP klinik kaydı core
 */

import type {
  SoapAmendInput,
  SoapAmendRecord,
  SoapCreateInput,
  SoapNote,
  SoapSection,
  SoapStatus,
  SoapUpdateInput,
} from "@vetniva/contracts";

/** Service katmanında create için opsiyonel bölüm partial'ı. */
export interface SoapInitial
  extends Partial<Pick<SoapCreateInput, "subjective" | "objective" | "assessment" | "plan">> {}

export type {
  SoapAmendInput,
  SoapAmendRecord,
  SoapCreateInput,
  SoapNote,
  SoapSection,
  SoapStatus,
  SoapUpdateInput,
};
