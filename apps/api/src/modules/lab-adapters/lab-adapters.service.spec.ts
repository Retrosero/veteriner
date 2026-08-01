/**
 * @file LabAdaptersService unit testleri.
 * @module apps/api/modules/lab-adapters/lab-adapters.service.spec
 *
 * @description GOAL-094 cihaz/dış lab adapter service testleri.
 *   - exportOrder (accepted + rejected + idempotency + cross-tenant)
 *   - retryExport (failed/rejected → retry; accepted 409)
 *   - cancelExport (pending/failed → cancelled; accepted 409)
 *   - importResult (received + auto-mapping applied + rejected)
 *   - listExports / listImports / getExport / getImport (tenant-scoped)
 *   - listAdapters (iki mock döner)
 *   - Cross-tenant IDOR / create 403.
 *
 * @since GOAL-094 (FAZ-9) cihaz ve dış laboratuvar adapter altyapısı core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { LabAdaptersRepository } from "./lab-adapters.repository.js";
import { LabAdaptersService } from "./lab-adapters.service.js";
import { MockExternalLabAdapter } from "../../common/lab-adapters/mock-external-lab-adapter.js";
import { MockLabDeviceAdapter } from "../../common/lab-adapters/mock-lab-device-adapter.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { LabAdapter } from "../../common/lab-adapters/lab-adapter.types.js";
import type { LabOrdersService } from "../lab-orders/lab-orders.service.js";
import type { LabResultsService } from "../lab-results/lab-results.service.js";
import type {
  LabAdapterExportCreateInput,
  LabAdapterImportCreateInput,
  LabOrder,
} from "@vetniva/contracts";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const _STAFF_A: ActorContext = {
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

const VET_A: ActorContext = {
  actorId: "usr-vet-a",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-1v",
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

const SUPERADMIN: ActorContext = {
  actorId: "usr-super",
  actorType: "user",
  role: "SUPERADMIN",
  tenantId: null,
  branchId: null,
  isSuperadmin: true,
  correlationId: "req-sa",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const PATIENT_A = "00000000-0000-0000-0000-000000000001";
const LAB_ORDER_ID = "00000000-0000-0000-0000-000000000010";
const LAB_ORDER_ID_CANCELLED = "00000000-0000-0000-0000-000000000011";
const LAB_ORDER_ID_OTHER_TENANT = "00000000-0000-0000-0000-000000000012";

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

function makeOrder(overrides: Partial<LabOrder> = {}): LabOrder {
  return {
    id: LAB_ORDER_ID,
    tenantId: TENANT_A,
    patientId: PATIENT_A,
    labTestId: "00000000-0000-0000-0000-000000000100",
    labTestCode: "CBC",
    labTestName: "Tam kan sayımı",
    sampleType: "blood",
    unit: "10^3/µL",
    referenceRange: "5.0-15.0",
    price: "120.0000",
    sourceType: "manual",
    sourceId: null,
    priority: "routine",
    status: "processing",
    collectedAt: "2026-07-30T08:00:00.000Z",
    collectedByUserId: null,
    sampleQuality: "ok",
    processingStartedAt: "2026-07-30T08:30:00.000Z",
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    notes: null,
    createdAt: "2026-07-30T07:00:00.000Z",
    createdBy: "system",
    updatedAt: "2026-07-30T08:30:00.000Z",
    ...overrides,
  };
}

class StubLabOrdersService {
  public orders = new Map<string, LabOrder>();
  public setOrder(o: LabOrder): void {
    this.orders.set(o.id, o);
  }
  public async getLabOrderDetail(
    tenantId: string,
    id: string,
    _actor: ActorContext,
  ): Promise<LabOrder | null> {
    const o = this.orders.get(id);
    if (!o || o.tenantId !== tenantId) return null;
    return o;
  }
}

class StubLabResultsService {
  public nextResultId = "lr-stub-1";
  public nextStatus: "draft" | "pending_review" | "approved" = "draft";
  public nextError: Error | null = null;
  public calls: Array<{
    tenantId: string;
    labOrderId: string;
    value: string;
  }> = [];
  public async createLabResult(
    tenantId: string,
    labOrderId: string,
    input: { value: string },
    _actor: ActorContext,
  ): Promise<{ id: string; status: string }> {
    if (this.nextError) throw this.nextError;
    this.calls.push({ tenantId, labOrderId, value: input.value });
    return { id: this.nextResultId, status: this.nextStatus };
  }
}

function makeService(
  opts: {
    labOrders?: StubLabOrdersService;
    labResults?: StubLabResultsService;
    device?: LabAdapter;
    external?: LabAdapter;
  } = {},
) {
  const repo = new LabAdaptersRepository();
  const labOrders = opts.labOrders ?? new StubLabOrdersService();
  const labResults = opts.labResults ?? new StubLabResultsService();
  const device = opts.device ?? new MockLabDeviceAdapter();
  const external = opts.external ?? new MockExternalLabAdapter();
  const audit = makeAudit();
  const service = new LabAdaptersService(
    repo,
    labOrders as unknown as LabOrdersService,
    labResults as unknown as LabResultsService,
    device,
    external,
    audit,
  );
  return { service, repo, labOrders, labResults, device, external, audit };
}

function makeExportInput(
  overrides: Partial<LabAdapterExportCreateInput> = {},
): LabAdapterExportCreateInput {
  return {
    adapterType: "in_clinic_device",
    idempotencyKey: "key-1",
    ...overrides,
  } as LabAdapterExportCreateInput;
}

function makeImportInput(
  overrides: Partial<LabAdapterImportCreateInput> = {},
): LabAdapterImportCreateInput {
  return {
    adapterType: "in_clinic_device",
    providerReference: "dev-abc-123",
    simulatePayload: {
      readings: [
        {
          code: "CBC",
          value: "7.5",
          unit: "10^3/µL",
          referenceRange: "5.0-15.0",
        },
      ],
    },
    ...overrides,
  } as LabAdapterImportCreateInput;
}

describe("LabAdaptersService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // exportOrder
  // ---------------------------------------------------------------------------

  describe("exportOrder", () => {
    it("in_clinic_device export kabul eder (accepted) + audit info", async () => {
      const { service, labOrders, audit } = makeService();
      labOrders.setOrder(makeOrder());
      const out = await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput(),
        VET_A,
      );
      expect(out.id).toMatch(/^lax-/);
      expect(out.status).toBe("accepted");
      expect(out.adapterType).toBe("in_clinic_device");
      expect(out.providerName).toBe("mock-device");
      expect(out.providerReference).toBe(`dev-${LAB_ORDER_ID}`);
      expect(out.attemptCount).toBe(1);
      expect(out.notes).toBeNull();
      expect(out.payload).toMatchObject({
        tenantId: TENANT_A,
        patientId: PATIENT_A,
        labTestCode: "CBC",
        unit: "10^3/µL",
      });
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:lab_adapter_export.create",
        "lab_adapter_export",
        out.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({
          labOrderId: LAB_ORDER_ID,
          adapterType: "in_clinic_device",
          providerStatus: "accepted",
        }),
      );
    });

    it("external_lab export kabul eder", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      const out = await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput({ adapterType: "external_lab" }),
        VET_A,
      );
      expect(out.status).toBe("accepted");
      expect(out.adapterType).toBe("external_lab");
      expect(out.providerName).toBe("mock-external-lab");
      expect(out.providerReference).toMatch(/^ext-/);
    });

    it("simulateFailure=true → rejected + audit warning", async () => {
      const { service, labOrders, audit } = makeService();
      labOrders.setOrder(makeOrder());
      const out = await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput({ idempotencyKey: "k-fail", simulateFailure: true }),
        VET_A,
      );
      expect(out.status).toBe("rejected");
      expect(out.lastError).toMatch(/simulated failure/i);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:lab_adapter_export.create",
        "lab_adapter_export",
        out.id,
        "create",
        expect.anything(),
        "warning",
        expect.anything(),
      );
    });

    it("aynı idempotencyKey ile ikinci export aynı yanıtı döner (duplicate retry)", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      const first = await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput(),
        VET_A,
      );
      // Aynı key ile tekrar: mock adapter aynı yanıtı döner; ama
      // service her çağrıda yeni bir export kaydı oluşturur (audit
      // trail). Burada aynı providerReference doğrulanır.
      const second = await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput(),
        VET_A,
      );
      expect(second.providerReference).toBe(first.providerReference);
      expect(second.status).toBe(first.status);
    });

    it("lab order bulunamazsa 404 VET-LABADAPTER-0003", async () => {
      const { service } = makeService();
      await expect(
        service.exportOrder(TENANT_A, LAB_ORDER_ID, makeExportInput(), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-LABADAPTER-0003",
        httpStatus: 404,
      });
    });

    it("cancelled order export edilemez 422 VET-LABADAPTER-0004", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(
        makeOrder({ id: LAB_ORDER_ID_CANCELLED, status: "cancelled" }),
      );
      await expect(
        service.exportOrder(
          TENANT_A,
          LAB_ORDER_ID_CANCELLED,
          makeExportInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABADAPTER-0004",
        httpStatus: 422,
      });
    });

    it("accepted export sonrası yeni export 409 VET-LABADAPTER-0006", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput(),
        VET_A,
      );
      // Aynı adapterType ile ikinci accepted denemesi
      // (idempotencyKey farklı, çünkü aynı key ikinci export'u
      // oluşturmaz — yine de accepted olan bir kayıt olduğu için
      // VET-LABADAPTER-0006 beklenir).
      await expect(
        service.exportOrder(
          TENANT_A,
          LAB_ORDER_ID,
          makeExportInput({ idempotencyKey: "key-2" }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABADAPTER-0006",
        httpStatus: 409,
      });
    });

    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      await expect(
        service.exportOrder(TENANT_A, LAB_ORDER_ID, makeExportInput(), STAFF_B),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });

    it("SUPERADMIN cross-tenant export edebilir", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      const out = await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput(),
        SUPERADMIN,
      );
      expect(out.id).toMatch(/^lax-/);
    });
  });

  // ---------------------------------------------------------------------------
  // retryExport
  // ---------------------------------------------------------------------------

  describe("retryExport", () => {
    it("failed export → retry, attemptCount artar", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      const created = await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput({ idempotencyKey: "k-fail", simulateFailure: true }),
        VET_A,
      );
      expect(created.status).toBe("rejected");
      // Retry: simulateFailure'siz yeni payload ile mock accepted
      // döner. attemptCount 2 olur.
      const retried = await service.retryExport(TENANT_A, created.id, VET_A);
      expect(retried.attemptCount).toBe(2);
      expect(retried.status).toBe("accepted");
    });

    it("accepted export retry 409 VET-LABADAPTER-0007", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      const created = await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput(),
        VET_A,
      );
      expect(created.status).toBe("accepted");
      await expect(
        service.retryExport(TENANT_A, created.id, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-LABADAPTER-0007",
        httpStatus: 409,
      });
    });

    it("export bulunamazsa 404 VET-LABADAPTER-0001", async () => {
      const { service } = makeService();
      await expect(
        service.retryExport(TENANT_A, "non-existent", VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-LABADAPTER-0001",
        httpStatus: 404,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // cancelExport
  // ---------------------------------------------------------------------------

  describe("cancelExport", () => {
    it("rejected export cancel edilebilir → cancelled", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      const created = await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput({ idempotencyKey: "k-fail", simulateFailure: true }),
        VET_A,
      );
      expect(created.status).toBe("rejected");
      const cancelled = await service.cancelExport(
        TENANT_A,
        created.id,
        { reason: "hasta gelmedi" },
        VET_A,
      );
      expect(cancelled.status).toBe("cancelled");
    });

    it("accepted export cancel edilemez 409 VET-LABADAPTER-0008", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      const created = await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput(),
        VET_A,
      );
      expect(created.status).toBe("accepted");
      await expect(
        service.cancelExport(TENANT_A, created.id, { reason: "iptal" }, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-LABADAPTER-0008",
        httpStatus: 409,
      });
    });

    it("zaten cancelled export için idempotent no-op", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      const created = await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput({ idempotencyKey: "k-fail", simulateFailure: true }),
        VET_A,
      );
      const c1 = await service.cancelExport(
        TENANT_A,
        created.id,
        { reason: "iptal" },
        VET_A,
      );
      const c2 = await service.cancelExport(
        TENANT_A,
        created.id,
        { reason: "tekrar iptal" },
        VET_A,
      );
      expect(c2.status).toBe("cancelled");
      expect(c2.id).toBe(c1.id);
    });
  });

  // ---------------------------------------------------------------------------
  // importResult
  // ---------------------------------------------------------------------------

  describe("importResult", () => {
    it("rawPayload readings içeriyorsa labResult oluşturur → applied", async () => {
      const { service, labOrders, labResults } = makeService();
      labOrders.setOrder(makeOrder());
      const out = await service.importResult(
        TENANT_A,
        LAB_ORDER_ID,
        makeImportInput(),
        VET_A,
      );
      expect(out.status).toBe("applied");
      expect(out.mappedResultId).toBe("lr-stub-1");
      expect(out.mappedAt).not.toBeNull();
      expect(out.mappedBy).toBe("usr-vet-a");
      expect(out.errorMessage).toBeNull();
      expect(labResults.calls).toHaveLength(1);
      expect(labResults.calls[0]).toEqual({
        tenantId: TENANT_A,
        labOrderId: LAB_ORDER_ID,
        value: "7.5",
      });
    });

    it("labResult create hata verirse → rejected + errorMessage", async () => {
      const { service, labOrders, labResults } = makeService();
      labOrders.setOrder(makeOrder());
      labResults.nextError = new Error("mapping başarısız");
      const out = await service.importResult(
        TENANT_A,
        LAB_ORDER_ID,
        makeImportInput(),
        VET_A,
      );
      expect(out.status).toBe("rejected");
      expect(out.errorMessage).toBe("mapping başarısız");
      expect(out.mappedResultId).toBeNull();
    });

    it("readings boşsa → received (auto-mapping yapılmaz)", async () => {
      const { service, labOrders, labResults } = makeService();
      labOrders.setOrder(makeOrder());
      const out = await service.importResult(
        TENANT_A,
        LAB_ORDER_ID,
        makeImportInput({ simulatePayload: { foo: "bar" } }),
        VET_A,
      );
      expect(out.status).toBe("received");
      expect(out.mappedResultId).toBeNull();
      expect(labResults.calls).toHaveLength(0);
    });

    it("value okunamazsa → rejected", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      const out = await service.importResult(
        TENANT_A,
        LAB_ORDER_ID,
        makeImportInput({
          simulatePayload: { readings: [{ code: "X" }] },
        }),
        VET_A,
      );
      expect(out.status).toBe("rejected");
      expect(out.errorMessage).toMatch(/value bulunamadı/);
    });

    it("order ordered (henüz processing değil) → received", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder({ status: "ordered" }));
      const out = await service.importResult(
        TENANT_A,
        LAB_ORDER_ID,
        makeImportInput(),
        VET_A,
      );
      expect(out.status).toBe("received");
    });

    it("cancelled order import edilemez 422 VET-LABADAPTER-0009", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(
        makeOrder({ id: LAB_ORDER_ID_CANCELLED, status: "cancelled" }),
      );
      await expect(
        service.importResult(
          TENANT_A,
          LAB_ORDER_ID_CANCELLED,
          makeImportInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABADAPTER-0009",
        httpStatus: 422,
      });
    });

    it("lab order bulunamazsa 404 VET-LABADAPTER-0003", async () => {
      const { service } = makeService();
      await expect(
        service.importResult(
          TENANT_A,
          "non-existent",
          makeImportInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABADAPTER-0003",
        httpStatus: 404,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // list / get
  // ---------------------------------------------------------------------------

  describe("list / get", () => {
    it("listExports tenant-scoped + filtreler", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput({ idempotencyKey: "k1" }),
        VET_A,
      );
      await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput({
          adapterType: "external_lab",
          idempotencyKey: "k2",
        }),
        VET_A,
      );
      const all = await service.listExports(
        TENANT_A,
        { limit: 50, offset: 0 },
        VET_A,
      );
      expect(all.total).toBe(2);
      const onlyDevice = await service.listExports(
        TENANT_A,
        { limit: 50, offset: 0, adapterType: "in_clinic_device" },
        VET_A,
      );
      expect(onlyDevice.total).toBe(1);
    });

    it("listImports tenant-scoped", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      await service.importResult(
        TENANT_A,
        LAB_ORDER_ID,
        makeImportInput(),
        VET_A,
      );
      const out = await service.listImports(
        TENANT_A,
        { limit: 50, offset: 0 },
        VET_A,
      );
      expect(out.total).toBe(1);
      expect(out.items[0]?.status).toBe("applied");
    });

    it("getExport cross-tenant → null", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      const exp = await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput(),
        VET_A,
      );
      const found = await service.getExport(TENANT_B, exp.id, STAFF_B);
      expect(found).toBeNull();
    });

    it("getImport cross-tenant → null", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      const imp = await service.importResult(
        TENANT_A,
        LAB_ORDER_ID,
        makeImportInput(),
        VET_A,
      );
      const found = await service.getImport(TENANT_B, imp.id, STAFF_B);
      expect(found).toBeNull();
    });

    it("listAdapters iki mock döner", () => {
      const { service } = makeService();
      const adapters = service.listAdapters();
      expect(adapters).toHaveLength(2);
      expect(adapters[0]?.type).toBe("in_clinic_device");
      expect(adapters[1]?.type).toBe("external_lab");
      expect(adapters.every((a) => a.enabled)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant listExports boş döner", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput(),
        VET_A,
      );
      const out = await service.listExports(
        TENANT_B,
        { limit: 50, offset: 0 },
        STAFF_B,
      );
      expect(out.total).toBe(0);
    });

    it("cross-tenant retry 403 VET-AUTHZ-0001", async () => {
      const { service, labOrders } = makeService();
      labOrders.setOrder(makeOrder());
      const exp = await service.exportOrder(
        TENANT_A,
        LAB_ORDER_ID,
        makeExportInput({ idempotencyKey: "k-fail", simulateFailure: true }),
        VET_A,
      );
      await expect(
        service.retryExport(TENANT_A, exp.id, STAFF_B),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // LAB_ORDER_ID_OTHER_TENANT unused but reserved for future cross-tenant test
  // ---------------------------------------------------------------------------
  it.skip("placeholder: diğer tenant'a ait order export edilemez (stub eksik)", () => {
    // İleride StubLabOrdersService'e multi-tenant order desteği
    // eklenirse bu test ile doğrulanabilir.
    expect(LAB_ORDER_ID_OTHER_TENANT).toBeDefined();
  });
});
