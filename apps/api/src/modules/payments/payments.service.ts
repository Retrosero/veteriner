/**
 * @file Payment (tahsilat) service.
 * @module apps/api/modules/payments/payments.service
 *
 * @description GOAL-072 (FAZ-7) tahsilat + GOAL-073 (FAZ-7) tahsilat
 * iptal ve ters kayıt iş kuralları.
 *
 * GOAL-072 iş kuralları:
 * - `createPayment`:
 *   - `amount` normalize edilir (4 ondalık; geçersiz → 422
 *     VET-PAYMENT-0006).
 *   - `idempotencyKey` verildiyse (tenantId, key) unique. Aynı
 *     key + aynı body → mevcut kayıt döner (idempotent);
 *     farklı body → 409 VET-PAYMENT-0005.
 *   - Audit `audit:payment.create` (info).
 *   - Kasa etkisi: payment_create → kasa ledger credit.
 * - `listPayments`: tenant-scoped; status/sourceType/sourceId/
 *   method filtresi.
 * - `getPaymentDetail`: cross-tenant → null.
 *
 * GOAL-073 iş kuralları:
 * - `reversePayment`:
 *   - Tam ters kayıt (amount=null VEYA amount=remaining) →
 *     status='reversed'.
 *   - Kısmi ters kayıt (0 < amount < remaining) → status=
 *     'partially_reversed'.
 *   - `amount=0` → 422 VET-PAYMENT-0007.
 *   - `amount + sum(reversed) > payment.amount` → 422
 *     VET-PAYMENT-0008.
 *   - Yüksek tutar (> 1000 TRY) OWNER zorunlu; aksi → 403
 *     VET-PAYMENT-0010.
 *   - Audit: full → `audit:payment.reverse` (warning); partial
 *     → `audit:payment.partial_reverse` (info).
 *   - Kasa etkisi (cashRegisterEffect=true) → kasa ledger debit.
 * - `listPaymentReversals` / `getPaymentReversalDetail` /
 *   `getPaymentReversalSummary`: ters kayıt arama + özet.
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Tahsilat üzerinde fiziksel silme YOKTUR; ters kayıt
 *   `status='reversed'` / `'partially_reversed'` durumuna geçiş
 *   ve ayrı `PaymentReversal` kayıtları ile yapılır.
 *
 * @since GOAL-072 (FAZ-7) tahsilat core
 * @updated GOAL-073 (FAZ-7) tahsilat iptal ve ters kayıt core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  type KasaEntryRecord,
  paymentMethodToKasaAccount,
} from "../../common/payments/kasa.types.js";
import {
  normalizePaymentDecimal,
  toPayment,
  type PaymentRecord,
} from "../../common/payments/payment.types.js";
import {
  toPaymentReversal,
  validateReversalAmount,
  type PaymentReversalRecord,
} from "../../common/payments/payment-reversal.types.js";
import type {
  Payment,
  PaymentCreateInput,
  PaymentFilters,
  PaymentListResponse,
  PaymentReversalCreateInput,
  PaymentReversalFilters,
  PaymentReversalListResponse,
  PaymentReversalSummary,
} from "@vetniva/contracts";

import { KasaRepository } from "./kasa.repository.js";
import { PaymentReversalsRepository } from "./payment-reversals.repository.js";
import { PaymentsRepository } from "./payments.repository.js";

/** OWNER zorunlu kılan ters kayıt eşiği (Decimal string). */
const HIGH_AMOUNT_OWNER_THRESHOLD = "1000";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  public constructor(
    private readonly repo: PaymentsRepository,
    private readonly reversals: PaymentReversalsRepository,
    private readonly kasa: KasaRepository,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // createPayment
  // -------------------------------------------------------------------------

  public async createPayment(
    tenantId: string,
    input: PaymentCreateInput,
    actor: ActorContext,
  ): Promise<Payment> {
    this.requireTenantScope(actor, tenantId);

    // 1) Amount normalize.
    const amount = normalizePaymentDecimal(input.amount);
    if (amount === null) {
      throw new DomainError({
        errorCode: "VET-PAYMENT-0006",
        message: "Geçersiz tutar formatı",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PAYMENT-0006",
        details: { amount: input.amount },
      });
    }
    if (amount === "0") {
      throw new DomainError({
        errorCode: "VET-PAYMENT-0006",
        message: "Tahsilat tutarı 0 olamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-PAYMENT-0006",
      });
    }

    // 2) Idempotency kontrolü.
    if (input.idempotencyKey) {
      const existing = this.repo.findByIdempotencyKey(
        tenantId,
        input.idempotencyKey,
      );
      if (existing) {
        const sameBody =
          existing.sourceType === input.sourceType &&
          existing.sourceId === input.sourceId &&
          existing.amount === amount &&
          existing.method === input.method &&
          existing.currency === input.currency;
        if (!sameBody) {
          throw new DomainError({
            errorCode: "VET-PAYMENT-0005",
            message:
              "Bu idempotency key farklı bir tahsilat için kullanılmış",
            httpStatus: 409,
            severity: "warning",
            i18nKey: "error.VET-PAYMENT-0005",
            details: { idempotencyKey: input.idempotencyKey },
          });
        }
        return toPayment(existing);
      }
    }

    // 3) Insert.
    const nowIso = new Date().toISOString();
    const id = this.repo.nextId(tenantId);
    const record: PaymentRecord = {
      id,
      tenantId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      amount,
      method: input.method,
      currency: input.currency,
      paidAt: input.paidAt ?? nowIso,
      idempotencyKey: input.idempotencyKey ?? null,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      status: "completed",
      reversedAmount: "0",
      effectiveAmount: amount,
      reversedAt: null,
      reversedBy: null,
      reverseReason: null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
    };
    this.repo.insert(record);

    // 4) Kasa etkisi: credit.
    this.recordKasaEntry(
      tenantId,
      record,
      "credit",
      "payment_create",
      actor.actorId ?? "system",
      record.id,
      "payment",
      nowIso,
    );

    // 5) Audit.
    await this.audit.recordSimple(
      "audit:payment.create",
      "payment",
      id,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        amount,
        method: input.method,
        currency: input.currency,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    );

    return toPayment(record);
  }

  // -------------------------------------------------------------------------
  // listPayments
  // -------------------------------------------------------------------------

  public async listPayments(
    tenantId: string,
    filters: PaymentFilters,
    actor: ActorContext,
  ): Promise<PaymentListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, {
      status: filters.status,
      sourceType: filters.sourceType,
      sourceId: filters.sourceId,
      method: filters.method,
      search: filters.search,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toPayment(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getPaymentDetail
  // -------------------------------------------------------------------------

  public async getPaymentDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Payment | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findById(tenantId, id);
    return rec ? toPayment(rec) : null;
  }

  // -------------------------------------------------------------------------
  // reversePayment (GOAL-073)
  // -------------------------------------------------------------------------

  /**
   * Tahsilatı iptal/ters kayıt eder. Tam veya kısmi olabilir.
   *
   * Tam ters kayıt: amount=null VEYA amount=payment.amount →
   * status='reversed'.
   * Kısmi ters kayıt: 0 < amount < payment.amount - sum(reversed)
   * → status='partially_reversed'.
   *
   * Yetki: amount > 1000 TRY için OWNER zorunlu (aksi 403
   * VET-PAYMENT-0010). Diğer durumlarda
   * `clinic:payment:reverse` permission yeterli.
   */
  public async reversePayment(
    tenantId: string,
    id: string,
    input: PaymentReversalCreateInput,
    actor: ActorContext,
  ): Promise<Payment> {
    this.requireTenantScope(actor, tenantId);

    // 1) Orijinal payment kontrolü.
    const existing = this.repo.findById(tenantId, id);
    if (!existing) {
      throw new DomainError({
        errorCode: "VET-PAYMENT-0001",
        message: "Tahsilat bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-PAYMENT-0001",
        details: { id },
      });
    }
    if (existing.status === "reversed") {
      throw new DomainError({
        errorCode: "VET-PAYMENT-0002",
        message: "Tahsilat zaten ters kayıt edilmiş",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-PAYMENT-0002",
        details: { id },
      });
    }

    // 2) Tutar hesapla (kalan tutar = amount - reversedAmount).
    const currentReversed = this.reversals.sumReversedForPayment(
      tenantId,
      id,
    );
    const remaining = this.subtractAmounts(existing.amount, currentReversed);
    const reverseAmount = input.amount ?? remaining;

    // 3) Tutar doğrulama.
    const amountCheck = validateReversalAmount(
      reverseAmount,
      existing.amount,
      currentReversed,
    );
    if (!amountCheck.ok) {
      const message =
        amountCheck.code === "VET-PAYMENT-0007"
          ? "Geçersiz ters kayıt tutarı"
          : "Kümülatif ters kayıt toplamı orijinal tutarı aşıyor";
      throw new DomainError({
        errorCode: amountCheck.code,
        message,
        httpStatus: 422,
        severity: "warning",
        i18nKey: `error.${amountCheck.code}`,
        details: {
          paymentId: id,
          paymentAmount: existing.amount,
          currentReversed,
          requestedAmount: reverseAmount,
        },
      });
    }

    // 4) Yetki kontrolü: amount > 1000 TRY için OWNER zorunlu.
    this.assertReversalAuthorization(amountCheck.value, actor);

    // 5) Yeni ters kayıt oluştur.
    const nowIso = new Date().toISOString();
    const reversalId = this.reversals.nextId(tenantId);
    // Neden kodu: input'ta enum varsa kullan, yoksa "other" + note zorunlu.
    const reasonCode: PaymentReversalRecord["reason"] = this.parseReasonCode(
      input.reason,
    );
    const reversal: PaymentReversalRecord = {
      id: reversalId,
      tenantId,
      paymentId: id,
      sourceType: existing.sourceType,
      sourceId: existing.sourceId,
      amount: amountCheck.value,
      method: existing.method,
      currency: existing.currency,
      reason: reasonCode,
      note: input.note ?? null,
      cashRegisterEffect: input.cashRegisterEffect ?? true,
      reversedAt: nowIso,
      reversedBy: actor.actorId ?? "system",
      createdAt: nowIso,
    };
    this.reversals.insert(reversal);

    // 6) Payment'ı güncelle.
    const newReversedTotal = this.addAmounts(currentReversed, amountCheck.value);
    const newEffective = this.subtractAmounts(existing.amount, newReversedTotal);
    const newStatus: PaymentRecord["status"] =
      newEffective === "0" ? "reversed" : "partially_reversed";

    this.repo.update(tenantId, id, {
      status: newStatus,
      reversedAmount: newReversedTotal,
      effectiveAmount: newEffective,
      reversedAt: nowIso,
      reversedBy: actor.actorId ?? "system",
      reverseReason: input.reason,
    });

    // 7) Kasa etkisi: debit.
    if (input.cashRegisterEffect ?? true) {
      this.recordKasaEntry(
        tenantId,
        existing,
        "debit",
        newStatus === "reversed"
          ? "payment_reverse"
          : "payment_partial_reverse",
        actor.actorId ?? "system",
        reversalId,
        "payment_reversal",
        nowIso,
        amountCheck.value,
      );
    }

    // 8) Audit.
    const auditEvent =
      newStatus === "reversed"
        ? "audit:payment.reverse"
        : "audit:payment.partial_reverse";
    await this.audit.recordSimple(
      auditEvent,
      "payment",
      id,
      "reverse",
      this.actorToAuditActor(actor),
      newStatus === "reversed" ? "warning" : "info",
      {
        reversalId,
        sourceType: existing.sourceType,
        sourceId: existing.sourceId,
        paymentAmount: existing.amount,
        reversalAmount: amountCheck.value,
        cumulativeReversed: newReversedTotal,
        effectiveAmount: newEffective,
        reason: input.reason,
        cashRegisterEffect: input.cashRegisterEffect ?? true,
      },
    );

    const updated = this.repo.findById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-PAYMENT-0001",
        message: "Tahsilat bulunamadı",
        httpStatus: 404,
      });
    }
    return toPayment(updated);
  }

  // -------------------------------------------------------------------------
  // listPaymentReversals
  // -------------------------------------------------------------------------

  public async listPaymentReversals(
    tenantId: string,
    filters: PaymentReversalFilters,
    actor: ActorContext,
  ): Promise<PaymentReversalListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.reversals.search(tenantId, {
      paymentId: filters.paymentId,
      sourceType: filters.sourceType,
      sourceId: filters.sourceId,
      reason: filters.reason,
      from: filters.from,
      to: filters.to,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toPaymentReversal(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getPaymentReversalDetail
  // -------------------------------------------------------------------------

  public async getPaymentReversalDetail(
    tenantId: string,
    reversalId: string,
    actor: ActorContext,
  ): Promise<PaymentReversalRecord | null> {
    this.requireTenantScope(actor, tenantId);
    return this.reversals.findById(tenantId, reversalId);
  }

  // -------------------------------------------------------------------------
  // getPaymentReversalSummary
  // -------------------------------------------------------------------------

  public async getPaymentReversalSummary(
    tenantId: string,
    paymentId: string,
    actor: ActorContext,
  ): Promise<PaymentReversalSummary | null> {
    this.requireTenantScope(actor, tenantId);
    const payment = this.repo.findById(tenantId, paymentId);
    if (!payment) return null;
    const totalReversed = this.reversals.sumReversedForPayment(
      tenantId,
      paymentId,
    );
    const remaining = this.subtractAmounts(payment.amount, totalReversed);
    const items = this.reversals
      .search(tenantId, {
        paymentId,
        limit: 1000,
        offset: 0,
        sort: "desc",
      })
      .items;
    const lastReversalAt = items[0]?.reversedAt ?? null;
    return {
      paymentId,
      paymentAmount: payment.amount,
      totalReversed,
      remainingAmount: remaining,
      reversalCount: items.length,
      lastReversalAt,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private requireTenantScope(actor: ActorContext, tenantId: string): void {
    if (actor.role === "SUPERADMIN") return;
    if (actor.tenantId === tenantId) return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem için yetkiniz yok",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }

  private assertReversalAuthorization(
    amount: string,
    actor: ActorContext,
  ): void {
    const cmp = this.compareAmounts(amount, HIGH_AMOUNT_OWNER_THRESHOLD);
    if (cmp <= 0) return; // Eşik altı: STAFF/VETERINARIAN yapabilir.
    if (actor.role === "OWNER" || actor.role === "SUPERADMIN") return;
    throw new DomainError({
      errorCode: "VET-PAYMENT-0010",
      message:
        "Bu tutarın ters kaydı için OWNER yetkisi zorunlu (eşik > 1000 TRY).",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-PAYMENT-0010",
      details: {
        amount,
        threshold: HIGH_AMOUNT_OWNER_THRESHOLD,
        role: actor.role,
      },
    });
  }

  /**
   * Serbest metin `reason`'ı enum neden koduna çevirir. Tam
   * eşleşme yoksa `other` döner (note zorunlu olur).
   */
  private parseReasonCode(
    reason: string,
  ): PaymentReversalRecord["reason"] {
    const known: PaymentReversalRecord["reason"][] = [
      "customer_request",
      "chargeback",
      "duplicate",
      "system_error",
      "pricing_error",
      "other",
    ];
    const match = known.find((k) => k === reason);
    return match ?? "other";
  }

  private recordKasaEntry(
    tenantId: string,
    payment: PaymentRecord,
    direction: "credit" | "debit",
    source: KasaEntryRecord["source"],
    actorId: string,
    referenceId: string,
    referenceType: KasaEntryRecord["referenceType"],
    occurredAt: string,
    overrideAmount?: string,
  ): void {
    const account = paymentMethodToKasaAccount(payment.method);
    const rawAmount = overrideAmount ?? payment.amount;
    const signed = this.toScaledBigInt(rawAmount);
    if (signed === null) return;
    const finalScaled = direction === "credit" ? signed : -signed;
    const id = this.kasa.nextId(tenantId);
    this.kasa.insert({
      id,
      tenantId,
      account,
      amountSigned: this.fromScaledBigInt(finalScaled),
      direction,
      source,
      referenceId,
      referenceType,
      method: payment.method,
      currency: payment.currency,
      occurredAt,
      actorId,
      note: null,
    });
  }

  private toScaledBigInt(value: string): bigint | null {
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

  private fromScaledBigInt(scaled: bigint): string {
    const negative = scaled < BigInt(0);
    const abs = negative ? -scaled : scaled;
    const intPart = abs / BigInt(10000);
    const fracPart = abs % BigInt(10000);
    const intStr = intPart.toString();
    const fracStr = fracPart.toString().padStart(4, "0").replace(/0+$/, "");
    const body = fracStr.length > 0 ? `${intStr}.${fracStr}` : intStr;
    return negative && body !== "0" ? `-${body}` : body;
  }

  private addAmounts(a: string, b: string): string {
    const av = this.toScaledBigInt(a);
    const bv = this.toScaledBigInt(b);
    if (av === null || bv === null) return "0";
    return this.fromScaledBigInt(av + bv);
  }

  private subtractAmounts(a: string, b: string): string {
    const av = this.toScaledBigInt(a);
    const bv = this.toScaledBigInt(b);
    if (av === null || bv === null) return "0";
    const diff = av - bv;
    return diff < BigInt(0) ? "0" : this.fromScaledBigInt(diff);
  }

  private compareAmounts(a: string, b: string): number {
    const av = this.toScaledBigInt(a);
    const bv = this.toScaledBigInt(b);
    if (av === null || bv === null) return 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  }

  private actorToAuditActor(actor: ActorContext): {
    actorId: string | null;
    actorType: "user" | "system" | "portal_user";
    tenantId: string | null;
    branchId: string | null;
    correlationId: string;
    country: string;
  } {
    return {
      actorId: actor.actorId,
      actorType: actor.actorType as "user" | "system",
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "TR",
    };
  }
}
