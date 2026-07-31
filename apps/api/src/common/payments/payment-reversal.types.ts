/**
 * @file Tahsilat ters kayıt (payment reversal) domain tipleri.
 * @module apps/api/common/payments/payment-reversal.types
 *
 * @description GOAL-073 (FAZ-7) tahsilat iptal ve ters kayıt domain
 * modeli. In-memory Map'te tutulur; production'a geçişte Prisma
 * `PaymentReversal` tablosu ile değiştirilecek.
 *
 * Append-only: ters kayıtlar fiziksel silinmez. Bir payment'a
 * birden fazla ters kayıt bağlanabilir (kümülatif, toplam ≤
 * payment.amount). Her ters kayıt orijinal payment'ın
 * `sourceType` + `sourceId` + `method` + `currency` alanlarını
 * miras alır (raporlama için).
 *
 * Kasa etkisi:
 * - `cashRegisterEffect=true` (default) ise kasa ledger'ında
 *   debit kaydı oluşur.
 * - `cashRegisterEffect=false` ise (ör. banka chargeback'inde
 *   kasa etkisi banka tarafında işlenir) kasa hareketi
 *   oluşturulmaz; audit'te `cashRegisterEffect: false` olarak
 *   işlenir.
 *
 * @security Tenant izolasyonu repo seviyesinde korunur.
 * @since GOAL-073 (FAZ-7) tahsilat iptal ve ters kayıt core
 */

import type {
  PaymentCurrency,
  PaymentMethod,
  PaymentReverseReason,
  PaymentReversal,
  PaymentSourceType,
} from "@vetniva/contracts";

/** Persist edilmiş payment reversal record. */
export interface PaymentReversalRecord {
  id: string;
  tenantId: string;
  paymentId: string;
  sourceType: PaymentSourceType;
  sourceId: string;
  /** Decimal string (4 ondalık, > 0, <= payment.amount - sum(reversed)). */
  amount: string;
  /** Orijinal payment'dan miras. */
  method: PaymentMethod;
  currency: PaymentCurrency;
  reason: PaymentReverseReason;
  note: string | null;
  cashRegisterEffect: boolean;
  reversedAt: string;
  reversedBy: string;
  createdAt: string;
}

export type { PaymentReverseReason, PaymentReversal };

/** Record → public PaymentReversal. */
export function toPaymentReversal(
  rec: PaymentReversalRecord,
): PaymentReversal {
  return {
    id: rec.id,
    tenantId: rec.tenantId,
    paymentId: rec.paymentId,
    sourceType: rec.sourceType,
    sourceId: rec.sourceId,
    amount: rec.amount,
    method: rec.method,
    currency: rec.currency,
    reason: rec.reason,
    note: rec.note,
    cashRegisterEffect: rec.cashRegisterEffect,
    reversedAt: rec.reversedAt,
    reversedBy: rec.reversedBy,
    createdAt: rec.createdAt,
  };
}

/* --------------------------------------------------------------------------
 * Decimal helpers (BigInt tabanlı, 4 ondalık ölçek)
 * -------------------------------------------------------------------------- */

/**
 * Decimal string'i 4 ondalık ölçekli BigInt'e çevirir. Geçersiz
 * format → null.
 */
export function reversalAmountToScaled(value: string): bigint | null {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return null;
  const parts = value.split(".");
  const intPart = parts[0] ?? "0";
  const fracPart = (parts[1] ?? "").padEnd(4, "0").slice(0, 4);
  try {
    return BigInt(intPart) * BigInt(10000) + BigInt(fracPart);
  } catch {
    return null;
  }
}

/** 4 ölçekli BigInt → normalized decimal string (gereksiz sıfırlar kırpılır). */
export function scaledBigIntToReversalAmount(scaled: bigint): string {
  const negative = scaled < BigInt(0);
  const abs = negative ? -scaled : scaled;
  const intPart = abs / BigInt(10000);
  const fracPart = abs % BigInt(10000);
  const intStr = intPart.toString();
  const fracStr = fracPart.toString().padStart(4, "0").replace(/0+$/, "");
  const body = fracStr.length > 0 ? `${intStr}.${fracStr}` : intStr;
  return negative && body !== "0" ? `-${body}` : body;
}

/** İki decimal string'i topla (BigInt, 4 ondalık). Geçersiz → null. */
export function addReversalAmounts(a: string, b: string): string | null {
  const av = reversalAmountToScaled(a);
  const bv = reversalAmountToScaled(b);
  if (av === null || bv === null) return null;
  return scaledBigIntToReversalAmount(av + bv);
}

/** Decimal string karşılaştırma (a < b → -1, a == b → 0, a > b → 1). */
export function compareReversalAmounts(a: string, b: string): number {
  const av = reversalAmountToScaled(a);
  const bv = reversalAmountToScaled(b);
  if (av === null || bv === null) return 0;
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

/**
 * Ters kayıt tutarının orijinal payment + mevcut kümülatif
 * ters kayıt toplamına göre geçerli olup olmadığını kontrol eder.
 * - `amount` > 0 olmalı.
 * - `amount + currentTotal <= paymentAmount` olmalı.
 * - Aksi durumda hata kodu döner.
 */
export type ReversalAmountValidation =
  | { ok: true; value: string }
  | { ok: false; code: "VET-PAYMENT-0007" | "VET-PAYMENT-0008" };

export function validateReversalAmount(
  amount: string,
  paymentAmount: string,
  currentReversedTotal: string,
): ReversalAmountValidation {
  const scaledAmount = reversalAmountToScaled(amount);
  const scaledPayment = reversalAmountToScaled(paymentAmount);
  const scaledReversed = reversalAmountToScaled(currentReversedTotal);
  if (scaledAmount === null || scaledPayment === null || scaledReversed === null) {
    return { ok: false, code: "VET-PAYMENT-0007" };
  }
  if (scaledAmount <= BigInt(0)) {
    return { ok: false, code: "VET-PAYMENT-0007" };
  }
  if (scaledAmount + scaledReversed > scaledPayment) {
    return { ok: false, code: "VET-PAYMENT-0008" };
  }
  return { ok: true, value: amount };
}
