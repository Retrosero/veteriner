/**
 * @file PaymentsService unit testleri.
 * @module apps/api/modules/payments/payments.service.spec
 *
 * @description GOAL-072 tahsilat service testleri.
 *   - createPayment (normalize amount + audit + idempotency).
 *   - reversePayment (completed → reversed; reversed iken
 *     tekrar 409).
 *   - Geçersiz tutar (negatif olmayan 0 dahil) 422.
 *   - Idempotency: aynı key + aynı body → mevcut kayıt döner;
 *     farklı body → 409.
 *   - Cross-tenant IDOR → null; cross-tenant create 403.
 *
 * @since GOAL-072 (FAZ-7) tahsilat core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

import { PaymentsService } from "./payments.service.js";
import { PaymentsRepository } from "./payments.repository.js";
import type {
  PaymentCreateInput,
  PaymentReverseInput,
} from "@vetniva/contracts";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const STAFF_A: ActorContext = {
  actorId: "usr-staff-a",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-1",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const STAFF_B: ActorContext = {
  actorId: "usr-staff-b",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_B,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-2",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi
      .fn()
      .mockImplementation(
        async (
          _eventName: string,
          _targetType: string,
          _targetId: string,
          _action: string,
          _actor: unknown,
          _severity: string,
        ) => ({ eventId: "ev-1" }),
      ),
  } as unknown as AuditService;
}

function makePaymentInput(
  overrides: Partial<PaymentCreateInput> = {},
): PaymentCreateInput {
  return {
    sourceType: "clinic_sale",
    sourceId: "sale-001",
    amount: "100",
    method: "cash",
    currency: "TRY",
    ...overrides,
  };
}

describe("PaymentsService", () => {
  let service: PaymentsService;
  let repo: PaymentsRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new PaymentsRepository();
    audit = makeAudit();
    service = new PaymentsService(repo, audit);
  });

  // ---------------------------------------------------------------------------
  // createPayment
  // ---------------------------------------------------------------------------

  describe("createPayment", () => {
    it("yeni tahsilat oluşturur + audit", async () => {
      const out = await service.createPayment(
        TENANT_A,
        makePaymentInput(),
        STAFF_A,
      );
      expect(out.id).toMatch(/^pm-/);
      expect(out.status).toBe("completed");
      expect(out.amount).toBe("100");
      expect(out.method).toBe("cash");
      expect(out.currency).toBe("TRY");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:payment.create",
        "payment",
        out.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({ method: "cash" }),
      );
    });

    it("card / bank_transfer / other yöntemleri de kabul eder", async () => {
      const card = await service.createPayment(
        TENANT_A,
        makePaymentInput({ method: "card", sourceId: "s-1" }),
        STAFF_A,
      );
      expect(card.method).toBe("card");
      const bt = await service.createPayment(
        TENANT_A,
        makePaymentInput({ method: "bank_transfer", sourceId: "s-2" }),
        STAFF_A,
      );
      expect(bt.method).toBe("bank_transfer");
      const other = await service.createPayment(
        TENANT_A,
        makePaymentInput({ method: "other", sourceId: "s-3" }),
        STAFF_A,
      );
      expect(other.method).toBe("other");
    });

    it("amount 0 reddedilir 422 VET-PAYMENT-0006", async () => {
      await expect(
        service.createPayment(
          TENANT_A,
          makePaymentInput({ amount: "0" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PAYMENT-0006",
        httpStatus: 422,
      });
    });

    it("geçersiz amount formatı 422 VET-PAYMENT-0006", async () => {
      await expect(
        service.createPayment(
          TENANT_A,
          makePaymentInput({ amount: "abc" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PAYMENT-0006",
        httpStatus: 422,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // idempotency
  // ---------------------------------------------------------------------------

  describe("idempotency", () => {
    it("aynı key + aynı body → mevcut kayıt döner", async () => {
      const a = await service.createPayment(
        TENANT_A,
        makePaymentInput({ idempotencyKey: "k-1" }),
        STAFF_A,
      );
      const b = await service.createPayment(
        TENANT_A,
        makePaymentInput({ idempotencyKey: "k-1" }),
        STAFF_A,
      );
      expect(b.id).toBe(a.id);
    });

    it("aynı key + farklı amount → 409 VET-PAYMENT-0005", async () => {
      await service.createPayment(
        TENANT_A,
        makePaymentInput({ idempotencyKey: "k-2", amount: "100" }),
        STAFF_A,
      );
      await expect(
        service.createPayment(
          TENANT_A,
          makePaymentInput({ idempotencyKey: "k-2", amount: "200" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PAYMENT-0005",
        httpStatus: 409,
      });
    });

    it("aynı key + farklı sourceId → 409 VET-PAYMENT-0005", async () => {
      await service.createPayment(
        TENANT_A,
        makePaymentInput({ idempotencyKey: "k-3", sourceId: "s-1" }),
        STAFF_A,
      );
      await expect(
        service.createPayment(
          TENANT_A,
          makePaymentInput({ idempotencyKey: "k-3", sourceId: "s-2" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PAYMENT-0005",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // listPayments
  // ---------------------------------------------------------------------------

  describe("listPayments", () => {
    it("tenant-scoped; başka tenant'ın tahsilatları dönmez", async () => {
      await service.createPayment(
        TENANT_A,
        makePaymentInput({ sourceId: "s-a" }),
        STAFF_A,
      );
      await service.createPayment(
        TENANT_A,
        makePaymentInput({ sourceId: "s-a2" }),
        STAFF_A,
      );
      await service.createPayment(
        TENANT_B,
        makePaymentInput({ sourceId: "s-b" }),
        STAFF_B,
      );
      const list = await service.listPayments(
        TENANT_A,
        { limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(2);
    });

    it("method filtresi çalışır", async () => {
      await service.createPayment(
        TENANT_A,
        makePaymentInput({ method: "cash", sourceId: "s-c" }),
        STAFF_A,
      );
      await service.createPayment(
        TENANT_A,
        makePaymentInput({ method: "card", sourceId: "s-cd" }),
        STAFF_A,
      );
      const list = await service.listPayments(
        TENANT_A,
        { method: "card", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]?.method).toBe("card");
    });
  });

  // ---------------------------------------------------------------------------
  // getPaymentDetail
  // ---------------------------------------------------------------------------

  describe("getPaymentDetail", () => {
    it("cross-tenant IDOR → null", async () => {
      const created = await service.createPayment(
        TENANT_A,
        makePaymentInput(),
        STAFF_A,
      );
      const detail = await service.getPaymentDetail(
        TENANT_B,
        created.id,
        STAFF_B,
      );
      expect(detail).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // reversePayment
  // ---------------------------------------------------------------------------

  describe("reversePayment", () => {
    it("completed → reversed + audit", async () => {
      const created = await service.createPayment(
        TENANT_A,
        makePaymentInput(),
        STAFF_A,
      );
      const reversed = await service.reversePayment(
        TENANT_A,
        created.id,
        { reason: "iptal" } as PaymentReverseInput,
        STAFF_A,
      );
      expect(reversed.status).toBe("reversed");
      expect(reversed.reversedAt).not.toBeNull();
      expect(reversed.reversedBy).toBe("usr-staff-a");
      expect(reversed.reverseReason).toBe("iptal");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:payment.reverse",
        "payment",
        created.id,
        "reverse",
        expect.anything(),
        "warning",
        expect.anything(),
      );
    });

    it("zaten reversed → 409 VET-PAYMENT-0002", async () => {
      const created = await service.createPayment(
        TENANT_A,
        makePaymentInput(),
        STAFF_A,
      );
      await service.reversePayment(
        TENANT_A,
        created.id,
        { reason: "ilk" } as PaymentReverseInput,
        STAFF_A,
      );
      await expect(
        service.reversePayment(
          TENANT_A,
          created.id,
          { reason: "ikinci" } as PaymentReverseInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PAYMENT-0002",
        httpStatus: 409,
      });
    });

    it("olmayan tahsilat → 404 VET-PAYMENT-0001", async () => {
      await expect(
        service.reversePayment(
          TENANT_A,
          "00000000-0000-0000-0000-000000000000",
          { reason: "x" } as PaymentReverseInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-PAYMENT-0001",
        httpStatus: 404,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.createPayment(
          TENANT_B,
          makePaymentInput(),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
