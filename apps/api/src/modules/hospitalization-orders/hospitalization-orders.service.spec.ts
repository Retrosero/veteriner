/**
 * @file HospitalizationOrdersService unit testleri.
 * @module apps/api/modules/hospitalization-orders/hospitalization-orders.service.spec
 *
 * @description GOAL-085 yatış order + schedule service testleri.
 *   - createOrder: yatış discharged/cancelled değilse 422.
 *   - addSchedule: yalnızca active order (409).
 *   - applySchedule / skipSchedule: pending → applied/skipped.
 *   - cancelOrder: active → cancelled; endsAt set.
 *   - Cross-tenant IDOR → null/404; cross-tenant create 403.
 *
 * @since GOAL-085 (FAZ-8) yatış order ve uygulama kayıtları core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

import { HospitalizationOrdersService } from "./hospitalization-orders.service.js";
import { HospitalizationOrdersRepository } from "./hospitalization-orders.repository.js";
import { HospitalizationService } from "../hospitalization/hospitalization.service.js";
import { HospitalizationRepository } from "../hospitalization/hospitalization.repository.js";
import type {
  HospitalizationOrderApplyInput,
  HospitalizationOrderCancelInput,
  HospitalizationOrderCreateInput,
  HospitalizationOrderScheduleCreateInput,
  HospitalizationOrderSkipInput,
  HospitalizationOrderUpdateInput,
} from "@vetniva/contracts";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const VET_A: ActorContext = {
  actorId: "usr-vet-a",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-1",
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
const PATIENT_B = "00000000-0000-0000-0000-000000000002";

function isoNow(): string {
  return new Date().toISOString();
}

function isoOffset(minutes: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function makeOrderInput(
  overrides: Partial<HospitalizationOrderCreateInput> = {},
): HospitalizationOrderCreateInput {
  return {
    hospitalizationId: "hos-1",
    orderType: "medication",
    instructions: "200mg Amoxicillin PO",
    priority: "medium",
    ...overrides,
  };
}

function makeUpdateInput(
  overrides: Partial<HospitalizationOrderUpdateInput> = {},
): HospitalizationOrderUpdateInput {
  return { instructions: "yeni talimat", ...overrides };
}

function makeCancelInput(
  overrides: Partial<HospitalizationOrderCancelInput> = {},
): HospitalizationOrderCancelInput {
  return { reason: "yan etki", ...overrides };
}

function makeScheduleInput(
  overrides: Partial<HospitalizationOrderScheduleCreateInput> = {},
): HospitalizationOrderScheduleCreateInput {
  return { scheduledFor: isoOffset(60), ...overrides };
}

function makeApplyInput(
  overrides: Partial<HospitalizationOrderApplyInput> = {},
): HospitalizationOrderApplyInput {
  return { ...overrides };
}

function makeSkipInput(
  overrides: Partial<HospitalizationOrderSkipInput> = {},
): HospitalizationOrderSkipInput {
  return { reason: "yemek yemedi", ...overrides };
}

describe("HospitalizationOrdersService", () => {
  let service: HospitalizationOrdersService;
  let repo: HospitalizationOrdersRepository;
  let hospService: HospitalizationService;
  let hospRepo: HospitalizationRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new HospitalizationOrdersRepository();
    hospRepo = new HospitalizationRepository();
    audit = makeAudit();
    hospService = new HospitalizationService(hospRepo, audit);
    service = new HospitalizationOrdersService(repo, hospService, audit);
  });

  /** Yatış oluşturup id döner (active). */
  async function makeHosp(
    patientId: string = PATIENT_A,
  ): Promise<string> {
    const h = await hospService.createHospitalization(
      TENANT_A,
      { patientId },
      VET_A,
    );
    await hospService.admitHospitalization(
      TENANT_A,
      h.id,
      {},
      VET_A,
    );
    return h.id;
  }

  // -------------------------------------------------------------------------
  // createOrder
  // -------------------------------------------------------------------------

  describe("createOrder", () => {
    it("active yatış için order oluşturur", async () => {
      const hospId = await makeHosp();
      const out = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      expect(out.id).toMatch(/^hor-/);
      expect(out.status).toBe("active");
      expect(out.orderType).toBe("medication");
    });

    it("planlanmış (planned) yatış için order açılabilir", async () => {
      const h = await hospService.createHospitalization(
        TENANT_A,
        { patientId: PATIENT_B },
        VET_A,
      );
      // henüz admit edilmedi
      const out = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: h.id }),
        VET_A,
      );
      expect(out.status).toBe("active");
    });

    it("discharged yatış 422 VET-HORD-0003", async () => {
      const hospId = await makeHosp();
      await hospService.dischargeHospitalization(
        TENANT_A,
        hospId,
        { reason: "iyileşti" },
        VET_A,
      );
      await expect(
        service.createOrder(
          TENANT_A,
          makeOrderInput({ hospitalizationId: hospId }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-HORD-0003",
        httpStatus: 422,
      });
    });

    it("olmayan yatış 404 VET-HORD-0001", async () => {
      await expect(
        service.createOrder(
          TENANT_A,
          makeOrderInput({ hospitalizationId: "hos-not-exist" }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-HORD-0001",
        httpStatus: 404,
      });
    });

    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      // STAFF_A (TENANT_A) → TENANT_B
      await expect(
        service.createOrder(TENANT_B, makeOrderInput(), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });

  // -------------------------------------------------------------------------
  // updateOrder / cancelOrder
  // -------------------------------------------------------------------------

  describe("updateOrder", () => {
    it("active order günceller", async () => {
      const hospId = await makeHosp();
      const order = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      const out = await service.updateOrder(
        TENANT_A,
        order.id,
        makeUpdateInput(),
        VET_A,
      );
      expect(out.instructions).toBe("yeni talimat");
    });
  });

  describe("cancelOrder", () => {
    it("active → cancelled; endsAt set", async () => {
      const hospId = await makeHosp();
      const order = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      const out = await service.cancelOrder(
        TENANT_A,
        order.id,
        makeCancelInput(),
        VET_A,
      );
      expect(out.status).toBe("cancelled");
      expect(out.cancelledAt).not.toBeNull();
      expect(out.cancelledBy).toBe("usr-vet-a");
      expect(out.endsAt).not.toBeNull();
    });

    it("cancelled order tekrar iptal 409 VET-HORD-0005", async () => {
      const hospId = await makeHosp();
      const order = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      await service.cancelOrder(
        TENANT_A,
        order.id,
        makeCancelInput(),
        VET_A,
      );
      await expect(
        service.cancelOrder(
          TENANT_A,
          order.id,
          makeCancelInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-HORD-0005",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Schedule
  // -------------------------------------------------------------------------

  describe("addSchedule", () => {
    it("active order'a schedule ekler", async () => {
      const hospId = await makeHosp();
      const order = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      const s = await service.addSchedule(
        TENANT_A,
        order.id,
        makeScheduleInput(),
        VET_A,
      );
      expect(s.orderId).toBe(order.id);
      expect(s.scheduledFor).toBeDefined();
      expect(s.appliedAt).toBeNull();
      expect(s.skippedAt).toBeNull();
    });

    it("cancelled order'a schedule 409 VET-HORD-0004", async () => {
      const hospId = await makeHosp();
      const order = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      await service.cancelOrder(
        TENANT_A,
        order.id,
        makeCancelInput(),
        VET_A,
      );
      await expect(
        service.addSchedule(
          TENANT_A,
          order.id,
          makeScheduleInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-HORD-0004",
        httpStatus: 409,
      });
    });
  });

  describe("applySchedule", () => {
    it("pending → applied", async () => {
      const hospId = await makeHosp();
      const order = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      const s = await service.addSchedule(
        TENANT_A,
        order.id,
        makeScheduleInput(),
        VET_A,
      );
      const applied = await service.applySchedule(
        TENANT_A,
        s.id,
        makeApplyInput(),
        VET_A,
      );
      expect(applied.appliedAt).not.toBeNull();
      expect(applied.appliedByUserId).toBe("usr-vet-a");
    });

    it("zaten applied 409 VET-HORD-0007", async () => {
      const hospId = await makeHosp();
      const order = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      const s = await service.addSchedule(
        TENANT_A,
        order.id,
        makeScheduleInput(),
        VET_A,
      );
      await service.applySchedule(
        TENANT_A,
        s.id,
        makeApplyInput(),
        VET_A,
      );
      await expect(
        service.applySchedule(
          TENANT_A,
          s.id,
          makeApplyInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-HORD-0007",
        httpStatus: 409,
      });
    });
  });

  describe("skipSchedule", () => {
    it("pending → skipped; reason set", async () => {
      const hospId = await makeHosp();
      const order = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      const s = await service.addSchedule(
        TENANT_A,
        order.id,
        makeScheduleInput(),
        VET_A,
      );
      const skipped = await service.skipSchedule(
        TENANT_A,
        s.id,
        makeSkipInput(),
        VET_A,
      );
      expect(skipped.skippedAt).not.toBeNull();
      expect(skipped.skipReason).toBe("yemek yemedi");
    });

    it("zaten skipped 409 VET-HORD-0007", async () => {
      const hospId = await makeHosp();
      const order = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      const s = await service.addSchedule(
        TENANT_A,
        order.id,
        makeScheduleInput(),
        VET_A,
      );
      await service.skipSchedule(
        TENANT_A,
        s.id,
        makeSkipInput(),
        VET_A,
      );
      await expect(
        service.skipSchedule(
          TENANT_A,
          s.id,
          makeSkipInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-HORD-0007",
        httpStatus: 409,
      });
    });

    it("skipped sonra apply 409 VET-HORD-0007", async () => {
      const hospId = await makeHosp();
      const order = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      const s = await service.addSchedule(
        TENANT_A,
        order.id,
        makeScheduleInput(),
        VET_A,
      );
      await service.skipSchedule(
        TENANT_A,
        s.id,
        makeSkipInput(),
        VET_A,
      );
      await expect(
        service.applySchedule(
          TENANT_A,
          s.id,
          makeApplyInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-HORD-0007",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // listSchedules (overdue filter)
  // -------------------------------------------------------------------------

  describe("listSchedules (overdue)", () => {
    it("overdue filtresi geçmiş pending schedule'ları döner", async () => {
      const hospId = await makeHosp();
      const order = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      // Pending geçmiş: scheduledFor = -60 min
      await service.addSchedule(
        TENANT_A,
        order.id,
        makeScheduleInput({ scheduledFor: isoOffset(-60) }),
        VET_A,
      );
      // Pending gelecek: scheduledFor = +60 min
      await service.addSchedule(
        TENANT_A,
        order.id,
        makeScheduleInput({ scheduledFor: isoOffset(60) }),
        VET_A,
      );

      const result = await service.listSchedules(
        TENANT_A,
        { status: "overdue", asOf: isoNow(), limit: 50, offset: 0 },
        VET_A,
      );
      expect(result.total).toBe(1);
    });

    it("status pending filtresi tüm pending'leri döner", async () => {
      const hospId = await makeHosp();
      const order = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      await service.addSchedule(
        TENANT_A,
        order.id,
        makeScheduleInput(),
        VET_A,
      );
      const result = await service.listSchedules(
        TENANT_A,
        { status: "pending", limit: 50, offset: 0 },
        VET_A,
      );
      expect(result.total).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // getOrderDetail
  // -------------------------------------------------------------------------

  describe("getOrderDetail", () => {
    it("order + schedules döner", async () => {
      const hospId = await makeHosp();
      const order = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      await service.addSchedule(
        TENANT_A,
        order.id,
        makeScheduleInput(),
        VET_A,
      );
      const detail = await service.getOrderDetail(
        TENANT_A,
        order.id,
        VET_A,
      );
      expect(detail).not.toBeNull();
      expect(detail!.order.id).toBe(order.id);
      expect(detail!.schedules.length).toBe(1);
    });

    it("cross-tenant getDetail → null", async () => {
      const hospId = await makeHosp();
      const order = await service.createOrder(
        TENANT_A,
        makeOrderInput({ hospitalizationId: hospId }),
        VET_A,
      );
      // STAFF_A (TENANT_A) → TENANT_B (tenant scope fires first → 403)
      await expect(
        service.getOrderDetail(TENANT_B, order.id, STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });
});
