/**
 * @file LabOrdersService unit testleri.
 * @module apps/api/modules/lab-orders/lab-orders.service.spec
 *
 * @description GOAL-091 laboratuvar isteği service testleri.
 *   - createLabOrder (katalog snapshot + audit).
 *   - state machine: ordered → collected → processing → completed.
 *   - cancelLabOrder (ordered|collected → cancelled; diğer 409).
 *   - katalog pasif/bulunamadı 422.
 *   - listLabOrders / getLabOrderDetail (tenant-scoped).
 *   - Cross-tenant IDOR / create 403.
 *
 * @since GOAL-091 (FAZ-9) laboratuvar isteği ve numune core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { LabOrdersRepository } from "./lab-orders.repository.js";
import { LabOrdersService } from "./lab-orders.service.js";
import { type LabTestsService } from "../lab-tests/lab-tests.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type {
  LabTest,
  LabOrderCancelInput,
  LabOrderCollectSampleInput,
  LabOrderCompleteInput,
  LabOrderCreateInput,
  LabOrderStartProcessingInput,
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

const PATIENT_A = "00000000-0000-0000-0000-000000000001";
const LAB_TEST_ID = "00000000-0000-0000-0000-000000000010";
const LAB_TEST_ID_INACTIVE = "00000000-0000-0000-0000-000000000011";
const LAB_TEST_ID_MISSING = "00000000-0000-0000-0000-000000000099";
const VET_USER_ID = "00000000-0000-0000-0000-000000000020";

/**
 * Katalog stub'u: tenant-scoped in-memory Map ile `getLabTestDetail`
 * davranışı. `getLabTestDetail` lab test'i döner veya null.
 * Service spec'inin `findById` davranışını birebir karşılar.
 */
class StubLabTestsService {
  private readonly byId = new Map<string, LabTest>();
  public nextReturnActive = true;

  public addTest(test: LabTest): void {
    this.byId.set(test.id, test);
  }

  public async getLabTestDetail(
    tenantId: string,
    id: string,
    _actor: ActorContext,
  ): Promise<LabTest | null> {
    const t = this.byId.get(id);
    if (!t || t.tenantId !== tenantId) return null;
    if (!this.nextReturnActive) return { ...t, active: false };
    return t;
  }

  /** Spec'in ihtiyaç duymadığı diğer metodlar için no-op. */
  public async createLabTest(): Promise<LabTest> {
    throw new Error("not implemented in stub");
  }
  public async listLabTests(): Promise<{
    items: LabTest[];
    total: number;
  }> {
    return { items: [], total: 0 };
  }
  public async updateLabTest(): Promise<LabTest> {
    throw new Error("not implemented in stub");
  }
}

function makeTest(overrides: Partial<LabTest> = {}): LabTest {
  return {
    id: LAB_TEST_ID,
    tenantId: TENANT_A,
    code: "CBC",
    name: "Tam kan sayımı",
    sampleType: "blood",
    unit: "10^3/µL",
    referenceRange: "5.0-15.0",
    conditionalRanges: null,
    price: "120.0000",
    active: true,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "system",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeCreateInput(
  overrides: Partial<LabOrderCreateInput> = {},
): LabOrderCreateInput {
  return {
    patientId: PATIENT_A,
    labTestId: LAB_TEST_ID,
    sourceType: "manual",
    priority: "routine",
    ...overrides,
  } as LabOrderCreateInput;
}

describe("LabOrdersService", () => {
  let service: LabOrdersService;
  let repo: LabOrdersRepository;
  let audit: AuditService;
  let labTests: StubLabTestsService;

  beforeEach(() => {
    repo = new LabOrdersRepository();
    audit = makeAudit();
    labTests = new StubLabTestsService();
    labTests.addTest(makeTest());
    labTests.addTest(
      makeTest({ id: LAB_TEST_ID_INACTIVE, code: "BUN", active: false }),
    );
    // Stub'u LabTestsService tipinde inject et
    service = new LabOrdersService(
      repo,
      labTests as unknown as LabTestsService,
      audit,
    );
  });

  // ---------------------------------------------------------------------------
  // createLabOrder
  // ---------------------------------------------------------------------------

  describe("createLabOrder", () => {
    it("yeni sipariş oluşturur (status=ordered) + katalog snapshot", async () => {
      const out = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      expect(out.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(out.status).toBe("ordered");
      expect(out.labTestCode).toBe("CBC");
      expect(out.labTestName).toBe("Tam kan sayımı");
      expect(out.sampleType).toBe("blood");
      expect(out.price).toBe("120.0000");
      expect(out.priority).toBe("routine");
      expect(out.collectedAt).toBeNull();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:laborder.create",
        "laborder",
        out.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({ labTestCode: "CBC" }),
      );
    });

    it("priority=stat ile açılır", async () => {
      const out = await service.createLabOrder(
        TENANT_A,
        makeCreateInput({ priority: "stat" }),
        STAFF_A,
      );
      expect(out.priority).toBe("stat");
    });

    it("katalog bulunamadı → 422 VET-LABORD-0003", async () => {
      await expect(
        service.createLabOrder(
          TENANT_A,
          makeCreateInput({ labTestId: LAB_TEST_ID_MISSING }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABORD-0003",
        httpStatus: 422,
      });
    });

    it("katalog pasif → 422 VET-LABORD-0004", async () => {
      await expect(
        service.createLabOrder(
          TENANT_A,
          makeCreateInput({ labTestId: LAB_TEST_ID_INACTIVE }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABORD-0004",
        httpStatus: 422,
      });
    });

    it("katalog snapshot'ı katalog sonradan değişse bile sabit kalır", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      // Kataloğu değiştir (pasifle)
      labTests.addTest(makeTest({ id: LAB_TEST_ID, active: false }));
      const got = await service.getLabOrderDetail(
        TENANT_A,
        created.id,
        STAFF_A,
      );
      expect(got?.labTestCode).toBe("CBC");
      expect(got?.price).toBe("120.0000");
    });
  });

  // ---------------------------------------------------------------------------
  // collectSample
  // ---------------------------------------------------------------------------

  describe("collectSample", () => {
    it("ordered → collected + collectedAt set", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const out = await service.collectSample(
        TENANT_A,
        created.id,
        {
          collectedAt: "2026-01-15T10:00:00.000Z",
          collectedByUserId: VET_USER_ID,
          sampleQuality: "ok",
        } as LabOrderCollectSampleInput,
        STAFF_A,
      );
      expect(out.status).toBe("collected");
      expect(out.collectedAt).toBe("2026-01-15T10:00:00.000Z");
      expect(out.collectedByUserId).toBe(VET_USER_ID);
      expect(out.sampleQuality).toBe("ok");
    });

    it("sampleQuality default 'ok'", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const out = await service.collectSample(
        TENANT_A,
        created.id,
        {
          collectedAt: "2026-01-15T10:00:00.000Z",
          collectedByUserId: VET_USER_ID,
        } as LabOrderCollectSampleInput,
        STAFF_A,
      );
      expect(out.sampleQuality).toBe("ok");
    });

    it("collected durumda tekrar collect 409 VET-LABORD-0002", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.collectSample(
        TENANT_A,
        created.id,
        {
          collectedAt: "2026-01-15T10:00:00.000Z",
          collectedByUserId: VET_USER_ID,
        } as LabOrderCollectSampleInput,
        STAFF_A,
      );
      await expect(
        service.collectSample(
          TENANT_A,
          created.id,
          {
            collectedAt: "2026-01-15T11:00:00.000Z",
            collectedByUserId: VET_USER_ID,
          } as LabOrderCollectSampleInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABORD-0002",
        httpStatus: 409,
      });
    });

    it("cancelled order'a collect 409", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.cancelLabOrder(
        TENANT_A,
        created.id,
        { reason: "vazgeçti" } as LabOrderCancelInput,
        STAFF_A,
      );
      await expect(
        service.collectSample(
          TENANT_A,
          created.id,
          {
            collectedAt: "2026-01-15T10:00:00.000Z",
            collectedByUserId: VET_USER_ID,
          } as LabOrderCollectSampleInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABORD-0002",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // startProcessing
  // ---------------------------------------------------------------------------

  describe("startProcessing", () => {
    it("collected → processing + processingStartedAt set", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.collectSample(
        TENANT_A,
        created.id,
        {
          collectedAt: "2026-01-15T10:00:00.000Z",
          collectedByUserId: VET_USER_ID,
        } as LabOrderCollectSampleInput,
        STAFF_A,
      );
      const out = await service.startProcessing(
        TENANT_A,
        created.id,
        {
          sentAt: "2026-01-15T10:30:00.000Z",
          labReference: "REF-001",
        } as LabOrderStartProcessingInput,
        STAFF_A,
      );
      expect(out.status).toBe("processing");
      expect(out.processingStartedAt).toBe("2026-01-15T10:30:00.000Z");
    });

    it("ordered (numune alınmadan) start 409", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await expect(
        service.startProcessing(
          TENANT_A,
          created.id,
          {} as LabOrderStartProcessingInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABORD-0002",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // completeLabOrder
  // ---------------------------------------------------------------------------

  describe("completeLabOrder", () => {
    it("processing → completed + completedAt set", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.collectSample(
        TENANT_A,
        created.id,
        {
          collectedAt: "2026-01-15T10:00:00.000Z",
          collectedByUserId: VET_USER_ID,
        } as LabOrderCollectSampleInput,
        STAFF_A,
      );
      await service.startProcessing(
        TENANT_A,
        created.id,
        {} as LabOrderStartProcessingInput,
        STAFF_A,
      );
      const out = await service.completeLabOrder(
        TENANT_A,
        created.id,
        { notes: "tamamlandı" } as LabOrderCompleteInput,
        STAFF_A,
      );
      expect(out.status).toBe("completed");
      expect(out.completedAt).not.toBeNull();
    });

    it("ordered tamamlanamaz 409", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await expect(
        service.completeLabOrder(
          TENANT_A,
          created.id,
          {} as LabOrderCompleteInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABORD-0002",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // cancelLabOrder
  // ---------------------------------------------------------------------------

  describe("cancelLabOrder", () => {
    it("ordered → cancelled", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const out = await service.cancelLabOrder(
        TENANT_A,
        created.id,
        { reason: "iptal" } as LabOrderCancelInput,
        STAFF_A,
      );
      expect(out.status).toBe("cancelled");
      expect(out.cancelReason).toBe("iptal");
      expect(out.cancelledAt).not.toBeNull();
    });

    it("collected → cancelled", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.collectSample(
        TENANT_A,
        created.id,
        {
          collectedAt: "2026-01-15T10:00:00.000Z",
          collectedByUserId: VET_USER_ID,
        } as LabOrderCollectSampleInput,
        STAFF_A,
      );
      const out = await service.cancelLabOrder(
        TENANT_A,
        created.id,
        { reason: "numune uygun değil" } as LabOrderCancelInput,
        STAFF_A,
      );
      expect(out.status).toBe("cancelled");
    });

    it("processing → cancel 409", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.collectSample(
        TENANT_A,
        created.id,
        {
          collectedAt: "2026-01-15T10:00:00.000Z",
          collectedByUserId: VET_USER_ID,
        } as LabOrderCollectSampleInput,
        STAFF_A,
      );
      await service.startProcessing(
        TENANT_A,
        created.id,
        {} as LabOrderStartProcessingInput,
        STAFF_A,
      );
      await expect(
        service.cancelLabOrder(
          TENANT_A,
          created.id,
          { reason: "iptal" } as LabOrderCancelInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABORD-0002",
      });
    });

    it("completed → cancel 409", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.collectSample(
        TENANT_A,
        created.id,
        {
          collectedAt: "2026-01-15T10:00:00.000Z",
          collectedByUserId: VET_USER_ID,
        } as LabOrderCollectSampleInput,
        STAFF_A,
      );
      await service.startProcessing(
        TENANT_A,
        created.id,
        {} as LabOrderStartProcessingInput,
        STAFF_A,
      );
      await service.completeLabOrder(
        TENANT_A,
        created.id,
        {} as LabOrderCompleteInput,
        STAFF_A,
      );
      await expect(
        service.cancelLabOrder(
          TENANT_A,
          created.id,
          { reason: "iptal" } as LabOrderCancelInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABORD-0002",
      });
    });

    it("zaten cancelled → 409", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.cancelLabOrder(
        TENANT_A,
        created.id,
        { reason: "ilk" } as LabOrderCancelInput,
        STAFF_A,
      );
      await expect(
        service.cancelLabOrder(
          TENANT_A,
          created.id,
          { reason: "ikinci" } as LabOrderCancelInput,
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABORD-0002",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // listLabOrders / getLabOrderDetail
  // ---------------------------------------------------------------------------

  describe("listLabOrders", () => {
    it("tenant-scoped; status filtresi", async () => {
      const a = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      await service.createLabOrder(TENANT_A, makeCreateInput(), STAFF_A);
      await service.collectSample(
        TENANT_A,
        a.id,
        {
          collectedAt: "2026-01-15T10:00:00.000Z",
          collectedByUserId: VET_USER_ID,
        } as LabOrderCollectSampleInput,
        STAFF_A,
      );
      const list = await service.listLabOrders(
        TENANT_A,
        { status: "collected", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(list.total).toBe(1);
      expect(list.items[0]!.id).toBe(a.id);
    });

    it("cross-tenant IDOR → boş", async () => {
      await service.createLabOrder(TENANT_A, makeCreateInput(), STAFF_A);
      const list = await service.listLabOrders(
        TENANT_B,
        { limit: 50, offset: 0 },
        STAFF_B,
      );
      expect(list.total).toBe(0);
    });
  });

  describe("getLabOrderDetail", () => {
    it("kendi tenant içinde bulur", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const got = await service.getLabOrderDetail(
        TENANT_A,
        created.id,
        STAFF_A,
      );
      expect(got?.id).toBe(created.id);
    });

    it("cross-tenant IDOR → null", async () => {
      const created = await service.createLabOrder(
        TENANT_A,
        makeCreateInput(),
        STAFF_A,
      );
      const got = await service.getLabOrderDetail(
        TENANT_B,
        created.id,
        STAFF_B,
      );
      expect(got).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.createLabOrder(TENANT_B, makeCreateInput(), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
