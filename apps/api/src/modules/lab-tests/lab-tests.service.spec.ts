/**
 * @file LabTestsService unit testleri.
 * @module apps/api/modules/lab-tests/lab-tests.service.spec
 *
 * @description GOAL-090 laboratuvar test kataloğu service
 * testleri.
 *   - createLabTest (oluşturma + audit).
 *   - duplicate code 409 VET-LABTEST-0002.
 *   - listLabTests (sampleType/active/search filtreleri).
 *   - getLabTestDetail (cross-tenant → null).
 *   - updateLabTest (kısmi güncelleme + arşiv).
 *   - Cross-tenant create 403 VET-AUTHZ-0001.
 *   - Update missing 404 VET-LABTEST-0001.
 *
 * @since GOAL-090 (FAZ-9) laboratuvar test kataloğu core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

import { LabTestsService } from "./lab-tests.service.js";
import { LabTestsRepository } from "./lab-tests.repository.js";
import type {
  LabTestCreateInput,
  LabTestUpdateInput,
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

function makeCreateInput(
  overrides: Partial<LabTestCreateInput> = {},
): LabTestCreateInput {
  return {
    code: "CBC",
    name: "Tam kan sayımı",
    sampleType: "blood",
    unit: "10^3/µL",
    price: "120.0000",
    ...overrides,
  } as LabTestCreateInput;
}

describe("LabTestsService", () => {
  let service: LabTestsService;
  let repo: LabTestsRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new LabTestsRepository();
    audit = makeAudit();
    service = new LabTestsService(repo, audit);
  });

  // ---------------------------------------------------------------------------
  // createLabTest
  // ---------------------------------------------------------------------------

  describe("createLabTest", () => {
    it("yeni katalog girdisi oluşturur + audit", async () => {
      const out = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      expect(out.id).toMatch(/^lt-/);
      expect(out.code).toBe("CBC");
      expect(out.name).toBe("Tam kan sayımı");
      expect(out.sampleType).toBe("blood");
      expect(out.price).toBe("120.0000");
      expect(out.active).toBe(true);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:labtest.create",
        "labtest",
        out.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({ code: "CBC", sampleType: "blood" }),
      );
    });

    it("active default true; referenceRange/notes null", async () => {
      const out = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      expect(out.active).toBe(true);
      expect(out.referenceRange).toBeNull();
      expect(out.notes).toBeNull();
      expect(out.conditionalRanges).toBeNull();
    });

    it("active=false ile pasif oluşturma", async () => {
      const out = await service.createLabTest(
        TENANT_A,
        makeCreateInput({ active: false }),
        STAFF_A,
      );
      expect(out.active).toBe(false);
    });

    it("aynı code ile 409 VET-LABTEST-0002", async () => {
      await service.createLabTest(TENANT_A, makeCreateInput(), STAFF_A);
      await expect(
        service.createLabTest(TENANT_A, makeCreateInput(), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-LABTEST-0002",
        httpStatus: 409,
      });
    });

    it("code büyük/küçük harf duyarsız unique", async () => {
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "BUN" }),
        STAFF_A,
      );
      await expect(
        service.createLabTest(
          TENANT_A,
          makeCreateInput({ code: "bun" }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABTEST-0002",
      });
    });

    it("farklı tenant aynı code → başarılı", async () => {
      const a = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const b = await service.createLabTest(
        TENANT_B,
        makeCreateInput(),
        STAFF_B,
      );
      expect(a.code).toBe(b.code);
      expect(a.tenantId).not.toBe(b.tenantId);
    });
  });

  // ---------------------------------------------------------------------------
  // listLabTests
  // ---------------------------------------------------------------------------

  describe("listLabTests", () => {
    it("tüm tenant kayıtlarını listeler", async () => {
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "CBC" }),
        STAFF_A,
      );
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "BUN", sampleType: "blood" }),
        STAFF_A,
      );
      const list = await service.listLabTests(
        TENANT_A,
        { limit: 50, offset: 0, sort: "asc" },
        STAFF_A,
      );
      expect(list.total).toBe(2);
      expect(list.items[0]!.code).toBe("BUN");
      expect(list.items[1]!.code).toBe("CBC");
    });

    it("sampleType filtresi", async () => {
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "CBC", sampleType: "blood" }),
        STAFF_A,
      );
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "UA", sampleType: "urine" }),
        STAFF_A,
      );
      const list = await service.listLabTests(
        TENANT_A,
        { sampleType: "urine", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]!.code).toBe("UA");
    });

    it("active=false filtresi sadece arşivlileri getirir", async () => {
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "CBC" }),
        STAFF_A,
      );
      const b = await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "BUN" }),
        STAFF_A,
      );
      await service.updateLabTest(
        TENANT_A,
        b.id,
        { active: false } as LabTestUpdateInput,
        STAFF_A,
      );
      const list = await service.listLabTests(
        TENANT_A,
        { active: false, limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]!.code).toBe("BUN");
      expect(list.items[0]!.active).toBe(false);
    });

    it("search code + name'de substring", async () => {
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "CBC", name: "Tam kan sayımı" }),
        STAFF_A,
      );
      await service.createLabTest(
        TENANT_A,
        makeCreateInput({ code: "BUN", name: "Üre azotu" }),
        STAFF_A,
      );
      const list = await service.listLabTests(
        TENANT_A,
        { search: "üre", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]!.code).toBe("BUN");
    });

    it("cross-tenant IDOR → boş", async () => {
      await service.createLabTest(TENANT_A, makeCreateInput(), STAFF_A);
      const list = await service.listLabTests(
        TENANT_B,
        { limit: 50, offset: 0 },
        STAFF_B,
      );
      expect(list.total).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getLabTestDetail
  // ---------------------------------------------------------------------------

  describe("getLabTestDetail", () => {
    it("kendi tenant içinde bulur", async () => {
      const created = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const got = await service.getLabTestDetail(
        TENANT_A,
        created.id,
        STAFF_A,
      );
      expect(got?.id).toBe(created.id);
    });

    it("cross-tenant IDOR → null", async () => {
      const created = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const got = await service.getLabTestDetail(
        TENANT_B,
        created.id,
        STAFF_B,
      );
      expect(got).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // updateLabTest
  // ---------------------------------------------------------------------------

  describe("updateLabTest", () => {
    it("kısmi güncelleme + audit", async () => {
      const created = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const updated = await service.updateLabTest(
        TENANT_A,
        created.id,
        { name: "Tam kan (panel)", price: "150.00" } as LabTestUpdateInput,
        STAFF_A,
      );
      expect(updated.name).toBe("Tam kan (panel)");
      expect(updated.price).toBe("150.00");
      expect(updated.code).toBe("CBC");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:labtest.update",
        "labtest",
        created.id,
        "update",
        expect.anything(),
        "info",
        expect.objectContaining({ code: "CBC" }),
      );
    });

    it("active=false ile arşivleme", async () => {
      const created = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const updated = await service.updateLabTest(
        TENANT_A,
        created.id,
        { active: false } as LabTestUpdateInput,
        STAFF_A,
      );
      expect(updated.active).toBe(false);
    });

    it("bulunamadı → 404 VET-LABTEST-0001", async () => {
      await expect(
        service.updateLabTest(
          TENANT_A,
          "00000000-0000-0000-0000-000000000999",
          { name: "x" } as LabTestUpdateInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABTEST-0001",
        httpStatus: 404,
      });
    });

    it("cross-tenant update 404", async () => {
      const created = await service.createLabTest(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await expect(
        service.updateLabTest(
          TENANT_B,
          created.id,
          { name: "x" } as LabTestUpdateInput,
          STAFF_B,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABTEST-0001",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.createLabTest(TENANT_B, makeCreateInput(), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("cross-tenant list 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.listLabTests(
          TENANT_B,
          { limit: 50, offset: 0 },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
