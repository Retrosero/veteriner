/**
 * @file SurgeryPlansService unit testleri.
 * @module apps/api/modules/surgery-plans/surgery-plans.service.spec
 *
 * @description GOAL-080 ameliyat planlama service testleri.
 *   - createPlan (gelecekteki scheduledAt zorunlu; 422
 *     VET-SURGERY-0006).
 *   - startPlan / completePlan (scheduled → in_progress →
 *     completed).
 *   - cancelPlan (scheduled/in_progress → cancelled;
 *     completed iptal edilemez 409 VET-SURGERY-0007).
 *   - updatePlan (yalnızca scheduled durumda).
 *   - Cross-tenant IDOR → null; cross-tenant create 403.
 *
 * @since GOAL-080 (FAZ-8) ameliyat planlama core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { SurgeryPlansRepository } from "./surgery-plans.repository.js";
import { SurgeryPlansService } from "./surgery-plans.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type {
  SurgeryPlanCancelInput,
  SurgeryPlanCreateInput,
  SurgeryPlanUpdateInput,
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
const PATIENT_B = "00000000-0000-0000-0000-000000000002";
const SURGEON_A = "usr-surgeon-1";

function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString();
}

function makeCreateInput(
  overrides: Partial<SurgeryPlanCreateInput> = {},
): SurgeryPlanCreateInput {
  return {
    patientId: PATIENT_A,
    leadSurgeonUserId: SURGEON_A,
    operationType: "ovariohysterectomy",
    scheduledAt: futureDate(7),
    ...overrides,
  };
}

describe("SurgeryPlansService", () => {
  let service: SurgeryPlansService;
  let repo: SurgeryPlansRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new SurgeryPlansRepository();
    audit = makeAudit();
    service = new SurgeryPlansService(repo, audit);
  });

  // ---------------------------------------------------------------------------
  // createPlan
  // ---------------------------------------------------------------------------

  describe("createPlan", () => {
    it("yeni plan oluşturur (scheduled)", async () => {
      const out = await service.createPlan(TENANT_A, makeCreateInput(), VET_A);
      expect(out.id).toMatch(/^sg-/);
      expect(out.status).toBe("scheduled");
      expect(out.operationType).toBe("ovariohysterectomy");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:surgery_plan.create",
        "surgery_plan",
        out.id,
        "create",
        expect.anything(),
        "info",
        expect.anything(),
      );
    });

    it("scheduledAt geçmişte → 422 VET-SURGERY-0006", async () => {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      await expect(
        service.createPlan(
          TENANT_A,
          makeCreateInput({ scheduledAt: past.toISOString() }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SURGERY-0006",
        httpStatus: 422,
      });
    });

    it("scheduledAt şimdi → 422 VET-SURGERY-0006 (gelecekte olmalı)", async () => {
      const now = new Date();
      await expect(
        service.createPlan(
          TENANT_A,
          makeCreateInput({ scheduledAt: now.toISOString() }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SURGERY-0006",
        httpStatus: 422,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // startPlan / completePlan
  // ---------------------------------------------------------------------------

  describe("startPlan", () => {
    it("scheduled → in_progress", async () => {
      const created = await service.createPlan(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      const started = await service.startPlan(TENANT_A, created.id, VET_A);
      expect(started.status).toBe("in_progress");
      expect(started.startedAt).not.toBeNull();
      expect(started.startedBy).toBe("usr-vet-a");
    });

    it("in_progress tekrar başlatılamaz 409 VET-SURGERY-0004", async () => {
      const created = await service.createPlan(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      await service.startPlan(TENANT_A, created.id, VET_A);
      await expect(
        service.startPlan(TENANT_A, created.id, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-SURGERY-0004",
        httpStatus: 409,
      });
    });
  });

  describe("completePlan", () => {
    it("in_progress → completed", async () => {
      const created = await service.createPlan(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      await service.startPlan(TENANT_A, created.id, VET_A);
      const completed = await service.completePlan(TENANT_A, created.id, VET_A);
      expect(completed.status).toBe("completed");
      expect(completed.completedAt).not.toBeNull();
      expect(completed.completedBy).toBe("usr-vet-a");
    });

    it("scheduled doğrudan tamamlanamaz 409 VET-SURGERY-0005", async () => {
      const created = await service.createPlan(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      await expect(
        service.completePlan(TENANT_A, created.id, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-SURGERY-0005",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // cancelPlan
  // ---------------------------------------------------------------------------

  describe("cancelPlan", () => {
    it("scheduled → cancelled", async () => {
      const created = await service.createPlan(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      const cancelled = await service.cancelPlan(
        TENANT_A,
        created.id,
        { reason: "iptal" } as SurgeryPlanCancelInput,
        VET_A,
      );
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelReason).toBe("iptal");
    });

    it("in_progress → cancelled", async () => {
      const created = await service.createPlan(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      await service.startPlan(TENANT_A, created.id, VET_A);
      const cancelled = await service.cancelPlan(
        TENANT_A,
        created.id,
        { reason: "komplikasyon" } as SurgeryPlanCancelInput,
        VET_A,
      );
      expect(cancelled.status).toBe("cancelled");
    });

    it("completed iptal edilemez 409 VET-SURGERY-0007", async () => {
      const created = await service.createPlan(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      await service.startPlan(TENANT_A, created.id, VET_A);
      await service.completePlan(TENANT_A, created.id, VET_A);
      await expect(
        service.cancelPlan(
          TENANT_A,
          created.id,
          { reason: "x" } as SurgeryPlanCancelInput,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SURGERY-0007",
        httpStatus: 409,
      });
    });

    it("zaten iptal edilmiş → 409 VET-SURGERY-0003", async () => {
      const created = await service.createPlan(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      await service.cancelPlan(
        TENANT_A,
        created.id,
        { reason: "ilk" } as SurgeryPlanCancelInput,
        VET_A,
      );
      await expect(
        service.cancelPlan(
          TENANT_A,
          created.id,
          { reason: "ikinci" } as SurgeryPlanCancelInput,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SURGERY-0003",
        httpStatus: 409,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // updatePlan
  // ---------------------------------------------------------------------------

  describe("updatePlan", () => {
    it("scheduled durumda notes günceller", async () => {
      const created = await service.createPlan(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      const updated = await service.updatePlan(
        TENANT_A,
        created.id,
        { notes: "ön hazırlık tamamlandı" } as SurgeryPlanUpdateInput,
        VET_A,
      );
      expect(updated.notes).toBe("ön hazırlık tamamlandı");
    });

    it("in_progress durumda güncellenemez 409 VET-SURGERY-0002", async () => {
      const created = await service.createPlan(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      await service.startPlan(TENANT_A, created.id, VET_A);
      await expect(
        service.updatePlan(
          TENANT_A,
          created.id,
          { notes: "x" } as SurgeryPlanUpdateInput,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SURGERY-0002",
        httpStatus: 409,
      });
    });

    it("olmayan plan → 404 VET-SURGERY-0001", async () => {
      await expect(
        service.updatePlan(
          TENANT_A,
          "00000000-0000-0000-0000-000000000000",
          { notes: "x" } as SurgeryPlanUpdateInput,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-SURGERY-0001",
        httpStatus: 404,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // listPlans / getPlanDetail
  // ---------------------------------------------------------------------------

  describe("listPlans", () => {
    it("status filtresi çalışır", async () => {
      await service.createPlan(
        TENANT_A,
        makeCreateInput({ patientId: PATIENT_A }),
        VET_A,
      );
      await service.createPlan(
        TENANT_A,
        makeCreateInput({
          patientId: PATIENT_B,
          scheduledAt: futureDate(14),
        }),
        VET_A,
      );
      const list = await service.listPlans(
        TENANT_A,
        { status: "scheduled", limit: 50, offset: 0 },
        VET_A,
      );
      expect(list.total).toBe(2);
    });
  });

  describe("getPlanDetail", () => {
    it("cross-tenant IDOR → null", async () => {
      const created = await service.createPlan(
        TENANT_A,
        makeCreateInput(),
        VET_A,
      );
      const detail = await service.getPlanDetail(TENANT_B, created.id, STAFF_B);
      expect(detail).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Tenant izolasyonu
  // ---------------------------------------------------------------------------

  describe("tenant izolasyonu", () => {
    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      await expect(
        service.createPlan(TENANT_B, makeCreateInput(), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
