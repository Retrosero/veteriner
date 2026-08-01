/**
 * @file Petshop satış iadesi domain tipleri.
 * @module apps/api/common/petshop-sale-returns/petshop-sale-return.types
 *
 * @description GOAL-065 (FAZ-6) petshop satış iadesi domain modeli.
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `PetshopSaleReturn` + `PetshopSaleReturnLine` tabloları ile
 * değiştirilecek (API sözleşmesi sabit kalır).
 *
 * Yaşam döngüsü:
 * - `draft`     — iade taslağı; satırlar düzenlenebilir, henüz
 *                 stok hareketi oluşmamıştır.
 * - `completed` — her satır için `return` stok hareketi oluşturuldu;
 *                 tahsilat ters kaydı yapıldı.
 * - `cancelled` — iptal edildi.
 *
 * Stok ilişkisi:
 * - `completed` duruma geçerken her satır için
 *   `StockMovementsService.createSystemMovement` çağrılır
 *   (ürün `purchaseTracked` ise).
 * - `lotId` belirtilen satırlarda hareket lotId ile bağlanır.
 * - Miktar pozitif: stoğa giriş.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   İade üzerinde fiziksel silme yoktur; iptal `cancelled` durumuna
 *   geçiş ile yapılır.
 *
 * @since GOAL-065 (FAZ-6) petshop satış iadesi core
 */

import type {
  PetshopPaymentMethod,
  PetshopSaleReturn,
  PetshopSaleReturnLine,
  PetshopSaleReturnStatus,
} from "@vetniva/contracts";

/** Persist edilmiş iade satırı record. */
export interface PetshopSaleReturnLineRecord {
  id: string;
  tenantId: string;
  returnId: string;
  originalLineId: string;
  productId: string;
  lotId: string | null;
  unit: string;
  quantity: string;
  unitPrice: string;
  discountPercent: number;
  /** quantity * unitPrice * (1 - discountPercent/100) (Decimal string). */
  lineTotal: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Persist edilmiş iade record. */
export interface PetshopSaleReturnRecord {
  id: string;
  tenantId: string;
  status: PetshopSaleReturnStatus;
  originalSaleId: string;
  customerOwnerId: string | null;
  customerPatientId: string | null;
  refundMethod: PetshopPaymentMethod;
  totalAmount: string;
  globalDiscountPercent: number;
  refundAmount: string;
  reason: string;
  notes: string | null;
  completedAt: string | null;
  completedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export type {
  PetshopSaleReturn,
  PetshopSaleReturnLine,
  PetshopSaleReturnStatus,
  PetshopPaymentMethod,
};

/** Record → public PetshopSaleReturn. */
export function toPetshopSaleReturn(
  rec: PetshopSaleReturnRecord,
): PetshopSaleReturn {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    status: rec.status,
    originalSaleId: rec.originalSaleId,
    customerOwnerId: rec.customerOwnerId,
    customerPatientId: rec.customerPatientId,
    refundMethod: rec.refundMethod,
    totalAmount: rec.totalAmount,
    globalDiscountPercent: rec.globalDiscountPercent,
    refundAmount: rec.refundAmount,
    reason: rec.reason,
    notes: rec.notes,
    completedAt: rec.completedAt,
    completedBy: rec.completedBy,
    cancelledAt: rec.cancelledAt,
    cancelledBy: rec.cancelledBy,
    cancelReason: rec.cancelReason,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
    updatedAt: rec.updatedAt,
  };
}

/** Record → public PetshopSaleReturnLine. */
export function toPetshopSaleReturnLine(
  rec: PetshopSaleReturnLineRecord,
): PetshopSaleReturnLine {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    returnId: rec.returnId,
    originalLineId: rec.originalLineId,
    productId: rec.productId,
    lotId: rec.lotId,
    unit: rec.unit,
    quantity: rec.quantity,
    unitPrice: rec.unitPrice,
    discountPercent: rec.discountPercent,
    lineTotal: rec.lineTotal,
    reason: rec.reason,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

/* --------------------------------------------------------------------------
 * Decimal yardımcıları (petshop-sale.types ile aynı yaklaşım)
 * -------------------------------------------------------------------------- */

const DECIMAL_RE = /^\d+(\.\d{1,4})?$/;

/**
 * Decimal string çarpma. 4 ondalık basamağa kadar.
 * Geçersiz girdi → null.
 */
export function multiplyDecimalString(a: string, b: string): string | null {
  if (!DECIMAL_RE.test(a)) return null;
  if (!DECIMAL_RE.test(b)) return null;
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
  fracPartStr = fracPartStr.replace(/0+$/, "");
  return fracPartStr.length > 0 ? `${intPartStr}.${fracPartStr}` : intPartStr;
}

/**
 * Decimal string toplama. Geçersiz girdi → null.
 */
export function addDecimalString(a: string, b: string): string | null {
  if (!DECIMAL_RE.test(a)) return null;
  if (!DECIMAL_RE.test(b)) return null;
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
