/**
 * @file Controlled Drug Register (İngiltere kontrollü ilaç defteri)
 * API sözleşmesi.
 * @module @vetniva/contracts/controlled-drugs
 *
 * @description GOAL-143 (FAZ-14) İngiltere kontrollü ilaç
 * kayıtları için append-only elektronik defter sözleşmesi.
 * Misuse of Drugs Regulations 2001 + RCVS gereksinimleri.
 *
 * VETERİNER UYUMU: Defter ciltli, sıralı ve mürekkepli olmalı;
 * üzerine yazma/silme yasaktır. Bu sözleşme aynı semantiği
 * API katmanında uygular: fiziksel silme/güncelleme YOK; tüm
 * düzeltmeler ters kayıt + yeni kayıt çifti ile yapılır.
 *
 * Schedule sınıflandırması:
 * - `S1`: LSD, ecstasy (klinik kullanım yok)
 * - `S2`: Morfin, petidin, fentanil, oksikodon (çelik dolap + double lock)
 * - `S3`: Buprenorfin, pentobarbital (çelik dolap)
 * - `S4`: Diazepam, midazolam, androjenler (kilitli dolap)
 * - `S5`: Düşük doz morfin (≤%0.2), kodein (kilitli dolap)
 *
 * Entry türleri (her biri append-only kayıt oluşturur):
 * - `received`: dışarıdan alınan (üretici, toptancı).
 * - `dispensed`: hasta/hayvan için kullanılan.
 * - `wasted`: bozuk, süresi geçmiş, geri çekilen (2 imza zorunlu).
 * - `returned`: sahibine iade edilen.
 * - `transferred`: başka saklama alanına/şubeye aktarılan.
 * - `count`: yıllık fiziksel sayım (2 imza zorunlu).
 * - `correction`: mevcut bir kaydı düzeltmek için eklenen
 *   ters kayıt + yeni kayıt çiftinin parçası.
 *
 * Birim: mg (katı) veya ml (sıvı). Tüm miktarlar tutarlı
 * olmalı (kayıt başına tek birim).
 *
 * Saklama:
 * - Register: en az 2 yıl.
 * - Stok kayıtları: en az 5 yıl.
 *
 * @security PII bu sözleşmede YOKTUR; yalnızca alan şeması.
 *   Tenant bilgisi sözleşmede taşınmaz; backend actor.tenantId
 *   bağlamından alınır. Hasta sahibi/hayvan ID'leri
 *   referans amaçlıdır; PII mask'lama API katmanında yapılır.
 *
 * @since GOAL-143 (FAZ-14) İngiltere kontrollü ilaç defteri core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum şemaları
 * --------------------------------------------------------------------------
 */

/**
 * Misuse of Drugs Regulations 2001 schedule sınıflandırması.
 * Klinik veteriner pratikte en sık S2-S5 görülür.
 */
export const cdScheduleSchema = z.enum(["S1", "S2", "S3", "S4", "S5"]);
export type CdSchedule = z.infer<typeof cdScheduleSchema>;

/**
 * Ölçü birimi. Bir kayıt tek birimde olmalı; karışık
 * birim kabul edilmez.
 */
export const cdUnitSchema = z.enum(["mg", "ml"]);
export type CdUnit = z.infer<typeof cdUnitSchema>;

/**
 * Defter giriş türü. Her biri append-only bir kayıt oluşturur
 * ve audit olayı tetikler.
 */
export const cdEntryTypeSchema = z.enum([
  "received",
  "dispensed",
  "wasted",
  "returned",
  "transferred",
  "count",
  "correction",
]);
export type CdEntryType = z.infer<typeof cdEntryTypeSchema>;

/* --------------------------------------------------------------------------
 * Filtreler
 * --------------------------------------------------------------------------
 */

/** Register listesi için filtre seti. */
export const cdRegisterFiltersSchema = z.object({
  /** İlaç adı (case-insensitive substring). */
  drugName: z.string().min(1).max(200).optional(),
  /** Schedule filtresi. */
  schedule: cdScheduleSchema.optional(),
  /** Entry türü filtresi. */
  entryType: cdEntryTypeSchema.optional(),
  /** Şube ID filtresi. */
  branchId: z.string().min(1).max(100).optional(),
  /** Saklama alanı ID filtresi. */
  storageAreaId: z.string().min(1).max(100).optional(),
  /** ISO 8601 datetime; entry.occurredAt >= from. */
  from: z
    .string()
    .regex(
      // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, tüm tekrarlar sabit/üst sınırlı ISO-8601 doğrulamasıdır.
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
    )
    .optional(),
  /** ISO 8601 datetime; entry.occurredAt <= to. */
  to: z
    .string()
    .regex(
      // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, tüm tekrarlar sabit/üst sınırlı ISO-8601 doğrulamasıdır.
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
    )
    .optional(),
  /** Maksimum kayıt sayısı (sayfalama). */
  limit: z.number().int().min(1).max(500).default(100),
  /** Atlanacak kayıt sayısı (sayfalama). */
  offset: z.number().int().min(0).default(0),
});
export type CdRegisterFilters = z.infer<typeof cdRegisterFiltersSchema>;

/* --------------------------------------------------------------------------
 * Girdi şemaları
 * --------------------------------------------------------------------------
 */

/** Yeni ilaç alımı (received) kaydı. */
export const cdReceiptInputSchema = z.object({
  drugName: z.string().min(1).max(200),
  schedule: cdScheduleSchema,
  unit: cdUnitSchema,
  /** Pozitif sayı; alınan miktar. */
  quantity: z.number().positive().max(1_000_000),
  branchId: z.string().min(1).max(100),
  storageAreaId: z.string().min(1).max(100),
  /** Tedarikçi/üretici. */
  supplier: z.string().min(1).max(200),
  /** Lot/batch numarası. */
  lotNumber: z.string().min(1).max(100),
  /** Son kullanma tarihi (ISO date). */
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** ISO 8601 datetime; alındığı an. */
  occurredAt: z
    .string()
    .regex(
      // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, tüm tekrarlar sabit/üst sınırlı ISO-8601 doğrulamasıdır.
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
    )
    .optional(),
  notes: z.string().max(2000).optional(),
});
export type CdReceiptInput = z.infer<typeof cdReceiptInputSchema>;

/** Hasta/hayvan için kullanım (dispensed) kaydı. */
export const cdDispensingInputSchema = z.object({
  drugName: z.string().min(1).max(200),
  schedule: cdScheduleSchema,
  unit: cdUnitSchema,
  /** Pozitif sayı; kullanılan miktar. */
  quantity: z.number().positive().max(1_000_000),
  branchId: z.string().min(1).max(100),
  storageAreaId: z.string().min(1).max(100),
  /** Hasta sahibi ID (opsiyonel; acil kullanım dışı zorunlu). */
  ownerId: z.string().min(1).max(100).optional(),
  /** Hayvan ID (opsiyonel; acil kullanım dışı zorunlu). */
  patientId: z.string().min(1).max(100).optional(),
  /** Acil kullanım (out-of-hours) işaretlerse ownerId/patientId opsiyonel. */
  emergencyUse: z.boolean().optional(),
  /** Reçete eden veteriner ID. */
  prescribedByVeterinarianId: z.string().min(1).max(100),
  /** Reçete numarası (zorunlu). */
  prescriptionNumber: z.string().min(1).max(100),
  /** ISO 8601 datetime; kullanıldığı an. */
  occurredAt: z
    .string()
    .regex(
      // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, tüm tekrarlar sabit/üst sınırlı ISO-8601 doğrulamasıdır.
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
    )
    .optional(),
  notes: z.string().max(2000).optional(),
});
export type CdDispensingInput = z.infer<typeof cdDispensingInputSchema>;

/** İmha (wasted) kaydı. S2-S3 için 2 imza zorunludur. */
export const cdWastageInputSchema = z.object({
  drugName: z.string().min(1).max(200),
  schedule: cdScheduleSchema,
  unit: cdUnitSchema,
  quantity: z.number().positive().max(1_000_000),
  branchId: z.string().min(1).max(100),
  storageAreaId: z.string().min(1).max(100),
  reason: z.enum([
    "expired",
    "damaged",
    "recalled",
    "spillage",
    "contamination",
    "other",
  ]),
  /** İmza atan 2 kişinin ID'leri (S2/S3 için zorunlu). */
  witnessUserId: z.string().min(1).max(100),
  occurredAt: z
    .string()
    .regex(
      // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, tüm tekrarlar sabit/üst sınırlı ISO-8601 doğrulamasıdır.
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
    )
    .optional(),
  notes: z.string().max(2000).optional(),
});
export type CdWastageInput = z.infer<typeof cdWastageInputSchema>;

/** Sahibine iade (returned) kaydı. */
export const cdReturnInputSchema = z.object({
  drugName: z.string().min(1).max(200),
  schedule: cdScheduleSchema,
  unit: cdUnitSchema,
  quantity: z.number().positive().max(1_000_000),
  branchId: z.string().min(1).max(100),
  storageAreaId: z.string().min(1).max(100),
  ownerId: z.string().min(1).max(100),
  patientId: z.string().min(1).max(100).optional(),
  reason: z.string().min(1).max(2000),
  occurredAt: z
    .string()
    .regex(
      // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, tüm tekrarlar sabit/üst sınırlı ISO-8601 doğrulamasıdır.
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
    )
    .optional(),
});
export type CdReturnInput = z.infer<typeof cdReturnInputSchema>;

/** Transfer (başka şube/saklama alanı) kaydı. */
export const cdTransferInputSchema = z.object({
  drugName: z.string().min(1).max(200),
  schedule: cdScheduleSchema,
  unit: cdUnitSchema,
  quantity: z.number().positive().max(1_000_000),
  branchId: z.string().min(1).max(100),
  storageAreaId: z.string().min(1).max(100),
  targetBranchId: z.string().min(1).max(100),
  targetStorageAreaId: z.string().min(1).max(100),
  /** Out (kaynak) ve In (hedef) eşleşen tek transfer kimliği. */
  transferGroupId: z.string().min(1).max(100),
  occurredAt: z
    .string()
    .regex(
      // eslint-disable-next-line security/detect-unsafe-regex -- Tam ankora sahip, tüm tekrarlar sabit/üst sınırlı ISO-8601 doğrulamasıdır.
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
    )
    .optional(),
  notes: z.string().max(2000).optional(),
});
export type CdTransferInput = z.infer<typeof cdTransferInputSchema>;

/** Yıllık fiziksel sayım (count) kaydı. 2 imza zorunludur. */
export const cdStockCountInputSchema = z.object({
  branchId: z.string().min(1).max(100),
  storageAreaId: z.string().min(1).max(100),
  drugName: z.string().min(1).max(200),
  schedule: cdScheduleSchema,
  unit: cdUnitSchema,
  /** Sayım sonucu (fiziksel stok). */
  physicalQuantity: z.number().min(0).max(1_000_000),
  /** Sayım sırasındaki defter bakiyesi. */
  bookQuantity: z.number().min(0).max(1_000_000),
  /** Fark (physicalQuantity - bookQuantity). Pozitif = fazla, negatif = eksik. */
  discrepancy: z.number(),
  witnessUserId: z.string().min(1).max(100),
  /** Sayım tarihi (ISO date). */
  countDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).optional(),
});
export type CdStockCountInput = z.infer<typeof cdStockCountInputSchema>;

/* --------------------------------------------------------------------------
 * API response şemaları
 * --------------------------------------------------------------------------
 */

/** Tek bir register kaydı (append-only). */
export const cdRegisterEntrySchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  entryType: cdEntryTypeSchema,
  drugName: z.string(),
  schedule: cdScheduleSchema,
  unit: cdUnitSchema,
  /**
   * Stok etkisi:
   * - received, returned (in): pozitif
   * - dispensed, wasted, transferred (out): negatif
   * - count: 0 (sadece kayıt amaçlı)
   * - correction: ters kayıt
   */
  quantityDelta: z.number(),
  branchId: z.string(),
  storageAreaId: z.string(),
  /** ISO 8601 datetime; kaydın gerçekleştiği an. */
  occurredAt: z.string().datetime(),
  /** ISO 8601 datetime; kaydın sisteme girildiği an. */
  recordedAt: z.string().datetime(),
  /** Kaydı oluşturan aktör. */
  recordedBy: z.string(),
  /** Entry türüne göre değişen opsiyonel alanlar. */
  supplier: z.string().nullable().optional(),
  lotNumber: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  patientId: z.string().nullable().optional(),
  prescribedByVeterinarianId: z.string().nullable().optional(),
  prescriptionNumber: z.string().nullable().optional(),
  emergencyUse: z.boolean().nullable().optional(),
  reason: z.string().nullable().optional(),
  witnessUserId: z.string().nullable().optional(),
  targetBranchId: z.string().nullable().optional(),
  targetStorageAreaId: z.string().nullable().optional(),
  transferGroupId: z.string().nullable().optional(),
  physicalQuantity: z.number().nullable().optional(),
  bookQuantity: z.number().nullable().optional(),
  discrepancy: z.number().nullable().optional(),
  countDate: z.string().nullable().optional(),
  /**
   * Düzeltme ise hangi kaydı düzeltiyor (correction entry'si
   * için); diğer entry türlerinde null.
   */
  correctsEntryId: z.string().nullable().optional(),
  notes: z.string().nullable(),
});
export type CdRegisterEntry = z.infer<typeof cdRegisterEntrySchema>;

/** Register listesi response'u. */
export const cdRegisterListResponseSchema = z.object({
  items: z.array(cdRegisterEntrySchema),
  total: z.number().int().nonnegative(),
});
export type CdRegisterListResponse = z.infer<
  typeof cdRegisterListResponseSchema
>;

/** İlaç + şube + saklama alanı başına güncel stok durumu. */
export const cdStockEntrySchema = z.object({
  drugName: z.string(),
  schedule: cdScheduleSchema,
  unit: cdUnitSchema,
  branchId: z.string(),
  storageAreaId: z.string(),
  /** received - dispensed - wasted - transferred_out + transferred_in + returned_in - count (count 0). */
  currentQuantity: z.number(),
  /** Son hareket zamanı. */
  lastMovementAt: z.string().datetime().nullable(),
});
export type CdStockEntry = z.infer<typeof cdStockEntrySchema>;

/** Stok özet response'u. */
export const cdStockSummaryResponseSchema = z.object({
  items: z.array(cdStockEntrySchema),
  total: z.number().int().nonnegative(),
});
export type CdStockSummaryResponse = z.infer<
  typeof cdStockSummaryResponseSchema
>;

/** Bir kaydın düzeltilmesi için input. */
export const cdCorrectionInputSchema = z.object({
  /** Düzeltilecek orijinal kayıt ID. */
  originalEntryId: z.string().min(1).max(100),
  /** Düzeltme gerekçesi (audit için). */
  reason: z.string().min(1).max(2000),
});
export type CdCorrectionInput = z.infer<typeof cdCorrectionInputSchema>;
