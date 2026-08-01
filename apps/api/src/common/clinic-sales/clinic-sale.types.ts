/**
 * @file Klinik satış/fatura taslağı (clinic sale) domain tipleri.
 * @module apps/api/common/clinic-sales/clinic-sale.types
 *
 * @description GOAL-071 (FAZ-7) klinik satış taslağı domain modeli.
 * In-memory Map'te tutulur; production'a geçişte Prisma
 * `ClinicSale` + `ClinicSaleLine` tabloları ile değiştirilecek
 * (API sözleşmesi sabit kalır).
 *
 * Yaşam döngüsü:
 * - `draft` → `completed` | `cancelled`
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Klinik satış üzerinde fiziksel silme yoktur; iptal `cancelled`
 *   durumuna geçiş ile yapılır.
 *
 * @since GOAL-071 (FAZ-7) klinik satış taslağı core
 */

import type {
  ClinicSale,
  ClinicSaleLine,
  ClinicSaleSourceType,
  ClinicSaleStatus,
} from "@vetniva/contracts";

/** Persist edilmiş klinik satış satırı record. */
export interface ClinicSaleLineRecord {
  id: string;
  tenantId: string;
  saleId: string;
  productId: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discountPercent: number;
  lineTotal: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Persist edilmiş klinik satış record. */
export interface ClinicSaleRecord {
  id: string;
  tenantId: string;
  status: ClinicSaleStatus;
  customerOwnerId: string;
  customerPatientId: string;
  sourceType: ClinicSaleSourceType;
  sourceId: string;
  currency: string;
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
  ClinicSale,
  ClinicSaleLine,
  ClinicSaleSourceType,
  ClinicSaleStatus,
};

/** Record → public ClinicSale. */
export function toClinicSale(rec: ClinicSaleRecord): ClinicSale {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    status: rec.status,
    customerOwnerId: rec.customerOwnerId,
    customerPatientId: rec.customerPatientId,
    sourceType: rec.sourceType,
    sourceId: rec.sourceId,
    currency: rec.currency,
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

/** Record → public ClinicSaleLine. */
export function toClinicSaleLine(rec: ClinicSaleLineRecord): ClinicSaleLine {
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
 * Decimal string çarpma (petshop-sale / purchase-order ile uyumlu).
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
