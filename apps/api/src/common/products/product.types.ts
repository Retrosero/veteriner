/**
 * @file Ürün/hizmet kataloğu domain tipleri.
 * @module apps/api/common/products/product.types
 *
 * @description GOAL-060 (FAZ-6) ürün ve hizmet kataloğu domain
 * modeli. Klinik + petshop ortak katalog; tek tip (Product) üzerinden
 * 5 tür (stock_product, medicine, vaccine, service, consumable) temsil
 * edilir. `vaccineProtocolId` Faz 5 vaccine protokolüne referans
 * tutar; diğer alanlar (medicine için `requiresPrescription`,
 * `controlledDrug` UK ilaç regülasyonu için) klinik iş kuralları
 * ile kullanılır.
 *
 * In-memory Map'te tutulur; production'a geçişte Prisma `Product`
 * tablosu ile değiştirilecek (API sözleşmesi sabit).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Ürün üzerinde fiziksel silme
 *   yoktur; arşivleme `archivedAt` alanı ile yapılır (soft delete,
 *   klinik + finansal kayıt politikası). Geçmiş satış/alış
 *   hareketleri ürün silinse bile audit trail'de korunur.
 *
 * @since GOAL-060 (FAZ-6) ürün ve hizmet kataloğu core
 */

import type {
  Product,
  ProductCurrency,
  ProductKind,
  ProductTaxProfile,
  ProductUnit,
} from "@vetniva/contracts";

/**
 * Persist edilmiş product record. API sözleşmesinden (public
 * Product) ek olarak `active` ve `archivedBy`/`archiveReason` tutulur.
 * `active` alanı kullanıcının ürünü aktif/pasif yapması içindir
 * (archivedAt'tan farklı — pasif ürün listede görünür, arşivlenmiş
 * görünmez).
 */
export interface ProductRecord {
  id: string;
  tenantId: string;
  kind: ProductKind;
  sku: string | null;
  barcode: string | null;
  name: string;
  category: string | null;
  unit: ProductUnit;
  taxProfile: ProductTaxProfile;
  /** Decimal string; alış fiyatı. */
  purchasePrice: string | null;
  /** Decimal string; satış fiyatı. */
  salePrice: string | null;
  currency: ProductCurrency;
  clinicUsage: boolean;
  petshopUsage: boolean;
  saleAvailable: boolean;
  purchaseTracked: boolean;
  vaccineProtocolId: string | null;
  requiresPrescription: boolean;
  controlledDrug: boolean;
  notes: string | null;
  active: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
}

export type {
  Product,
  ProductCurrency,
  ProductKind,
  ProductTaxProfile,
  ProductUnit,
};

/** Record → public Product (API response). */
export function toProduct(rec: ProductRecord): Product {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    kind: rec.kind,
    sku: rec.sku,
    barcode: rec.barcode,
    name: rec.name,
    category: rec.category,
    unit: rec.unit,
    taxProfile: rec.taxProfile,
    purchasePrice: rec.purchasePrice,
    salePrice: rec.salePrice,
    currency: rec.currency,
    clinicUsage: rec.clinicUsage,
    petshopUsage: rec.petshopUsage,
    saleAvailable: rec.saleAvailable,
    purchaseTracked: rec.purchaseTracked,
    vaccineProtocolId: rec.vaccineProtocolId,
    requiresPrescription: rec.requiresPrescription,
    controlledDrug: rec.controlledDrug,
    notes: rec.notes,
    active: rec.active,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
    archivedAt: rec.archivedAt,
    archivedBy: rec.archivedBy,
    archiveReason: rec.archiveReason,
  };
}

/**
 * Decimal string'i normalize et (gereksiz baştan sıfırları kırp).
 * Örnek: "012.30" → "12.30"; "5" → "5"; "0.100" → "0.100".
 * Geçersiz formatta null döner (caller validate eder).
 */
export function normalizeDecimalString(value: string): string | null {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return null;
  // Fazla ön sıfırları kırp (ama tamamen "0" korunur).
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
 * SKU otomatik üretim. Format: `prd-{kind[0]}{6 haneli sayı}`.
 * Örnek: stock_product → "prd-s000001", medicine → "prd-m000001",
 * service → "prd-v000001" (kind baş harfi: s/m/v/s/c).
 * Tür eşleme: stock_product→s, medicine→m, vaccine→v, service→r
 * (servis s ile çakıştığı için r), consumable→c.
 */
export function generateSku(kind: ProductKind, counter: number): string {
  const kindChar: Record<ProductKind, string> = {
    stock_product: "s",
    medicine: "m",
    vaccine: "v",
    service: "r",
    consumable: "c",
  };
  return `prd-${kindChar[kind]}${String(counter).padStart(6, "0")}`;
}
