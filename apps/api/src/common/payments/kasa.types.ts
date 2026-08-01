/**
 * @file Kasa (cash register) ledger domain tipleri.
 * @module apps/api/common/payments/kasa.types
 *
 * @description GOAL-073 (FAZ-7) kasa etkisi için in-memory
 * ledger. Production'a geçişte Prisma `KasaEntry` tablosu
 * ile değiştirilecek. Bu modül şu an GOAL-074 kapsamındaki
 * tam kasa/gün-sonu modülüne köprü olur; burada yalnızca
 * `audit:payment.reverse` ile birlikte çalışan minimal bir
 * debit/credit kaydı tutulur.
 *
 * Kural:
 * - Bir tahsilat (payment.create) oluştuğunda, kasa metoduna
 *   göre nakit (cash), kart (card) veya banka (bank_transfer)
 *   hesabına credit kaydı düşülür.
 * - Bir tahsilat iptal/ters kayıt edildiğinde (payment.reverse
 *   / payment.partial_reverse), aynı hesaba debit kaydı
 *   düşülür (cashRegisterEffect=true ise).
 * - `other` metodu için kasa hesabı ayrı tutulur.
 *
 * Append-only: kasa kayıtları fiziksel silinmez.
 *
 * @security Tenant izolasyonu repo seviyesinde korunur.
 * @since GOAL-073 (FAZ-7) tahsilat iptal ve ters kayıt core
 */

import type { PaymentMethod } from "@vetniva/contracts";

/** Kasa hesap türü. */
export type KasaAccount = "cash" | "card" | "bank" | "other";

/** Kasa hareket yönü. */
export type KasaEntryDirection = "credit" | "debit";

/** Kasa hareketi kaynağı. */
export type KasaEntrySource =
  | "payment_create"
  | "payment_reverse"
  | "payment_partial_reverse"
  | "manual_adjustment";

/** Persist edilmiş kasa kaydı. */
export interface KasaEntryRecord {
  id: string;
  tenantId: string;
  account: KasaAccount;
  /** credit = +, debit = - (Decimal string). */
  amountSigned: string;
  direction: KasaEntryDirection;
  source: KasaEntrySource;
  /** Payment / reversal ID referansı. */
  referenceId: string;
  referenceType: "payment" | "payment_reversal";
  method: PaymentMethod;
  currency: string;
  occurredAt: string;
  actorId: string;
  note: string | null;
}

/** Payment metodu → kasa hesabı eşlemesi. */
export function paymentMethodToKasaAccount(method: PaymentMethod): KasaAccount {
  switch (method) {
    case "cash":
      return "cash";
    case "card":
      return "card";
    case "bank_transfer":
      return "bank";
    case "other":
      return "other";
  }
}
