/**
 * @file Payment (tahsilat) service.
 * @module apps/api/modules/payments/payments.service
 *
 * @description GOAL-072 (FAZ-7) tahsilat iş kuralları.
 *
 * İş kuralları:
 * - `createPayment`:
 *   - `amount` normalize edilir (4 ondalık; geçersiz → 422
 *     VET-PAYMENT-0006).
 *   - `idempotencyKey` verildiyse (tenantId, key) unique. Aynı
 *     key + aynı body → mevcut kayıt döner (idempotent);
 *     farklı body → 409 VET-PAYMENT-0005.
 *   - Audit `audit:payment.create` (info).
 * - `listPayments`: tenant-scoped; status/sourceType/sourceId/
 *   method filtresi.
 * - `getPaymentDetail`: cross-tenant → null.
 * - `reversePayment`: status=completed → reversed. `reversedAt` +
 *   `reversedBy` + `reverseReason` set edilir. Tek seferlik
 *   (zaten reversed ise 409 VET-PAYMENT-0002). Audit
 *   `audit:payment.reverse` (warning).
 * - Kısmi tahsilat: aynı sourceId'ye birden fazla payment
 *   bağlanabilir (toplam kontrolü sonraki goal'lerde — Faz 7
 *   kısmi tahsilat — detaylanır).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Tahsilat üzerinde fiziksel silme YOKTUR; ters kayıt
 *   `status='reversed'` durumuna geçiş ile yapılır.
 *
 * @since GOAL-072 (FAZ-7) tahsilat core
 */

import { Injectable, Logger } from "@nestjs/common";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  normalizePaymentDecimal,
  toPayment,
  type PaymentRecord,
} from "../../common/payments/payment.types.js";
import type {
  Payment,
  PaymentCreateInput,
  PaymentFilters,
  PaymentListResponse,
  PaymentReverseInput,
} from "@vetniva/contracts";

import { PaymentsRepository } from "./payments.repository.js";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  public constructor(
    private readonly repo: PaymentsRepository,
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
      reversedAt: null,
      reversedBy: null,
      reverseReason: null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
    };
    this.repo.insert(record);

    // 4) Audit.
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
  // reversePayment
  // -------------------------------------------------------------------------

  public async reversePayment(
    tenantId: string,
    id: string,
    input: PaymentReverseInput,
    actor: ActorContext,
  ): Promise<Payment> {
    this.requireTenantScope(actor, tenantId);
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

    const nowIso = new Date().toISOString();
    this.repo.update(tenantId, id, {
      status: "reversed",
      reversedAt: nowIso,
      reversedBy: actor.actorId ?? "system",
      reverseReason: input.reason,
    });

    await this.audit.recordSimple(
      "audit:payment.reverse",
      "payment",
      id,
      "reverse",
      this.actorToAuditActor(actor),
      "warning",
      {
        sourceType: existing.sourceType,
        sourceId: existing.sourceId,
        amount: existing.amount,
        reason: input.reason,
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
