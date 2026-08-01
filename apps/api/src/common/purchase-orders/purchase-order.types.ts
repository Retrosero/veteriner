/**
 * @file Satın alma siparişi (purchase order) domain tipleri.
 * @module apps/api/common/purchase-orders/purchase-order.types
 *
 * @description GOAL-062 (FAZ-6) satın alma siparişi domain modeli.
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `PurchaseOrder` + `PurchaseOrderLine` tabloları ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * Yaşam döngüsü:
 * - `draft` → `approved` → (`partial` ↔ `received`) | `cancelled`
 *
 * Satır alanları:
 * - `orderedQuantity` (Decimal string): sipariş verilen miktar.
 * - `unitPrice` (Decimal string): sipariş anındaki birim alış fiyatı.
 * - `lineTotal` (Decimal string): `orderedQuantity * unitPrice`.
 * - `receivedQuantity` (Decimal string): şimdiye kadar kabul edilen
 *   toplam miktar (0..orderedQuantity).
 * - `unitCost` (Decimal string | null): mal kabul sırasında gerçek
 *   alış maliyeti (indirim/kargo dahil). null = henüz kabul yok.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Satın alma siparişi üzerinde fiziksel silme yoktur; iptal
 *   `cancelled` durumuna geçiş ile yapılır. Geçmiş siparişler
 *   audit trail'de korunur.
 *
 * @since GOAL-062 (FAZ-6) tedarikçi ve satın alma core
 */

import type {
  PurchaseOrder,
  PurchaseOrderCurrency,
  PurchaseOrderLine,
  PurchaseOrderStatus,
} from "@vetniva/contracts";

/** Persist edilmiş sipariş satırı record. */
export interface PurchaseOrderLineRecord {
  id: string;
  tenantId: string;
  purchaseOrderId: string;
  productId: string;
  unit: string;
  orderedQuantity: string;
  unitPrice: string;
  lineTotal: string;
  receivedQuantity: string;
  unitCost: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Persist edilmiş sipariş record. */
export interface PurchaseOrderRecord {
  id: string;
  tenantId: string;
  supplierId: string;
  branchId: string | null;
  status: PurchaseOrderStatus;
  currency: PurchaseOrderCurrency;
  expectedAt: string | null;
  totalAmount: string;
  notes: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export type {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  PurchaseOrderCurrency,
};

/** Record → public PurchaseOrder. */
export function toPurchaseOrder(rec: PurchaseOrderRecord): PurchaseOrder {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    supplierId: rec.supplierId,
    branchId: rec.branchId,
    status: rec.status,
    currency: rec.currency,
    expectedAt: rec.expectedAt,
    totalAmount: rec.totalAmount,
    notes: rec.notes,
    approvedAt: rec.approvedAt,
    approvedBy: rec.approvedBy,
    receivedAt: rec.receivedAt,
    receivedBy: rec.receivedBy,
    cancelledAt: rec.cancelledAt,
    cancelledBy: rec.cancelledBy,
    cancelReason: rec.cancelReason,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}

/** Record → public PurchaseOrderLine. */
export function toPurchaseOrderLine(
  rec: PurchaseOrderLineRecord,
): PurchaseOrderLine {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    purchaseOrderId: rec.purchaseOrderId,
    productId: rec.productId,
    unit: rec.unit,
    orderedQuantity: rec.orderedQuantity,
    unitPrice: rec.unitPrice,
    lineTotal: rec.lineTotal,
    receivedQuantity: rec.receivedQuantity,
    unitCost: rec.unitCost,
    notes: rec.notes,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

/**
 * Decimal string çarpımı. Geçersiz formatta null döner.
 * 4 ondalık basamağa kadar destekler; sonuçta fazla sıfırları kırpar.
 */
export function multiplyDecimalString(a: string, b: string): string | null {
  if (!/^\d+(\.\d{1,4})?$/.test(a)) return null;
  if (!/^\d+(\.\d{1,4})?$/.test(b)) return null;
  // Ondalık noktayı kaldırıp tamsayı çarpımı yap; sonra noktayı geri koy.
  const split = (v: string): { int: bigint; scale: number } => {
    const parts = v.split(".");
    const intPart = parts[0] ?? "0";
    const fracPart = parts[1] ?? "";
    return {
      int: BigInt(intPart + fracPart),
      scale: fracPart.length,
    };
  };
  const A = split(a);
  const B = split(b);
  const product = A.int * B.int;
  const totalScale = A.scale + B.scale;
  // String olarak yerleştir.
  const s = product.toString().padStart(totalScale + 1, "0");
  let intPartStr: string;
  let fracPartStr: string;
  if (totalScale === 0) {
    intPartStr = s;
    fracPartStr = "";
  } else {
    intPartStr = s.slice(0, s.length - totalScale) || "0";
    fracPartStr = s.slice(s.length - totalScale);
  }
  // Fazla sıfırları kırp (sondaki sıfırları fracPart'tan at).
  fracPartStr = fracPartStr.replace(/0+$/, "");
  return fracPartStr.length > 0 ? `${intPartStr}.${fracPartStr}` : intPartStr;
}

/**
 * Decimal string toplama. Geçersiz formatta null döner.
 * Basit implementasyon: aynı ondalık ölçeğe tamamla, topla, normalize et.
 */
export function addDecimalString(a: string, b: string): string | null {
  if (!/^\d+(\.\d{1,4})?$/.test(a)) return null;
  if (!/^\d+(\.\d{1,4})?$/.test(b)) return null;
  const align = (v: string, scale: number): bigint => {
    const parts = v.split(".");
    const intPart = parts[0] ?? "0";
    const fracPart = (parts[1] ?? "").padEnd(scale, "0");
    return BigInt(intPart + fracPart);
  };
  const scaleA = (a.split(".")[1] ?? "").length;
  const scaleB = (b.split(".")[1] ?? "").length;
  const totalScale = Math.max(scaleA, scaleB);
  const A = align(a, totalScale);
  const B = align(b, totalScale);
  const sum = A + B;
  const s = sum.toString().padStart(totalScale + 1, "0");
  let intPartStr: string;
  let fracPartStr: string;
  if (totalScale === 0) {
    intPartStr = s;
    fracPartStr = "";
  } else {
    intPartStr = s.slice(0, s.length - totalScale) || "0";
    fracPartStr = s.slice(s.length - totalScale);
  }
  fracPartStr = fracPartStr.replace(/0+$/, "");
  return fracPartStr.length > 0 ? `${intPartStr}.${fracPartStr}` : intPartStr;
}

/**
 * Decimal string karşılaştırma. a < b → -1, a > b → 1, a == b → 0.
 * Geçersiz formatta null döner.
 */
export function compareDecimalString(a: string, b: string): number | null {
  if (!/^\d+(\.\d{1,4})?$/.test(a)) return null;
  if (!/^\d+(\.\d{1,4})?$/.test(b)) return null;
  const align = (v: string, scale: number): bigint => {
    const parts = v.split(".");
    const intPart = parts[0] ?? "0";
    const fracPart = (parts[1] ?? "").padEnd(scale, "0");
    return BigInt(intPart + fracPart);
  };
  const scaleA = (a.split(".")[1] ?? "").length;
  const scaleB = (b.split(".")[1] ?? "").length;
  const totalScale = Math.max(scaleA, scaleB);
  const A = align(a, totalScale);
  const B = align(b, totalScale);
  if (A < B) return -1;
  if (A > B) return 1;
  return 0;
}
