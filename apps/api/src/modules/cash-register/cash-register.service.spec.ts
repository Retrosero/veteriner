/**
 * @file CashRegisterService unit testleri.
 * @module apps/api/modules/cash-register/cash-register.service.spec
 *
 * @description GOAL-074 (FAZ-7) kasa ve gün sonu service testleri.
 *   - openSession: şubede açık oturum yokken başarılı; var
 *     iken 409 VET-CASH_REGISTER-0003.
 *   - getCurrentOpenSession: açık oturum döner; yoksa null.
 *   - closeSession: beklenen bakiye = opening + sum(movements);
 *     variance = closing - expected.
 *   - reopenSession: OWNER başarılı; STAFF/VETERINARIAN 403
 *     VET-CASH_REGISTER-0006; yalnız closed oturumlar 409
 *     VET-CASH_REGISTER-0007.
 *   - listSessions: branchId + status filtresi.
 *   - getSummary: hesap bazlı kırılım.
 *   - Cross-tenant read 403.
 *
 * @since GOAL-074 (FAZ-7) kasa ve gün sonu core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import type { KasaEntryRecord } from "../../common/payments/kasa.types.js";

import { CashRegisterService } from "./cash-register.service.js";
import { CashRegisterRepository } from "./cash-register.repository.js";
import { KasaRepository } from "../payments/kasa.repository.js";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BRANCH_A = "00000000-0000-0000-0000-000000000001";
const BRANCH_B = "00000000-0000-0000-0000-000000000002";

const OWNER_A: ActorContext = {
  actorId: "usr-owner-a",
  actorType: "user",
  role: "OWNER",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-owner-a",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const STAFF_A: ActorContext = {
  actorId: "usr-staff-a",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-staff-a",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const VET_A: ActorContext = {
  actorId: "usr-vet-a",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-vet-a",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const OWNER_B: ActorContext = {
  actorId: "usr-owner-b",
  actorType: "user",
  role: "OWNER",
  tenantId: TENANT_B,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-owner-b",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

function makeAuditMock() {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  };
}

function makeKasaRepository() {
  return new KasaRepository();
}

describe("CashRegisterService", () => {
  let repo: CashRegisterRepository;
  let kasa: KasaRepository;
  let audit: ReturnType<typeof makeAuditMock>;
  let service: CashRegisterService;

  beforeEach(() => {
    repo = new CashRegisterRepository();
    kasa = makeKasaRepository();
    audit = makeAuditMock();
    service = new CashRegisterService(repo, kasa, audit as never);
  });

  // -------------------------------------------------------------------------
  // openSession
  // -------------------------------------------------------------------------

  describe("openSession", () => {
    it("yeni oturum açar (status=open)", async () => {
      const session = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100", note: "Açılış" },
        STAFF_A,
      );
      expect(session.status).toBe("open");
      expect(session.openingBalance).toBe("100");
      expect(session.branchId).toBe(BRANCH_A);
      expect(session.openedBy).toBe(STAFF_A.actorId);
      expect(audit.recordSimple).toHaveBeenCalledOnce();
    });

    it("negatif açılış bakiyesi reddeder 422 VET-CASH_REGISTER-0002", async () => {
      await expect(
        service.openSession(
          TENANT_A,
          { branchId: BRANCH_A, openingBalance: "-50" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CASH_REGISTER-0002",
        httpStatus: 422,
      });
    });

    it("geçersiz (harf) tutar reddeder 422 VET-CASH_REGISTER-0002", async () => {
      await expect(
        service.openSession(
          TENANT_A,
          { branchId: BRANCH_A, openingBalance: "abc" },
          STAFF_A,
        ),
      ).rejects.toBeInstanceOf(DomainError);
    });

    it("aynı şubede ikinci açılış 409 VET-CASH_REGISTER-0003", async () => {
      await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      await expect(
        service.openSession(
          TENANT_A,
          { branchId: BRANCH_A, openingBalance: "200" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CASH_REGISTER-0003",
        httpStatus: 409,
      });
    });

    it("farklı şubeler paralel açılışa izin verir", async () => {
      const a = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      const b = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_B, openingBalance: "200" },
        STAFF_A,
      );
      expect(a.branchId).toBe(BRANCH_A);
      expect(b.branchId).toBe(BRANCH_B);
    });
  });

  // -------------------------------------------------------------------------
  // getCurrentOpenSession
  // -------------------------------------------------------------------------

  describe("getCurrentOpenSession", () => {
    it("açık oturum varsa döner", async () => {
      await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      const current = await service.getCurrentOpenSession(
        TENANT_A,
        BRANCH_A,
        STAFF_A,
      );
      expect(current?.status).toBe("open");
    });

    it("açık oturum yoksa null döner", async () => {
      const current = await service.getCurrentOpenSession(
        TENANT_A,
        BRANCH_A,
        STAFF_A,
      );
      expect(current).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // listSessions
  // -------------------------------------------------------------------------

  describe("listSessions", () => {
    it("branchId filtresi ile yalnızca o şubenin oturumlarını döner", async () => {
      await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      await service.openSession(
        TENANT_A,
        { branchId: BRANCH_B, openingBalance: "200" },
        STAFF_A,
      );
      const list = await service.listSessions(
        TENANT_A,
        { branchId: BRANCH_A },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]?.branchId).toBe(BRANCH_A);
    });

    it("status filtresi uygular", async () => {
      const opened = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      await service.closeSession(
        TENANT_A,
        opened.id,
        { closingBalance: "100" },
        STAFF_A,
      );
      const list = await service.listSessions(
        TENANT_A,
        { status: "closed" },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]?.status).toBe("closed");
    });
  });

  // -------------------------------------------------------------------------
  // closeSession
  // -------------------------------------------------------------------------

  describe("closeSession", () => {
    it("opening + movements = expected; variance = closing - expected", async () => {
      const opened = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      // Kasa ledger'a 2 tahsilat + 1 iade yaz (cash hesabı).
      insertKasaEntry(kasa, TENANT_A, "cash", "150", "credit", "pm-1");
      insertKasaEntry(kasa, TENANT_A, "cash", "50", "credit", "pm-2");
      insertKasaEntry(kasa, TENANT_A, "cash", "20", "debit", "rv-1");

      // expected = 100 + 150 + 50 - 20 = 280
      // closing = 280 → variance = 0
      const closed = await service.closeSession(
        TENANT_A,
        opened.id,
        { closingBalance: "280" },
        STAFF_A,
      );
      expect(closed.status).toBe("closed");
      expect(closed.expectedBalance).toBe("280");
      expect(closed.closingBalance).toBe("280");
      expect(closed.variance).toBe("0");
    });

    it("variance negatifse (eksik) raporlar", async () => {
      const opened = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      insertKasaEntry(kasa, TENANT_A, "cash", "50", "credit", "pm-1");
      // expected = 100 + 50 = 150
      // closing = 140 → variance = -10
      const closed = await service.closeSession(
        TENANT_A,
        opened.id,
        { closingBalance: "140" },
        STAFF_A,
      );
      expect(closed.variance).toBe("-10");
    });

    it("zaten kapalı oturum 409 VET-CASH_REGISTER-0004", async () => {
      const opened = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      await service.closeSession(
        TENANT_A,
        opened.id,
        { closingBalance: "100" },
        STAFF_A,
      );
      await expect(
        service.closeSession(
          TENANT_A,
          opened.id,
          { closingBalance: "100" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CASH_REGISTER-0004",
        httpStatus: 409,
      });
    });

    it("negatif kapanış bakiyesi 422 VET-CASH_REGISTER-0005", async () => {
      const opened = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      await expect(
        service.closeSession(
          TENANT_A,
          opened.id,
          { closingBalance: "-1" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CASH_REGISTER-0005",
        httpStatus: 422,
      });
    });
  });

  // -------------------------------------------------------------------------
  // reopenSession
  // -------------------------------------------------------------------------

  describe("reopenSession", () => {
    it("OWNER kapatılmış oturumu reopened yapar; originalClosedAt korunur", async () => {
      const opened = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      const closed = await service.closeSession(
        TENANT_A,
        opened.id,
        { closingBalance: "100" },
        STAFF_A,
      );
      const reopened = await service.reopenSession(
        TENANT_A,
        opened.id,
        { reason: "Sayım hatası" },
        OWNER_A,
      );
      expect(reopened.status).toBe("reopened");
      expect(reopened.originalClosedAt).toBe(closed.closedAt);
      expect(reopened.reopenReason).toBe("Sayım hatası");
      expect(reopened.closingBalance).toBeNull();
      expect(reopened.variance).toBeNull();
    });

    it("STAFF yetkisi yetersiz → 403 VET-CASH_REGISTER-0006", async () => {
      const opened = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      await service.closeSession(
        TENANT_A,
        opened.id,
        { closingBalance: "100" },
        STAFF_A,
      );
      await expect(
        service.reopenSession(
          TENANT_A,
          opened.id,
          { reason: "Yanlış" },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CASH_REGISTER-0006",
        httpStatus: 403,
      });
    });

    it("VETERINARIAN yetkisi yetersiz → 403 VET-CASH_REGISTER-0006", async () => {
      const opened = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      await service.closeSession(
        TENANT_A,
        opened.id,
        { closingBalance: "100" },
        STAFF_A,
      );
      await expect(
        service.reopenSession(
          TENANT_A,
          opened.id,
          { reason: "Yanlış" },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CASH_REGISTER-0006",
        httpStatus: 403,
      });
    });

    it("açık oturum reopen edilemez 409 VET-CASH_REGISTER-0007", async () => {
      const opened = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      await expect(
        service.reopenSession(
          TENANT_A,
          opened.id,
          { reason: "Test" },
          OWNER_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CASH_REGISTER-0007",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // listMovements
  // -------------------------------------------------------------------------

  describe("listMovements", () => {
    it("oturum aralığındaki tüm hareketleri döner (account bazlı)", async () => {
      const opened = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      insertKasaEntry(kasa, TENANT_A, "cash", "150", "credit", "pm-1");
      insertKasaEntry(kasa, TENANT_A, "card", "200", "credit", "pm-2");
      insertKasaEntry(kasa, TENANT_A, "cash", "30", "debit", "rv-1");
      const movements = await service.listMovements(
        TENANT_A,
        opened.id,
        STAFF_A,
      );
      expect(movements.total).toBe(3);
      const cashCredit = movements.items.find(
        (m) => m.account === "cash" && m.direction === "credit",
      );
      expect(cashCredit?.amountSigned).toBe("150");
    });

    it("oturum dışı hareketleri filtreler (occurredAt < openedAt)", async () => {
      const opened = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      // Açılıştan 1 sn önce oluşturulmuş hareket
      const past = new Date(Date.now() - 60_000).toISOString();
      kasa.insert({
        id: "ks-past",
        tenantId: TENANT_A,
        account: "cash",
        amountSigned: "999",
        direction: "credit",
        source: "payment_create",
        referenceId: "pm-past",
        referenceType: "payment",
        method: "cash",
        currency: "TRY",
        occurredAt: past,
        actorId: STAFF_A.actorId ?? "system",
        note: null,
      });
      const movements = await service.listMovements(
        TENANT_A,
        opened.id,
        STAFF_A,
      );
      expect(movements.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getSummary
  // -------------------------------------------------------------------------

  describe("getSummary", () => {
    it("hesap bazlı toplam ve net bakiye üretir", async () => {
      const opened = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "100" },
        STAFF_A,
      );
      insertKasaEntry(kasa, TENANT_A, "cash", "100", "credit", "pm-1");
      insertKasaEntry(kasa, TENANT_A, "card", "200", "credit", "pm-2");
      insertKasaEntry(kasa, TENANT_A, "cash", "30", "debit", "rv-1");

      const summary = await service.getSummary(TENANT_A, opened.id, STAFF_A);
      expect(summary.totalMovementCount).toBe(3);
      expect(summary.expectedBalance).toBe("370"); // 100 + 100 + 200 - 30

      const cash = summary.accounts.find((a) => a.account === "cash");
      expect(cash?.totalCredit).toBe("100");
      expect(cash?.totalDebit).toBe("30");
      expect(cash?.netBalance).toBe("70");
      expect(cash?.movementCount).toBe(2);

      const card = summary.accounts.find((a) => a.account === "card");
      expect(card?.netBalance).toBe("200");
      expect(card?.movementCount).toBe(1);
    });

    it("kapanmamış oturumda summary döner; closingBalance null kalır", async () => {
      const opened = await service.openSession(
        TENANT_A,
        { branchId: BRANCH_A, openingBalance: "50" },
        STAFF_A,
      );
      insertKasaEntry(kasa, TENANT_A, "cash", "20", "credit", "pm-1");
      const summary = await service.getSummary(TENANT_A, opened.id, STAFF_A);
      expect(summary.status).toBe("open");
      expect(summary.closingBalance).toBeNull();
      expect(summary.variance).toBeNull();
      expect(summary.expectedBalance).toBe("70");
    });
  });

  // -------------------------------------------------------------------------
  // Cross-tenant
  // -------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant read 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.openSession(
          TENANT_B,
          { branchId: BRANCH_A, openingBalance: "100" },
          OWNER_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("cross-tenant list 403", async () => {
      await expect(
        service.listSessions(TENANT_B, {}, OWNER_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Yardımcı: KasaRepository'ye test entry'si ekle.
  // -------------------------------------------------------------------------
});

/* --------------------------------------------------------------------------
 * Modül-düzeyinde test yardımcıları
 * -------------------------------------------------------------------------- */

function insertKasaEntry(
  target: KasaRepository,
  tenantId: string,
  account: "cash" | "card" | "bank" | "other",
  amountSigned: string,
  direction: "credit" | "debit",
  referenceId: string,
): void {
  const id = target.nextId(tenantId);
  // Üretim kuralı (payments.service.recordKasaEntry): amountSigned
  // yön bilgisini taşır (credit = +, debit = -). direction metadata.
  // Yardımcı: mutlak değer → signed.
  const signed =
    direction === "credit"
      ? amountSigned.replace(/^-/, "")
      : `-${amountSigned.replace(/^-/, "")}`;
  const rec: KasaEntryRecord = {
    id,
    tenantId,
    account,
    amountSigned: signed,
    direction,
    source: "payment_create",
    referenceId,
    referenceType: "payment",
    method:
      account === "cash"
        ? "cash"
        : account === "card"
          ? "card"
          : account === "bank"
            ? "bank_transfer"
            : "other",
    currency: "TRY",
    occurredAt: new Date().toISOString(),
    actorId: "usr-test",
    note: null,
  };
  target.insert(rec);
}
