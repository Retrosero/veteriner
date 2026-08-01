/**
 * @file Stok uyarısı (düşük stok + SKT) domain tipleri.
 * @module apps/api/common/stock-alerts/stock-alert.types
 *
 * @description GOAL-067 (FAZ-6) düşük stok ve SKT uyarıları domain
 * modeli. İki uyarı türü:
 * - `LowStockAlertRecord` — ürünün net stoğu eşiğin altına düştü.
 * - `ExpiringLotAlertRecord` — lot SKT'si yaklaşıyor veya geçmiş.
 *
 * **On-demand compute** mimarisi: uyarılar talep üzerine hesaplanır;
 * ack'lar ayrı tabloda (`stockAlertAckRecord`) tutulur. Compute
 * edilen sonuç transient'tır; her `refresh` çağrısında yeniden
 * hesaplanır. Ack'lar refresh'te korunur (default) veya
 * `resetAcknowledgements=true` ile sıfırlanır.
 *
 * In-memory Map'te tutulur; production'a geçişte Prisma tabloları
 * ile değiştirilecek (API sözleşmesi sabit).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Uyarılar üzerinde fiziksel
 *   silme YOKTUR; ack'lar soft delete mantığıyla tutulur.
 *
 * @since GOAL-067 (FAZ-6) düşük stok ve SKT uyarıları core
 */

import type {
  ExpiringLotAlert,
  ExpiringLotAlertSeverity,
  ExpiringLotAlertStatus,
  LowStockAlert,
  LowStockAlertSeverity,
  LowStockAlertStatus,
  ProductKind,
  ProductUnit,
} from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * LowStockAlert
 * -------------------------------------------------------------------------- */

/** Persist edilmiş compute sonucu. */
export interface LowStockAlertRecord {
  /** `tenantId|productId` deterministik; aynı ürün için tek uyarı. */
  id: string;
  tenantId: string;
  productId: string;
  productName: string;
  productSku: string | null;
  productKind: ProductKind;
  unit: ProductUnit;
  /** Decimal string. */
  currentQuantity: string;
  /** Decimal string. */
  threshold: string;
  severity: LowStockAlertSeverity;
  status: LowStockAlertStatus;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  computedAt: string;
}

/** Record → public LowStockAlert (API response). */
export function toLowStockAlert(rec: LowStockAlertRecord): LowStockAlert {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    productId: rec.productId,
    productName: rec.productName,
    productSku: rec.productSku,
    productKind: rec.productKind,
    unit: rec.unit,
    currentQuantity: rec.currentQuantity,
    threshold: rec.threshold,
    severity: rec.severity,
    status: rec.status,
    acknowledgedAt: rec.acknowledgedAt,
    acknowledgedBy: rec.acknowledgedBy,
    computedAt: rec.computedAt,
  };
}

/* --------------------------------------------------------------------------
 * ExpiringLotAlert
 * -------------------------------------------------------------------------- */

/** Persist edilmiş compute sonucu. */
export interface ExpiringLotAlertRecord {
  /** `tenantId|lotId` deterministik. */
  id: string;
  tenantId: string;
  lotId: string;
  lotNumber: string;
  productId: string;
  productName: string;
  productSku: string | null;
  expiryDate: string;
  daysUntilExpiry: number;
  currentQuantity: string;
  severity: ExpiringLotAlertSeverity;
  status: ExpiringLotAlertStatus;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  computedAt: string;
}

/** Record → public ExpiringLotAlert (API response). */
export function toExpiringLotAlert(
  rec: ExpiringLotAlertRecord,
): ExpiringLotAlert {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    lotId: rec.lotId,
    lotNumber: rec.lotNumber,
    productId: rec.productId,
    productName: rec.productName,
    productSku: rec.productSku,
    expiryDate: rec.expiryDate,
    daysUntilExpiry: rec.daysUntilExpiry,
    currentQuantity: rec.currentQuantity,
    severity: rec.severity,
    status: rec.status,
    acknowledgedAt: rec.acknowledgedAt,
    acknowledgedBy: rec.acknowledgedBy,
    computedAt: rec.computedAt,
  };
}

/* --------------------------------------------------------------------------
 * Acknowledge state
 * -------------------------------------------------------------------------- */

/**
 * Acknowledge state. key: `tenantId|alertKey` (alertKey =
 * `lowStock:productId` veya `expiring:lotId`). Yalnızca
 * `acknowledged` kayıtları tutulur; `active`/`resolved` durumlar
 * ack olmadan anlaşılır (compute sırasında set edilir).
 */
export interface StockAlertAckRecord {
  tenantId: string;
  alertKey: string;
  /** "lowStock" | "expiring". */
  alertType: "lowStock" | "expiring";
  /** Referans (productId veya lotId). */
  targetId: string;
  acknowledgedAt: string;
  acknowledgedBy: string;
  note: string | null;
}

/* --------------------------------------------------------------------------
 * Yardımcılar
 * -------------------------------------------------------------------------- */

/** LowStockAlert deterministik ID. */
export function lowStockAlertId(tenantId: string, productId: string): string {
  return `lsa-${tenantId.slice(0, 8)}-${productId}`;
}

/** ExpiringLotAlert deterministik ID. */
export function expiringLotAlertId(tenantId: string, lotId: string): string {
  return `ela-${tenantId.slice(0, 8)}-${lotId}`;
}

/** Ack key. */
export function stockAlertAckKey(
  alertType: "lowStock" | "expiring",
  targetId: string,
): string {
  return `${alertType}:${targetId}`;
}

/** Decimal karşılaştırma: a <= b ? Pozitif değer döner (bigint scaled 10000). */
export function decimalLessOrEqual(a: string, b: string): boolean {
  return compareDecimals(a, b) <= 0;
}

/** Decimal karşılaştırma: a < 0 ? */
export function decimalIsNegative(a: string): boolean {
  return compareDecimals(a, "0") < 0;
}

/**
 * İki decimal string'i karşılaştır (scaled bigint 10000 çarpanı).
 * Sonuç: a<b → negatif, a==b → 0, a>b → pozitif.
 * Geçersiz format durumunda büyük pozitif kabul edilir
 * (compare aleyhine sonuçlanmaz; testlerde geçersiz değer
 * oluşmamalı).
 */
export function compareDecimals(a: string, b: string): number {
  const aBig = decimalToScaledBigInt(a);
  const bBig = decimalToScaledBigInt(b);
  if (aBig === null && bBig === null) return 0;
  if (aBig === null) return 1;
  if (bBig === null) return -1;
  if (aBig < bBig) return -1;
  if (aBig > bBig) return 1;
  return 0;
}

/** Scaled bigint 10000 çarpanı. */
function decimalToScaledBigInt(value: string): bigint | null {
  if (!/^-?\d+(\.\d{1,4})?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const abs = negative ? value.slice(1) : value;
  const [intPartRaw, fracPartRaw = ""] = abs.split(".");
  const intPart = intPartRaw ?? "0";
  const fracPadded = (fracPartRaw + "0000").slice(0, 4);
  return negative
    ? -(BigInt(intPart) * BigInt(10000) + BigInt(fracPadded))
    : BigInt(intPart) * BigInt(10000) + BigInt(fracPadded);
}

/**
 * SKT'ye kalan gün sayısını hesapla (UTC gün bazında, kesirli
 * günler aşağı yuvarlanır). SKT geçmişse negatif değer.
 * `now` parametresi test için enjekte edilebilir.
 */
export function daysUntilExpiry(
  expiryDate: string,
  now: Date = new Date(),
): number {
  const expiryMs = Date.parse(expiryDate);
  if (Number.isNaN(expiryMs)) return Number.MAX_SAFE_INTEGER;
  const diffMs = expiryMs - now.getTime();
  // Tam gün sayısı (aşağı yuvarlama).
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  // SKT geçmişse daha küçük (negatif) değer ister; 24 saatten az
  // kaldıysa bile "0 gün kaldı" olarak raporlanmalı.
  if (diffMs <= 0) {
    return Math.floor(diffMs / MS_PER_DAY);
  }
  return Math.floor(diffMs / MS_PER_DAY);
}

/**
 * SKT uyarı şiddetini hesapla.
 * - `expired`   : daysUntilExpiry <= 0
 * - `critical`  : 1..7 gün kaldı
 * - `warning`   : 8..daysAhead gün kaldı
 */
export function computeExpirySeverity(
  daysUntil: number,
): ExpiringLotAlertSeverity {
  if (daysUntil <= 0) return "expired";
  if (daysUntil <= 7) return "critical";
  return "warning";
}

/**
 * Düşük stok uyarı şiddetini hesapla.
 * - `critical` : currentQuantity <= 0
 * - `warning`  : 0 < currentQuantity <= threshold
 */
export function computeLowStockSeverity(
  currentQuantity: string,
): LowStockAlertSeverity {
  if (decimalIsNegative(currentQuantity) || currentQuantity === "0") {
    return "critical";
  }
  return "warning";
}
