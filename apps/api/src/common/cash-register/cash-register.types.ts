/**
 * @file Kasa (cash register) oturum domain tipleri.
 * @module apps/api/common/cash-register/cash-register.types
 *
 * @description GOAL-074 (FAZ-7) kasa ve gün sonu. In-memory
 *   veri modeli + decimal/string yardımcıları. Production'a
 *   geçişte Prisma `CashRegisterSession` tablosu ile
 *   değiştirilecek.
 *
 *   Bir kasa oturumu (session) bir şubeye bağlıdır; açılış
 *   bakiyesi, hareketler (tahsilat/iade) ve kapanış bakiyesi
 *   üzerinden beklenen/gerçek farkı üretir. Append-only
 *   ledger zaten `KasaRepository`'de (GOAL-073) tutulur;
 *   burada yalnızca session meta verisi (açılış/kapanış/
 *   reopen) ve lookup helper'ları yer alır.
 *
 *   `sessionId` alanı kasa hareketlerine opsiyonel bağlanır;
 *   `KasaEntryRecord.referenceType/Id` zaten payment /
 *   payment_reversal referanslarını taşır. Session bağlamı
 *   `KasaEntryRecord` üzerinde `note` veya `referenceType`'ın
 *   genişletilmesiyle ileride sağlanabilir; bu ilk sürümde
 *   session hareketleri, oturumun açık olduğu zaman aralığı
 *   içinde gerçekleşen tüm kasa hareketleri olarak
 *   tanımlanır.
 *
 * @security Tenant izolasyonu repo + service katmanında korunur.
 *   Kapanmış oturum üzerinde UPDATE yapılmaz; yalnızca
 *   `status='reopened'` set edilerek append-only tarihçe
 *   korunur.
 *
 * @since GOAL-074 (FAZ-7) kasa ve gün sonu core
 */

import type {
  CashRegisterCurrency,
  CashRegisterSession,
  CashRegisterSessionStatus,
} from "@vetniva/contracts";

/** Persist edilmiş kasa oturumu. */
export interface CashRegisterSessionRecord {
  id: string;
  tenantId: string;
  branchId: string;
  status: CashRegisterSessionStatus;
  currency: CashRegisterCurrency;
  /** Açılış bakiyesi (Decimal string, >= 0). */
  openingBalance: string;
  /** Kapanış gerçek bakiyesi (kapanış sonrası dolu). */
  closingBalance: string | null;
  /** Beklenen bakiye (server hesaplar, kapanış sonrası dolu). */
  expectedBalance: string | null;
  /** variance = closingBalance - expectedBalance. */
  variance: string | null;
  openedAt: string;
  openedBy: string;
  closedAt: string | null;
  closedBy: string | null;
  /** Reopen edildi ise orijinal kapanış zamanı (append-only tarihçe). */
  originalClosedAt: string | null;
  reopenReason: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Decimal string'in 4 ondalık normalize edilmiş halini döner. */
export function normalizeCashDecimal(input: string): string {
  if (input === "") return "0";
  const parts = input.split(".");
  const intPart = parts[0] ?? "0";
  const fracPart = (parts[1] ?? "").padEnd(4, "0").slice(0, 4);
  // Sondaki sıfırları kırp; yalnızca anlamlı ondalık kısmı bırak.
  const trimmed = fracPart.replace(/0+$/, "");
  return trimmed.length > 0 ? `${intPart}.${trimmed}` : intPart;
}

/** Decimal string'i scaled BigInt'e çevirir (4 ondalık). */
export function cashDecimalToScaled(input: string): bigint {
  const parts = input.split(".");
  const intPart = parts[0] ?? "0";
  const fracPart = (parts[1] ?? "").padEnd(4, "0").slice(0, 4);
  return BigInt(intPart) * BigInt(10000) + BigInt(fracPart);
}

/** Scaled BigInt'ten normalize edilmiş decimal string'e çevirir. */
export function scaledToCashDecimal(scaled: bigint): string {
  const negative = scaled < BigInt(0);
  const abs = negative ? -scaled : scaled;
  const intPart = abs / BigInt(10000);
  const fracPart = abs % BigInt(10000);
  const intStr = intPart.toString();
  const fracStr = fracPart.toString().padStart(4, "0").replace(/0+$/, "");
  const body = fracStr.length > 0 ? `${intStr}.${fracStr}` : intStr;
  return negative && body !== "0" ? `-${body}` : body;
}

/** Record → public DTO. */
export function toCashRegisterSession(
  record: CashRegisterSessionRecord,
): CashRegisterSession {
  return {
    id: record.id,
    tenantId: record.tenantId,
    branchId: record.branchId,
    status: record.status,
    currency: record.currency,
    openingBalance: record.openingBalance,
    closingBalance: record.closingBalance,
    expectedBalance: record.expectedBalance,
    variance: record.variance,
    openedAt: record.openedAt,
    openedBy: record.openedBy,
    closedAt: record.closedAt,
    closedBy: record.closedBy,
    originalClosedAt: record.originalClosedAt,
    reopenReason: record.reopenReason,
    note: record.note,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** ISO date (YYYY-MM-DD) → UTC başlangıç ISO. */
export function isoDateToUtcStart(iso: string): string {
  return `${iso}T00:00:00.000Z`;
}

/** ISO date (YYYY-MM-DD) → UTC sonraki gün başlangıç ISO. */
export function isoDateToUtcEndExclusive(iso: string): string {
  return `${iso}T23:59:59.999Z`;
}
