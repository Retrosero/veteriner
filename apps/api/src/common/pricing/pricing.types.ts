/**
 * @file Fiyat listeleri ve hizmet ücretleri domain tipleri.
 * @module apps/api/common/pricing/pricing.types
 *
 * @description GOAL-070 (FAZ-7) tenant bazlı fiyat listesi altyapısı
 * domain modeli. İki varlık:
 * - `PriceListRecord` — fiyat listesi başlığı (tenant-scoped).
 * - `PriceListItemRecord` — fiyat satırı (append-only; düzeltme
 *   zinciri ile versiyonlanır).
 *
 * In-memory Map'te tutulur; production'a geçişte Prisma `PriceList`
 * + `PriceListItem` tabloları ile değiştirilecek (API sözleşmesi sabit).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Fiyat listesi/satırı üzerinde
 *   fiziksel silme YOKTUR; `archivedAt` (liste) ve `status` (satır)
 *   alanları ile versiyonlanır. Düzeltme yeni satır oluşturur.
 *
 * @since GOAL-070 (FAZ-7) fiyat listeleri ve hizmet ücretleri core
 */

import type {
  PriceList,
  PriceListItem,
  PriceListItemStatus,
  PriceListStatus,
  PriceListType,
  PricingCurrency,
  PricingTaxProfile,
} from "@vetniva/contracts";

/** Persist edilmiş price list record. */
export interface PriceListRecord {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  type: PriceListType;
  /** `type='customer_specific'` ise zorunlu UUID. */
  customerId: string | null;
  currency: PricingCurrency;
  taxProfile: PricingTaxProfile | null;
  validFrom: string | null;
  validUntil: string | null;
  status: PriceListStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
}

/** Persist edilmiş price list item record. Append-only. */
export interface PriceListItemRecord {
  id: string;
  tenantId: string;
  priceListId: string;
  productId: string;
  /** Decimal string (4 ondalık hassasiyet). */
  price: string;
  taxProfile: PricingTaxProfile | null;
  validFrom: string | null;
  validUntil: string | null;
  status: PriceListItemStatus;
  /** Append-only zincir: bu satırın yerine geçtiği önceki satır. */
  supersedesId: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string;
}

export type {
  PriceList,
  PriceListItem,
  PriceListItemStatus,
  PriceListStatus,
  PriceListType,
  PricingCurrency,
  PricingTaxProfile,
};

/**
 * Record → public PriceList (API response). `itemCount` repository
 * tarafından sağlanır (durdurulmuş listeler için 0 olabilir; gerçek
 * count dış katmanda hesaplanır).
 */
export function toPriceList(
  rec: PriceListRecord,
  itemCount: number,
): PriceList {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    name: rec.name,
    description: rec.description,
    type: rec.type,
    customerId: rec.customerId,
    currency: rec.currency,
    taxProfile: rec.taxProfile,
    validFrom: rec.validFrom,
    validUntil: rec.validUntil,
    status: rec.status,
    itemCount,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
    archivedAt: rec.archivedAt,
    archivedBy: rec.archivedBy,
    archiveReason: rec.archiveReason,
  };
}

/** Record → public PriceListItem (API response). */
export function toPriceListItem(rec: PriceListItemRecord): PriceListItem {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    priceListId: rec.priceListId,
    productId: rec.productId,
    price: rec.price,
    taxProfile: rec.taxProfile,
    validFrom: rec.validFrom,
    validUntil: rec.validUntil,
    status: rec.status,
    supersedesId: rec.supersedesId,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
  };
}

/**
 * Decimal string'i normalize et (gereksiz baştan sıfırları kırp).
 * Format: `^\d+(\.\d{1,4})?$`. Geçersiz formatta null döner.
 */
export function normalizePricingDecimal(value: string): string | null {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return null;
  const parts = value.split(".");
  const intPart = parts[0] ?? "0";
  const fracPart = parts[1];
  const normalizedInt =
    intPart.length > 1 ? intPart.replace(/^0+(?=\d)/, "") : intPart;
  return fracPart !== undefined
    ? `${normalizedInt}.${fracPart}`
    : normalizedInt;
}

/**
 * Verilen liste durumunun belirli bir tarihte geçerli olup
 * olmadığını hesaplar. Sadece `active` durumu `effectiveAt` için
 * uygundur; `draft` henüz yayında değil, `expired` süresi geçmiş,
 * `archived` listeden çıkarılmış sayılır.
 */
export function isListEffectiveAt(
  rec: PriceListRecord,
  effectiveAt: Date,
): boolean {
  if (rec.status !== "active") return false;
  if (rec.archivedAt !== null) return false;
  if (
    rec.validFrom !== null &&
    new Date(rec.validFrom).getTime() > effectiveAt.getTime()
  )
    return false;
  if (
    rec.validUntil !== null &&
    new Date(rec.validUntil).getTime() < effectiveAt.getTime()
  )
    return false;
  return true;
}

/**
 * Verilen satırın belirli bir tarihte geçerli olup olmadığını
 * hesaplar. `active` durumundaki ve tarih aralığına uyan satırlar
 * adaydır.
 */
export function isItemEffectiveAt(
  rec: PriceListItemRecord,
  effectiveAt: Date,
): boolean {
  if (rec.status !== "active") return false;
  if (
    rec.validFrom !== null &&
    new Date(rec.validFrom).getTime() > effectiveAt.getTime()
  )
    return false;
  if (
    rec.validUntil !== null &&
    new Date(rec.validUntil).getTime() < effectiveAt.getTime()
  )
    return false;
  return true;
}

/**
 * Fiyat listesi türüne göre resolver önceliği. customer_specific
 * en yüksek önceliğe sahiptir; ardından promotional, sonra standard.
 */
export const PRICE_LIST_TYPE_PRIORITY: Readonly<Record<PriceListType, number>> =
  {
    customer_specific: 3,
    promotional: 2,
    standard: 1,
  };
