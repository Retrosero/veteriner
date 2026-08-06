/**
 * @file LabResultsService unit testleri.
 * @module apps/api/modules/lab-results/lab-results.service.spec
 *
 * @description GOAL-092 laboratuvar sonucu service testleri.
 *   - createLabResult (taslak + audit; order state guard).
 *   - updateLabResult (draft only).
 *   - submitForReview / approveLabResult (state machine).
 *   - amendLabResult (approved → amended + yeni draft revision).
 *   - getLabResultDetail / listLabResultRevisions.
 *   - Cross-tenant IDOR / create 403.
 *
 * @since GOAL-092 (FAZ-9) laboratuvar sonuçları core
 */

import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { LabResultsService } from "./lab-results.service.js";
import { type LabOrdersService } from "../lab-orders/lab-orders.service.js";

import type {
  LabResultInsertInput,
  LabResultPatch,
  LabResultsRepository,
} from "./lab-results.repository.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { LabResultRecord } from "../../common/lab-results/lab-result.types.js";
import type {
  LabOrder,
  LabResultAmendInput,
  LabResultApproveInput,
  LabResultCreateInput,
  LabResultSubmitInput,
  LabResultUpdateInput,
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

const VET_A: ActorContext = {
  actorId: "usr-vet-a",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-2",
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
  correlationId: "req-3",
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
const VET_USER_ID = "00000000-0000-0000-0000-000000000020";

/**
 * Stub LabOrdersService — service'in ihtiyaç duyduğu tek metot
 * `getLabOrderDetail`. Diğer metotlar no-op.
 */
class StubLabOrdersService {
  private readonly byId = new Map<string, LabOrder>();
  private readonly counters = new Map<string, number>();

  public addOrder(order: LabOrder): void {
    this.byId.set(order.id, order);
  }

  public setOrderStatus(
    tenantId: string,
    id: string,
    status: LabOrder["status"],
  ): void {
    const o = this.byId.get(id);
    if (!o) return;
    this.byId.set(id, { ...o, status, updatedAt: new Date().toISOString() });
  }

  public nextId(tenantId: string): string {
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `lo-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public async getLabOrderDetail(
    tenantId: string,
    id: string,
    _actor: ActorContext,
  ): Promise<LabOrder | null> {
    const o = this.byId.get(id);
    if (!o || o.tenantId !== tenantId) return null;
    return o;
  }

  /** Spec'in ihtiyaç duymadığı diğer metotlar no-op. */
  public async createLabOrder(): Promise<LabOrder> {
    throw new Error("not implemented in stub");
  }
  public async listLabOrders(): Promise<{
    items: LabOrder[];
    total: number;
  }> {
    return { items: [], total: 0 };
  }
  public async collectSample(): Promise<LabOrder> {
    throw new Error("not implemented in stub");
  }
  public async startProcessing(): Promise<LabOrder> {
    throw new Error("not implemented in stub");
  }
  public async completeLabOrder(): Promise<LabOrder> {
    throw new Error("not implemented in stub");
  }
  public async cancelLabOrder(): Promise<LabOrder> {
    throw new Error("not implemented in stub");
  }
}

function makeOrder(overrides: Partial<LabOrder> = {}): LabOrder {
  return {
    id: "lo-aaaa1111-000001",
    tenantId: TENANT_A,
    patientId: PATIENT_A,
    labTestId: LAB_TEST_ID,
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
    collectedAt: "2026-01-15T10:00:00.000Z",
    collectedByUserId: VET_USER_ID,
    sampleQuality: "ok",
    processingStartedAt: "2026-01-15T10:30:00.000Z",
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    notes: null,
    createdAt: "2026-01-15T09:00:00.000Z",
    createdBy: STAFF_A.actorId ?? "system",
    updatedAt: "2026-01-15T10:30:00.000Z",
    ...overrides,
  };
}

function makeCreateInput(
  overrides: Partial<LabResultCreateInput> = {},
): LabResultCreateInput {
  return {
    value: "12.5",
    valueNumeric: "12.5000",
    abnormalFlag: "normal",
    ...overrides,
  };
}

/**
 * W1.2c: Service testlerini DB'den izole etmek için stateful test double.
 * Production'da `LabResultsRepository` PrismaService ile çalışır; burada
 * aynı sözleşmeyi sağlayan in-memory bir uygulama kullanılır.
 */
class LabResultsRepositoryTestDouble {
  private readonly byId = new Map<string, LabResultRecord>();

  public async findById(
    tenantId: string,
    id: string,
  ): Promise<LabResultRecord | null> {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public async insert(input: LabResultInsertInput): Promise<LabResultRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: LabResultRecord = {
      id,
      tenantId: input.tenantId,
      labOrderId: input.labOrderId,
      revision: input.revision,
      value: input.value,
      valueNumeric: input.valueNumeric,
      unit: input.unit,
      referenceRange: input.referenceRange,
      abnormalFlag: input.abnormalFlag,
      status: "draft",
      attachments: input.attachments,
      notes: input.notes,
      enteredBy: input.enteredBy,
      enteredAt: now,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      amendsResultId: input.amendsResultId,
      amendmentReason: input.amendmentReason,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(id, record);
    return record;
  }

  public async update(
    tenantId: string,
    id: string,
    patch: LabResultPatch,
  ): Promise<LabResultRecord | null> {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    const toIso = (v: string | Date | null | undefined): string | null => {
      if (v === null || v === undefined) return null;
      return v instanceof Date ? v.toISOString() : v;
    };
    if (patch.value !== undefined) rec.value = patch.value;
    if (patch.valueNumeric !== undefined) rec.valueNumeric = patch.valueNumeric;
    if (patch.abnormalFlag !== undefined) rec.abnormalFlag = patch.abnormalFlag;
    if (patch.attachments !== undefined) rec.attachments = patch.attachments;
    if (patch.notes !== undefined) rec.notes = patch.notes;
    if (patch.status !== undefined) rec.status = patch.status;
    if (patch.reviewedBy !== undefined) rec.reviewedBy = patch.reviewedBy;
    if (patch.reviewedAt !== undefined)
      rec.reviewedAt = toIso(patch.reviewedAt);
    if (patch.reviewNotes !== undefined) rec.reviewNotes = patch.reviewNotes;
    if (patch.amendmentReason !== undefined)
      rec.amendmentReason = patch.amendmentReason;
    rec.updatedAt = new Date().toISOString();
    return rec;
  }

  public async listByOrder(
    tenantId: string,
    labOrderId: string,
  ): Promise<LabResultRecord[]> {
    const out: LabResultRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId === tenantId && rec.labOrderId === labOrderId) {
        out.push(rec);
      }
    }
    out.sort((a, b) => b.revision - a.revision);
    return out;
  }

  public async findActiveByOrder(
    tenantId: string,
    labOrderId: string,
  ): Promise<LabResultRecord | null> {
    for (const rec of await this.listByOrder(tenantId, labOrderId)) {
      if (rec.status !== "amended") return rec;
    }
    return null;
  }

  public async nextRevision(
    tenantId: string,
    labOrderId: string,
  ): Promise<number> {
    const all = await this.listByOrder(tenantId, labOrderId);
    if (all.length === 0) return 1;
    return Math.max(...all.map((r) => r.revision)) + 1;
  }
}

describe("LabResultsService", () => {
  let service: LabResultsService;
  let repo: LabResultsRepository;
  let audit: AuditService;
  let labOrders: StubLabOrdersService;

  beforeEach(() => {
    repo =
      new LabResultsRepositoryTestDouble() as unknown as LabResultsRepository;
    audit = makeAudit();
    labOrders = new StubLabOrdersService();
    service = new LabResultsService(
      repo,
      labOrders as unknown as LabOrdersService,
      audit,
    );
  });

  // ---------------------------------------------------------------------------
  // createLabResult
  // ---------------------------------------------------------------------------

  describe("createLabResult", () => {
    it("processing order için taslak oluşturur + audit", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      const out = await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      expect(out.status).toBe("draft");
      expect(out.revision).toBe(1);
      expect(out.value).toBe("12.5");
      expect(out.valueNumeric).toBe("12.5000");
      expect(out.unit).toBe("10^3/µL");
      expect(out.referenceRange).toBe("5.0-15.0");
      expect(out.enteredBy).toBe(VET_A.actorId);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:labresult.create",
        "labresult",
        out.id,
        "create",
        expect.anything(),
        "info",
        expect.objectContaining({ labOrderId: order.id }),
      );
    });

    it("completed order için de sonuç girilebilir", async () => {
      const order = makeOrder({ status: "completed" });
      labOrders.addOrder(order);
      const out = await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      expect(out.status).toBe("draft");
    });

    it("abnormalFlag default 'normal'", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      const out = await service.createLabResult(
        TENANT_A,
        order.id,
        { value: "100" } as LabResultCreateInput,
        VET_A,
      );
      expect(out.abnormalFlag).toBe("normal");
    });

    it("attachments array default []", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      const out = await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      expect(out.attachments).toEqual([]);
    });

    it("ordered (henüz processing değil) order'a create 422 VET-LABRES-0004", async () => {
      const order = makeOrder({ status: "ordered" });
      labOrders.addOrder(order);
      await expect(
        service.createLabResult(TENANT_A, order.id, makeCreateInput(), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-LABRES-0004",
        httpStatus: 422,
      });
    });

    it("collected order'a create 422 VET-LABRES-0004", async () => {
      const order = makeOrder({ status: "collected" });
      labOrders.addOrder(order);
      await expect(
        service.createLabResult(TENANT_A, order.id, makeCreateInput(), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-LABRES-0004",
      });
    });

    it("cancelled order'a create 422 VET-LABRES-0005", async () => {
      const order = makeOrder({ status: "cancelled" });
      labOrders.addOrder(order);
      await expect(
        service.createLabResult(TENANT_A, order.id, makeCreateInput(), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-LABRES-0005",
        httpStatus: 422,
      });
    });

    it("order bulunamadı 404 VET-LABRES-0001", async () => {
      await expect(
        service.createLabResult(
          TENANT_A,
          "00000000-0000-0000-0000-000000000999",
          makeCreateInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABRES-0001",
        httpStatus: 404,
      });
    });

    it("mevcut aktif sonuç 409 VET-LABRES-0003", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      await expect(
        service.createLabResult(TENANT_A, order.id, makeCreateInput(), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-LABRES-0003",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // updateLabResult (draft only)
  // ---------------------------------------------------------------------------

  describe("updateLabResult", () => {
    it("draft kısmi güncelleme", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      const created = await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      const updated = await service.updateLabResult(
        TENANT_A,
        order.id,
        {
          value: "13.0",
          abnormalFlag: "high",
        } as LabResultUpdateInput,
        VET_A,
      );
      expect(updated.value).toBe("13.0");
      expect(updated.abnormalFlag).toBe("high");
      expect(updated.id).toBe(created.id);
    });

    it("pending_review 409", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      await service.submitForReview(
        TENANT_A,
        order.id,
        {} as LabResultSubmitInput,
        VET_A,
      );
      await expect(
        service.updateLabResult(
          TENANT_A,
          order.id,
          { value: "x" } as LabResultUpdateInput,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABRES-0002",
        httpStatus: 409,
      });
    });

    it("approved 409", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      await service.submitForReview(
        TENANT_A,
        order.id,
        {} as LabResultSubmitInput,
        VET_A,
      );
      await service.approveLabResult(
        TENANT_A,
        order.id,
        {} as LabResultApproveInput,
        VET_A,
      );
      await expect(
        service.updateLabResult(
          TENANT_A,
          order.id,
          { value: "x" } as LabResultUpdateInput,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABRES-0002",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // submitForReview
  // ---------------------------------------------------------------------------

  describe("submitForReview", () => {
    it("draft → pending_review", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      const out = await service.submitForReview(
        TENANT_A,
        order.id,
        {} as LabResultSubmitInput,
        VET_A,
      );
      expect(out.status).toBe("pending_review");
    });

    it("approved iken submit 409", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      await service.submitForReview(
        TENANT_A,
        order.id,
        {} as LabResultSubmitInput,
        VET_A,
      );
      await service.approveLabResult(
        TENANT_A,
        order.id,
        {} as LabResultApproveInput,
        VET_A,
      );
      await expect(
        service.submitForReview(
          TENANT_A,
          order.id,
          {} as LabResultSubmitInput,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABRES-0002",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // approveLabResult
  // ---------------------------------------------------------------------------

  describe("approveLabResult", () => {
    it("pending_review → approved + reviewedBy/At set", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      await service.submitForReview(
        TENANT_A,
        order.id,
        {} as LabResultSubmitInput,
        VET_A,
      );
      const out = await service.approveLabResult(
        TENANT_A,
        order.id,
        { reviewNotes: "uygun" } as LabResultApproveInput,
        VET_A,
      );
      expect(out.status).toBe("approved");
      expect(out.reviewedBy).toBe(VET_A.actorId);
      expect(out.reviewedAt).not.toBeNull();
      expect(out.reviewNotes).toBe("uygun");
    });

    it("draft approve 409", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      await expect(
        service.approveLabResult(
          TENANT_A,
          order.id,
          {} as LabResultApproveInput,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABRES-0002",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // amendLabResult
  // ---------------------------------------------------------------------------

  describe("amendLabResult", () => {
    it("approved → amended (eski) + yeni draft revision 2", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      const original = await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput({ value: "12.5" }),
        VET_A,
      );
      await service.submitForReview(
        TENANT_A,
        order.id,
        {} as LabResultSubmitInput,
        VET_A,
      );
      await service.approveLabResult(
        TENANT_A,
        order.id,
        {} as LabResultApproveInput,
        VET_A,
      );
      const newRev = await service.amendLabResult(
        TENANT_A,
        order.id,
        {
          reason: "sayısal hata",
          value: "13.0",
          valueNumeric: "13.0000",
        } as LabResultAmendInput,
        VET_A,
      );
      expect(newRev.revision).toBe(2);
      expect(newRev.status).toBe("draft");
      expect(newRev.amendsResultId).toBe(original.id);
      expect(newRev.amendmentReason).toBe("sayısal hata");
      // Eski kayıt amended olmuş olmalı
      const all = await service.listLabResultRevisions(
        TENANT_A,
        order.id,
        VET_A,
      );
      expect(all.total).toBe(2);
      const amended = all.items.find((r) => r.id === original.id);
      expect(amended?.status).toBe("amended");
    });

    it("pending_review amend 409", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      await service.submitForReview(
        TENANT_A,
        order.id,
        {} as LabResultSubmitInput,
        VET_A,
      );
      await expect(
        service.amendLabResult(
          TENANT_A,
          order.id,
          {
            reason: "x",
            value: "1.0",
          } as LabResultAmendInput,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABRES-0002",
      });
    });

    it("draft amend 409", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      await expect(
        service.amendLabResult(
          TENANT_A,
          order.id,
          {
            reason: "x",
            value: "1.0",
          } as LabResultAmendInput,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-LABRES-0002",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getLabResultDetail / listLabResultRevisions
  // ---------------------------------------------------------------------------

  describe("getLabResultDetail", () => {
    it("aktif sonucu döner", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      const created = await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      const got = await service.getLabResultDetail(TENANT_A, order.id, VET_A);
      expect(got?.id).toBe(created.id);
    });

    it("cross-tenant IDOR → null", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      const got = await service.getLabResultDetail(TENANT_B, order.id, STAFF_B);
      expect(got).toBeNull();
    });
  });

  describe("listLabResultRevisions", () => {
    it("amendment sonrası 2 revizyon", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      await service.createLabResult(
        TENANT_A,
        order.id,
        makeCreateInput(),
        VET_A,
      );
      await service.submitForReview(
        TENANT_A,
        order.id,
        {} as LabResultSubmitInput,
        VET_A,
      );
      await service.approveLabResult(
        TENANT_A,
        order.id,
        {} as LabResultApproveInput,
        VET_A,
      );
      await service.amendLabResult(
        TENANT_A,
        order.id,
        {
          reason: "düzeltme",
          value: "13.0",
        } as LabResultAmendInput,
        VET_A,
      );
      const all = await service.listLabResultRevisions(
        TENANT_A,
        order.id,
        VET_A,
      );
      expect(all.total).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      const order = makeOrder();
      labOrders.addOrder(order);
      await expect(
        service.createLabResult(TENANT_B, order.id, makeCreateInput(), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
