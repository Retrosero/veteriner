/**
 * @file Klinik tüketim (ClinicalConsumption) API sözleşmesi.
 * @module @vetniva/contracts/clinical-consumption
 *
 * @description GOAL-066 (FAZ-6) klinik tüketimden otomatik stok
 * düşümü sözleşmesi. Muayene, aşı, ameliyat ve yatış sırasında
 * kullanılan ürünlerin (ilaç, sarf, aşı) klinik tüketim kaydı
 * olarak tutulmasını ve stoktan otomatik düşülmesini sağlar.
 *
 * **Klinik tüketim akışı:**
 * 1. Klinik personel bir muayene/aşı/ameliyat sırasında ürün
 *    kullanır.
 * 2. Personel tüketim listesini (ürün + miktar + opsiyonel lot)
 *    `ClinicalConsumption` kaydı olarak girer.
 * 3. Kayıt `record` anında `StockMovementsService.createSystemMovement`
 *    ile `type='clinical_use'` (veya `type='vaccination'`) hareketi
 *    oluşturulur; bu atomik bakiyeyi düşürür.
 * 4. `cancel` ile tüketim iptal edilir → her satır için ters kayıt
 *    (`type='reversal'`) oluşturulur.
 *
 * **Bağlam (context) türleri:**
 * - `examination` — muayene sırasında kullanılan malzemeler.
 * - `prescription` — reçete dispansında otomatik tetiklenen tüketim.
 * - `vaccination` — aşı uygulamasında (lot zorunlu).
 * - `surgery` — ameliyat sırasında kullanılan sarf/ilaç (FAZ-8
 *   ameliyat modülü ile bağlanacak; pilot kapsamda endpoint
 *   yeterli, otomatik tetikleme ameliyat modülünde).
 * - `hospitalization` — yatış sırasında kullanılan (FAZ-8 yatış
 *   modülü ile bağlanacak).
 *
 * **Güvenlik & audit:**
 * - Tüm kayıtlar tenant-scoped; cross-tenant erişim 404.
 * - Append-only: fiziksel silme yok; iptal yalnızca ters kayıtla.
 * - Audit `audit:clinical_consumption.create/cancel`.
 * - Hata kodları: VET-CLINICAL_CONSUMPTION-0001-0007.
 *
 * @since GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Tüketim bağlamı
 * --------------------------------------------------------------------------
 * Tüketim hangi klinik olay için yapıldı? İlişkili kayıt ID'leri
 * opsiyonel; tüm zorunlu alanlar API'da input validation ile kontrol
 * edilir (en az biri verilmelidir).
 */
export const clinicalConsumptionContextSchema = z.enum([
  "examination",
  "prescription",
  "vaccination",
  "surgery",
  "hospitalization",
]);
export type ClinicalConsumptionContext = z.infer<
  typeof clinicalConsumptionContextSchema
>;

/**
 * Klinik tüketim kaydı yaşam döngüsü durumu.
 * - `recorded` — aktif; stok düşümü yapıldı.
 * - `cancelled` — iptal edildi; her satır için ters kayıt oluşturuldu.
 */
export const clinicalConsumptionStatusSchema = z.enum([
  "recorded",
  "cancelled",
]);
export type ClinicalConsumptionStatus = z.infer<
  typeof clinicalConsumptionStatusSchema
>;

/* --------------------------------------------------------------------------
 * Tüketim satırı
 * --------------------------------------------------------------------------
 * Tek bir ürünün tüketim kaydı. Miktar pozitif olmalı; işaret
 * servis katmanında `clinical_use`/`vaccination` için negatif olarak
 * yazılır (stok çıkışı).
 *
 * - `productId` zorunlu (Product.id referansı; GOAL-060).
 * - `lotId` opsiyonel ama vaccination için zorunlu (servis katmanı
 *   doğrular).
 * - `quantity` zorunlu, pozitif (servis normalize eder).
 * - `unitCost` opsiyonel (maliyet takibi).
 * - `notes` opsiyonel (serbest metin).
 */
export const clinicalConsumptionLineSchema = z.object({
  productId: z.string().min(1).max(100),
  lotId: z.string().min(1).max(100).optional(),
  quantity: z
    .string()
    // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden decimal doğrulamasıdır.
    .regex(/^\d+(\.\d{1,4})?$/, "Geçersiz miktar formatı (ör. 2 veya 0.5)")
    .refine((v) => v !== "0" && v !== "0.0", {
      message: "Tüketim miktarı sıfır olamaz",
    }),
  unitCost: z
    .string()
    // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, en çok dört ondalık basamak kabul eden decimal doğrulamasıdır.
    .regex(/^\d+(\.\d{1,4})?$/)
    .optional(),
  notes: z.string().max(500).optional(),
});
export type ClinicalConsumptionLine = z.infer<
  typeof clinicalConsumptionLineSchema
>;

/* --------------------------------------------------------------------------
 * Tüketim oluşturma isteği
 * --------------------------------------------------------------------------
 * - `context` zorunlu (hangi klinik olay).
 * - `contextRefId` zorunlu (ilgili kayıt ID'si).
 * - `patientId` opsiyonel ama önerilir (klinik kayıt bağlantısı).
 * - `lines` en az 1 satır (boş → 422).
 * - `notes` opsiyonel.
 * - `occurredAt` opsiyonel (default: now).
 */
export const clinicalConsumptionCreateInputSchema = z.object({
  context: clinicalConsumptionContextSchema,
  contextRefId: z.string().min(1).max(100),
  patientId: z.string().min(1).max(100).optional(),
  lines: z.array(clinicalConsumptionLineSchema).min(1).max(200),
  notes: z.string().max(2000).optional(),
  occurredAt: z.string().datetime().optional(),
});
export type ClinicalConsumptionCreateInput = z.infer<
  typeof clinicalConsumptionCreateInputSchema
>;

/* --------------------------------------------------------------------------
 * Public response
 * --------------------------------------------------------------------------
 * `status` yaşam döngüsü:
 * - `recorded` — aktif; stok düşümü yapıldı.
 * - `cancelled` — iptal edildi; her satır için ters kayıt
 *   oluşturuldu (stok geri geldi).
 *
 * `stockMovementIds` her satır için oluşturulan stok hareket
 * ID'lerini taşır (audit/reversal takibi için).
 */
export const clinicalConsumptionSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  context: clinicalConsumptionContextSchema,
  contextRefId: z.string(),
  patientId: z.string().nullable(),
  lines: z.array(clinicalConsumptionLineSchema),
  notes: z.string().nullable(),
  status: clinicalConsumptionStatusSchema,
  occurredAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  cancelledAt: z.string().datetime().nullable(),
  cancelledBy: z.string().nullable(),
  cancelReason: z.string().nullable(),
  /** Satır başına oluşturulan stok hareket ID'leri (sırasıyla lines ile aynı). */
  stockMovementIds: z.array(z.string()),
});
export type ClinicalConsumption = z.infer<typeof clinicalConsumptionSchema>;

/* --------------------------------------------------------------------------
 * İptal isteği
 * --------------------------------------------------------------------------
 * - `cancelReason` zorunlu (422 VET-CLINICAL_CONSUMPTION-0005).
 */
export const clinicalConsumptionCancelInputSchema = z.object({
  cancelReason: z.string().min(1).max(2000),
});
export type ClinicalConsumptionCancelInput = z.infer<
  typeof clinicalConsumptionCancelInputSchema
>;

/* --------------------------------------------------------------------------
 * Liste filtreleri
 * --------------------------------------------------------------------------
 * Tenant-scoped arama; `context`/`contextRefId`/`patientId`/
 * `status`/`from`/`to` + pagination.
 */
export const clinicalConsumptionFiltersSchema = z.object({
  context: clinicalConsumptionContextSchema.optional(),
  contextRefId: z.string().optional(),
  patientId: z.string().optional(),
  status: clinicalConsumptionStatusSchema.optional(),
  occurredFrom: z.string().datetime().optional(),
  occurredTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type ClinicalConsumptionFilters = z.infer<
  typeof clinicalConsumptionFiltersSchema
>;

/** Liste response şeması. */
export const clinicalConsumptionListResponseSchema = z.object({
  items: z.array(clinicalConsumptionSchema),
  total: z.number().int().nonnegative(),
});
export type ClinicalConsumptionListResponse = z.infer<
  typeof clinicalConsumptionListResponseSchema
>;
