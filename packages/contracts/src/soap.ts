/**
 * @file SOAP (Subjective, Objective, Assessment, Plan) klinik kaydı
 *   API sözleşmesi.
 * @module @vetniva/contracts/soap
 *
 * @description GOAL-041 SOAP klinik kaydı API sözleşmesi. Zod şemaları +
 * tipler. Backend (request/response doğrulama) ve frontend (form/typing)
 * aynı kaynaktan tüketir.
 *
 * SOAP notu bir Examination'a bağlı klinik kayıt entity'sidir.
 * Yaşam döngüsü: `draft` → `signed` (imza) → `amended` (imza sonrası
 * düzeltme; yeni SoapAmend kaydı ile append-only). İmza atılmadan
 * önce S/O/A/P bölümleri güncellenebilir; imza sonrası yalnızca
 * amend ile düzeltme yapılır.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip.
 * @since GOAL-041 (FAZ-4) SOAP klinik kaydı core
 */

import { z } from "zod";

/** SOAP notu durumu. */
export const soapStatusSchema = z.enum(["draft", "signed", "amended"]);
export type SoapStatus = z.infer<typeof soapStatusSchema>;

/**
 * SOAP bölüm metni. Klinik içerik PII olabilir (hastanın semptomları,
 * muayene bulguları, planlanan tedavi). Bu sözleşme taşıma şemasıdır;
 * PII maskeleme audit/log katmanında yapılır.
 */
export const soapSectionSchema = z.string().max(20_000);
export type SoapSection = z.infer<typeof soapSectionSchema>;

/**
 * Yeni SOAP notu oluşturma isteği. examinationId zorunlu; her bölüm
 * (S/O/A/P) opsiyoneldir (draft'ken bölümler boş olabilir).
 */
export const soapCreateInputSchema = z.object({
  examinationId: z.string().min(1),
  subjective: soapSectionSchema.optional(),
  objective: soapSectionSchema.optional(),
  assessment: soapSectionSchema.optional(),
  plan: soapSectionSchema.optional(),
});
export type SoapCreateInput = z.infer<typeof soapCreateInputSchema>;

/**
 * SOAP notu güncelleme isteği (yalnızca draft). Tüm alanlar opsiyonel;
 * sadece gönderilen alanlar güncellenir.
 */
export const soapUpdateInputSchema = z.object({
  subjective: soapSectionSchema.optional(),
  objective: soapSectionSchema.optional(),
  assessment: soapSectionSchema.optional(),
  plan: soapSectionSchema.optional(),
});
export type SoapUpdateInput = z.infer<typeof soapUpdateInputSchema>;

/**
 * SOAP amend (imza sonrası düzeltme) isteği. Yeni SOAP bölümlerinin
 * tamamı zorunlu; düzeltme sebebi de zorunlu.
 */
export const soapAmendInputSchema = z.object({
  reason: z.string().min(1).max(2000),
  subjective: soapSectionSchema,
  objective: soapSectionSchema,
  assessment: soapSectionSchema,
  plan: soapSectionSchema,
});
export type SoapAmendInput = z.infer<typeof soapAmendInputSchema>;

/** API response şeması. */
export const soapNoteSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  examinationId: z.string(),
  /** Subjective — hastanın/subjektif bildirdiği bilgiler. */
  subjective: z.string(),
  /** Objective — muayene bulguları, ölçümler. */
  objective: z.string(),
  /** Assessment — tanı/klinik değerlendirme. */
  assessment: z.string(),
  /** Plan — tedavi/izlem planı. */
  plan: z.string(),
  status: soapStatusSchema,
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  /** ISO 8601 datetime — imza zamanı; null = imzalanmamış. */
  signedAt: z.string().datetime().nullable(),
  /** İmzalayan kullanıcı ID. */
  signedBy: z.string().nullable(),
  /** ISO 8601 datetime — son amend zamanı; null = henüz amend yok. */
  amendedAt: z.string().datetime().nullable(),
});
export type SoapNote = z.infer<typeof soapNoteSchema>;

/** SOAP amend (düzeltme) kaydı şeması. Append-only politika. */
export const soapAmendRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  originalSoapId: z.string(),
  examinationId: z.string(),
  reason: z.string(),
  /** Amend sonrası güncellenmiş SOAP bölümleri (snapshot). */
  subjective: z.string(),
  objective: z.string(),
  assessment: z.string(),
  plan: z.string(),
  amendedBy: z.string(),
  amendedAt: z.string().datetime(),
  /** İmza öncesi durumun referansı (append-only). */
  previousSignedAt: z.string().datetime().nullable(),
  previousSignedBy: z.string().nullable(),
});
export type SoapAmendRecord = z.infer<typeof soapAmendRecordSchema>;
