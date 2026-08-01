/**
 * @file Petshop satış (POS) domain tipleri.
 * @module apps/api/common/petshop-sales/petshop-sale.types
 *
 * @description GOAL-064 (FAZ-6) petshop POS domain modeli.
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `PetshopSale` + `PetshopSaleLine` tabloları ile değiştirilecek
 * (API sözleşmesi sabit kalır).
 *
 * Yaşam döngüsü:
 * - `draft` → `completed` (stok düşümü) | `cancelled`
 * - `completed` → `cancelled` (stok iade hareketi oluşturulur)
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Satış üzerinde fiziksel silme yoktur; iptal `cancelled` durumuna
 *   geçiş + gerekirse ters kayıt (stock-movements) ile yapılır.
 *
 * @since GOAL-064 (FAZ-6) petshop POS core
 */

import type {
  PetshopPaymentMethod,
  PetshopSale,
  PetshopSaleLine,
  PetshopSaleStatus,
} from "@vetniva/contracts";

/** Persist edilmiş satış satırı record. */
export interface PetshopSaleLineRecord {
  id: string;
  tenantId: string;
  saleId: string;
  productId: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discountPercent: number;
  /** quantity * unitPrice * (1 - discountPercent/100) (Decimal string). */
  lineTotal: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Persist edilmiş satış record. */
export interface PetshopSaleRecord {
  id: string;
  tenantId: string;
  status: PetshopSaleStatus;
  customerOwnerId: string | null;
  customerPatientId: string | null;
  paymentMethod: PetshopPaymentMethod;
  paidAmount: string;
  totalAmount: string;
  globalDiscountPercent: number;
  netAmount: string;
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
  PetshopSale,
  PetshopSaleLine,
  PetshopSaleStatus,
  PetshopPaymentMethod,
};

/** Record → public PetshopSale. */
export function toPetshopSale(rec: PetshopSaleRecord): PetshopSale {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    status: rec.status,
    customerOwnerId: rec.customerOwnerId,
    customerPatientId: rec.customerPatientId,
    paymentMethod: rec.paymentMethod,
    paidAmount: rec.paidAmount,
    totalAmount: rec.totalAmount,
    globalDiscountPercent: rec.globalDiscountPercent,
    netAmount: rec.netAmount,
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

/** Record → public PetshopSaleLine. */
export function toPetshopSaleLine(rec: PetshopSaleLineRecord): PetshopSaleLine {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    saleId: rec.saleId,
    productId: rec.productId,
    unit: rec.unit,
    quantity: rec.quantity,
    unitPrice: rec.unitPrice,
    discountPercent: rec.discountPercent,
    lineTotal: rec.lineTotal,
    notes: rec.notes,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

/**
 * Decimal string çarpma (purchase-order'daki ile uyumlu).
 * 4 ondalık basamağa kadar.
 */
export function multiplyDecimalString(a: string, b: string): string | null {
  if (!/^\d+(\.\d{1,4})?$/.test(a)) return null;
  if (!/^\d+(\.\d{1,4})?$/.test(b)) return null;
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
