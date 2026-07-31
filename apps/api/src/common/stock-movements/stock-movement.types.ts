/**
 * @file Stok hareketi (StockMovement) domain tipleri.
 * @module apps/api/common/stock-movements/stock-movement.types
 *
 * @description GOAL-063 (FAZ-6) stok hareketleri ve sayım domain
 * modeli. **Append-only** mimari: tüm stok değişiklikleri tek bir
 * hareket tablosuna yazılır; mevcut miktar (`netQuantity`)
 * hareketlerin toplamından hesaplanır.
 *
 * 9 hareket türü:
 * - `purchase` — tedarik kabul (purchase order receive veya manuel).
 * - `sale` — petshop/klinik satış çıkışı.
 * - `clinical_use` — klinik tüketim.
 * - `vaccination` — aşı uygulaması çıkışı.
 * - `return` — müşteriden/tedarikçiden iade.
 * - `transfer` — şube/depo arası transfer (çift kayıt ile temsil edilir).
 * - `count_adjustment` — sayım farkı (neden zorunlu).
 * - `waste` — imha (neden zorunlu).
 * - `reversal` — ters kayıt (neden zorunlu; `reversesMovementId` bağlı).
 *
 * **Neden `service` türünde değil?** Stok miktarı
 * `purchaseTracked=true` olan ürünler için tutulur. `service`
 * türünde ürünlerin stok takibi yapılmaz (clinical service).
 *
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `StockMovement` tablosu ile değiştirilecek (API sözleşmesi sabit).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Hareketler üzerinde
 *   fiziksel silme YOKTUR; iptal yalnızca `reversal` hareketi
 *   ile yapılır (audit trail korunur).
 *
 * @since GOAL-063 (FAZ-6) stok hareketleri ve sayım core
 */

import type {
  StockBalance,
  StockMovement,
  StockMovementType,
} from "@vetniva/contracts";

import { REASON_REQUIRED_MOVEMENT_TYPES } from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Persist edilmiş hareket record
 * -------------------------------------------------------------------------- */

/**
 * Stok hareketi record. Public `StockMovement` sözleşmesi ile aynı
 * alanlar; ek olarak tenant izolasyonu ve audit için metadata.
 */
export interface StockMovementRecord {
  id: string;
  tenantId: string;
  type: StockMovementType;
  productId: string;
  lotId: string | null;
  /** İşaretli decimal string: pozitif = giriş, negatif = çıkış. */
  quantity: string;
  unitCost: string | null;
  unitPrice: string | null;
  sourceType: string | null;
  sourceId: string | null;
  reversesMovementId: string | null;
  reason: string | null;
  occurredAt: string;
  notes: string | null;
  createdAt: string;
  createdBy: string;
}

export type { StockMovementType, StockMovement, StockBalance };

/** Record → public StockMovement (API response). */
export function toStockMovement(rec: StockMovementRecord): StockMovement {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    type: rec.type,
    productId: rec.productId,
    lotId: rec.lotId,
    quantity: rec.quantity,
    unitCost: rec.unitCost,
    unitPrice: rec.unitPrice,
    sourceType: rec.sourceType,
    sourceId: rec.sourceId,
    reversesMovementId: rec.reversesMovementId,
    reason: rec.reason,
    occurredAt: rec.occurredAt,
    notes: rec.notes,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
  };
}

/* --------------------------------------------------------------------------
 * Quantity yardımcıları
 * -------------------------------------------------------------------------- */

/**
 * Decimal string'i normalize et (ürün/lot modülü ile uyumlu).
 * İşaret korunur: "-012.30" → "-12.30", "5" → "5", "0.100" → "0.100",
 * "-0" → "-0". Geçersiz formatta null döner (caller validate eder).
 */
export function normalizeSignedDecimal(value: string): string | null {
  if (!/^-?\d+(\.\d{1,4})?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const abs = negative ? value.slice(1) : value;
  const parts = abs.split(".");
  const intPart = parts[0] ?? "0";
  const fracPart = parts[1];
  const normalizedInt =
    intPart.length > 1 ? intPart.replace(/^0+(?=\d)/, "") : intPart;
  const body = fracPart !== undefined ? `${normalizedInt}.${fracPart}` : normalizedInt;
  return negative && body !== "0" ? `-${body}` : body;
}

/**
 * Decimal string'i sayısal karşılaştırma için BigInt'e çevir.
 * Ondalık kısım 4 basamağa kadar normalize edilir (10000 çarpanı).
 * Geçersiz format → null.
 */
export function decimalToScaledBigInt(value: string): bigint | null {
  if (!/^-?\d+(\.\d{1,4})?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const abs = negative ? value.slice(1) : value;
  const [intPartRaw, fracPartRaw = ""] = abs.split(".");
  const intPart = intPartRaw ?? "0";
  const fracPadded = (fracPartRaw + "0000").slice(0, 4);
  const combined = BigInt(intPart) * BigInt(10000) + BigInt(fracPadded);
  return negative ? -combined : combined;
}

/**
 * İki decimal string'i topla (scaled). Geçersiz → null.
 * Pilot kapsamda miktar overflow riski düşük (klinik stok); yine
 * de 64-bit sınırı içinde tutmak için BigInt kullanılır.
 */
export function addSignedDecimals(a: string, b: string): string | null {
  const av = decimalToScaledBigInt(a);
  const bv = decimalToScaledBigInt(b);
  if (av === null || bv === null) return null;
  const sum = av + bv;
  return bigIntToSignedDecimal(sum);
}

/**
 * Decimal string'in işaretini tersine çevir. "5" → "-5", "-3.5" → "3.5".
 */
export function negateSignedDecimal(value: string): string | null {
  const scaled = decimalToScaledBigInt(value);
  if (scaled === null) return null;
  return bigIntToSignedDecimal(-scaled);
}

function bigIntToSignedDecimal(scaled: bigint): string {
  const negative = scaled < BigInt(0);
  const abs = negative ? -scaled : scaled;
  const intPart = abs / BigInt(10000);
  const fracPart = abs % BigInt(10000);
  const intStr = intPart.toString();
  const fracStr = fracPart.toString().padStart(4, "0").replace(/0+$/, "");
  const body = fracStr.length > 0 ? `${intStr}.${fracStr}` : intStr;
  return negative && body !== "0" ? `-${body}` : body;
}

/* --------------------------------------------------------------------------
 * Domain kuralları
 * -------------------------------------------------------------------------- */

/**
 * `count_adjustment` / `waste` / `reversal` türleri için neden
 * zorunlu mu? Set'i contracts'tan re-export edilir; burada
 * yardımcı kontrol fonksiyonu.
 */
export function requiresReason(type: StockMovementType): boolean {
  return REASON_REQUIRED_MOVEMENT_TYPES.has(type);
}

/**
 * Hareketin stok-üzerinde etkisi. `purchase`/`return` pozitif,
 * `sale`/`clinical_use`/`vaccination`/`waste`/`reversal`
 * (reversal orijinali tersine çevirdiği için orijinalin işareti
 * tersidir) negatif. `transfer` iki ayrı hareket olarak temsil
 * edilir (kaynak: negatif, hedef: pozitif) — bu fonksiyon
 * transfer için çağrılmaz, çağıran kendi işaretini seçer.
 */
export function movementAffectsStock(
  type: StockMovementType,
  reversesOriginalType: StockMovementType | null,
): "in" | "out" {
  if (type === "reversal") {
    // reversal, orijinal hareketin tersi yönde etki eder.
    const base = reversesOriginalType ?? "purchase";
    return movementAffectsStock(base, null) === "in" ? "out" : "in";
  }
  switch (type) {
    case "purchase":
    case "return":
      return "in";
    case "sale":
    case "clinical_use":
    case "vaccination":
    case "waste":
    case "count_adjustment":
      return "count_adjustment" === type
        ? // count_adjustment işarete göre yön belirler; burada
          // varsayılan olarak "out" (negatif) kabul ediyoruz.
          // Pozitif count_adjustment için caller pozitif quantity
          // gönderebilir; etiket bilgilendiricidir.
          "out"
        : "out";
    case "transfer":
      // transfer tek başına yönsüz; iki ayrı hareket yazılır.
      return "in";
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return "out";
    }
  }
}
