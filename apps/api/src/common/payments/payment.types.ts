/**
 * @file Tahsilat (payment) domain tipleri.
 * @module apps/api/common/payments/payment.types
 *
 * @description GOAL-072 (FAZ-7) tahsilat domain modeli. In-memory
 * Map'te tutulur; production'a geçişte Prisma `Payment` tablosu
 * ile değiştirilecek (API sözleşmesi sabit kalır).
 *
 * Para alanları `numeric` (Prisma Decimal) olarak saklanır; bu
 * in-memory implementasyonda 4 ondalık basamağa kadar normalize
 * edilmiş Decimal string kullanılır.
 *
 * Idempotency:
 * - (tenantId, idempotencyKey) unique. Aynı key + aynı body →
 *   mevcut kayıt döner; farklı body → 409 VET-PAYMENT-0005.
 *
 * Kısmi tahsilat:
 * - Bir sale'a birden fazla payment bağlanabilir (aynı sourceId).
 * - Toplam tahsilat sale.totalAmount'i aşabilir; kontrol
 *   sonraki goal'lerde (GOAL-073 kısmi tahsilat) detaylanır.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Tahsilat üzerinde fiziksel silme yoktur; ters kayıt
 *   `status='reversed'` durumuna geçiş ile yapılır.
 *
 * @since GOAL-072 (FAZ-7) tahsilat core
 */

import type {
  Payment,
  PaymentCurrency,
  PaymentMethod,
  PaymentSourceType,
  PaymentStatus,
} from "@vetniva/contracts";

/** Persist edilmiş payment record. */
export interface PaymentRecord {
  id: string;
  tenantId: string;
  sourceType: PaymentSourceType;
  sourceId: string;
  /** Decimal string (4 ondalık). */
  amount: string;
  method: PaymentMethod;
  currency: PaymentCurrency;
  paidAt: string;
  idempotencyKey: string | null;
  reference: string | null;
  notes: string | null;
  status: PaymentStatus;
  reversedAt: string | null;
  reversedBy: string | null;
  reverseReason: string | null;
  createdAt: string;
  createdBy: string;
}

export type {
  Payment,
  PaymentCurrency,
  PaymentMethod,
  PaymentSourceType,
  PaymentStatus,
};

/** Record → public Payment. */
export function toPayment(rec: PaymentRecord): Payment {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    sourceType: rec.sourceType,
    sourceId: rec.sourceId,
    amount: rec.amount,
    method: rec.method,
    currency: rec.currency,
    paidAt: rec.paidAt,
    idempotencyKey: rec.idempotencyKey,
    reference: rec.reference,
    notes: rec.notes,
    status: rec.status,
    reversedAt: rec.reversedAt,
    reversedBy: rec.reversedBy,
    reverseReason: rec.reverseReason,
    createdAt: rec.createdAt,
    createdBy: rec.createdBy,
  };
}

/**
 * Decimal string normalize (4 ondalık basamağa kadar; purchase-order
 * / petshop-sale ile uyumlu). Geçersiz format → null.
 */
export function normalizePaymentDecimal(value: string): string | null {
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
