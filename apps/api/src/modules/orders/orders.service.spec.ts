/**
 * @file OrdersService unit testleri.
 * @module apps/api/modules/orders/orders.service.spec
 *
 * @description Tedavi planı + klinik order iş kuralları: oluşturma,
 * tenant izolasyonu, yaşam döngüsü (pending → in_progress →
 * completed), iptal, tedavi planı görünümü, audit event yayını.
 * DB migration olmadığı için in-memory repo + mock
 * ExaminationsService kullanılır.
 *
 * @since GOAL-044 (FAZ-4) tedavi planı + klinik order core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrdersRepository } from "./orders.repository.js";
import { OrdersService } from "./orders.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { ExaminationsService } from "../examinations/examinations.service.js";
import type { Examination } from "@vetniva/contracts";

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

const _VET_B: ActorContext = {
  actorId: "usr-vet-b",
  actorType: "user",
  role: "VETERINARIAN",
  tenantId: TENANT_B,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-2",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const EXAM_ID_A = "exam-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EXAM_ID_B = "exam-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PATIENT_ID_A = "pat-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const VET_USER_ID_A = "vet-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** Mock examination store. */
const examStore = new Map<string, Examination>();
function seedExamination(tenantId: string, id: string): void {
  const e: Examination = {
    id,
    tenantId,
    patientId: PATIENT_ID_A,
    veterinarianId: VET_USER_ID_A,
    appointmentId: null,
    status: "in_progress",
    type: "consultation",
    chiefComplaint: "Halsizlik",
    startedAt: "2025-01-01T10:00:00.000Z",
    completedAt: null,
    signedAt: null,
    signedBy: null,
    createdAt: "2025-01-01T10:00:00.000Z",
    updatedAt: "2025-01-01T10:00:00.000Z",
  };
  examStore.set(`${tenantId}|${id}`, e);
}
function makeExaminations(): ExaminationsService {
  return {
    findById: vi
      .fn()
      .mockImplementation(
        async (tenantId: string, id: string) =>
          examStore.get(`${tenantId}|${id}`) ?? null,
      ),
  } as unknown as ExaminationsService;
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

function validInput(
  overrides: Partial<{
    examinationId: string;
    type:
      | "medication"
      | "application"
      | "procedure"
      | "lab"
      | "imaging"
      | "vaccination"
      | "follow_up"
      | "instruction";
    description: string;
    notes?: string;
    dueDate?: string;
  }> = {},
) {
  return {
    examinationId: EXAM_ID_A,
    type: "medication" as const,
    description: "Amoksisilin 500mg 2x1 7 gün",
    ...overrides,
  };
}

describe("OrdersService", () => {
  let service: OrdersService;
  let repo: OrdersRepository;
  let examinations: ExaminationsService;
  let audit: AuditService;

  beforeEach(() => {
    examStore.clear();
    seedExamination(TENANT_A, EXAM_ID_A);
    seedExamination(TENANT_B, EXAM_ID_B);
    repo = new OrdersRepository();
    examinations = makeExaminations();
    audit = makeAudit();
    service = new OrdersService(repo, examinations, audit);
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe("create", () => {
    it("başarı: status=pending + patientId examination'dan türetilir + audit.create (info)", async () => {
      const order = await service.create(TENANT_A, validInput(), VET_A);
      expect(order.id).toMatch(/^order-/);
      expect(order.tenantId).toBe(TENANT_A);
      expect(order.status).toBe("pending");
      expect(order.examinationId).toBe(EXAM_ID_A);
      expect(order.patientId).toBe(PATIENT_ID_A);
      expect(order.completedAt).toBeNull();
      expect(order.completedBy).toBeNull();
      expect(order.cancelledAt).toBeNull();
      expect(order.cancellationReason).toBeNull();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:order.create",
        "order",
        order.id,
        "create",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({ status: "pending" }),
      );
    });

    it("cross-tenant examination → 404 VET-CLINIC-0001 + audit yok", async () => {
      await expect(
        service.create(
          TENANT_A,
          validInput({ examinationId: EXAM_ID_B }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  describe("list", () => {
    beforeEach(async () => {
      await service.create(TENANT_A, validInput({ type: "medication" }), VET_A);
      await service.create(
        TENANT_A,
        validInput({ type: "vaccination", description: "Karma aşı" }),
        VET_A,
      );
    });

    it("type filtresi", async () => {
      const r = await service.list(
        TENANT_A,
        { type: "medication", limit: 20, offset: 0 },
        VET_A,
      );
      expect(r.total).toBe(1);
      expect(r.items[0]?.type).toBe("medication");
    });

    it("patientId filtresi yanlış eşleşme → 0", async () => {
      const r = await service.list(
        TENANT_A,
        { patientId: "pat-other", limit: 20, offset: 0 },
        VET_A,
      );
      expect(r.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // start
  // -------------------------------------------------------------------------

  describe("start", () => {
    it("status=in_progress + audit.update (info) action=start", async () => {
      const created = await service.create(TENANT_A, validInput(), VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();

      const started = await service.start(TENANT_A, created.id, VET_A);
      expect(started.status).toBe("in_progress");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:order.update",
        "order",
        created.id,
        "update",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({ action: "start" }),
      );
    });

    it("pending değilse → 409 VET-ORDER-0001", async () => {
      const created = await service.create(TENANT_A, validInput(), VET_A);
      await service.start(TENANT_A, created.id, VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await expect(
        service.start(TENANT_A, created.id, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-ORDER-0001",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // complete
  // -------------------------------------------------------------------------

  describe("complete", () => {
    it("status=completed + completedAt+completedBy set + audit.update (info) action=complete", async () => {
      const created = await service.create(TENANT_A, validInput(), VET_A);
      await service.start(TENANT_A, created.id, VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();

      const completed = await service.complete(TENANT_A, created.id, VET_A);
      expect(completed.status).toBe("completed");
      expect(completed.completedAt).toBeTruthy();
      expect(completed.completedBy).toBe("usr-vet-a");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:order.update",
        "order",
        created.id,
        "update",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({ action: "complete" }),
      );
    });

    it("in_progress değilse → 409 VET-ORDER-0001", async () => {
      const created = await service.create(TENANT_A, validInput(), VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await expect(
        service.complete(TENANT_A, created.id, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-ORDER-0001",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  describe("cancel", () => {
    it("status=cancelled + cancelledAt+cancellationReason set + audit.update (info) action=cancel", async () => {
      const created = await service.create(TENANT_A, validInput(), VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();

      const cancelled = await service.cancel(
        TENANT_A,
        created.id,
        { reason: "Hasta gelmedi" },
        VET_A,
      );
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelledAt).toBeTruthy();
      expect(cancelled.cancellationReason).toBe("Hasta gelmedi");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:order.update",
        "order",
        created.id,
        "update",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({ action: "cancel" }),
      );
    });

    it("tamamlanmış order iptal edilemez → 409 VET-ORDER-0001", async () => {
      const created = await service.create(TENANT_A, validInput(), VET_A);
      await service.start(TENANT_A, created.id, VET_A);
      await service.complete(TENANT_A, created.id, VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await expect(
        service.cancel(TENANT_A, created.id, { reason: "x" }, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-ORDER-0001",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // getTreatmentPlan
  // -------------------------------------------------------------------------

  describe("getTreatmentPlan", () => {
    it("aktif (pending+in_progress) vs tamamlanmış (completed+cancelled) ayrımı", async () => {
      // 1 pending
      await service.create(
        TENANT_A,
        validInput({ description: "İlaç A" }),
        VET_A,
      );
      // 2 completed (full lifecycle)
      const o2 = await service.create(
        TENANT_A,
        validInput({ description: "İlaç B" }),
        VET_A,
      );
      await service.start(TENANT_A, o2.id, VET_A);
      await service.complete(TENANT_A, o2.id, VET_A);
      // 3 cancelled
      const o3 = await service.create(
        TENANT_A,
        validInput({ description: "İlaç C" }),
        VET_A,
      );
      await service.cancel(TENANT_A, o3.id, { reason: "iptal" }, VET_A);
      // 4 in_progress
      const o4 = await service.create(
        TENANT_A,
        validInput({ description: "İlaç D" }),
        VET_A,
      );
      await service.start(TENANT_A, o4.id, VET_A);

      const plan = await service.getTreatmentPlan(
        TENANT_A,
        PATIENT_ID_A,
        VET_A,
      );
      expect(plan.patientId).toBe(PATIENT_ID_A);
      expect(plan.active).toHaveLength(2);
      expect(plan.completed).toHaveLength(2);
      const activeIds = plan.active.map((o) => o.description).sort();
      expect(activeIds).toEqual(["İlaç A", "İlaç D"]);
      const completedIds = plan.completed.map((o) => o.description).sort();
      expect(completedIds).toEqual(["İlaç B", "İlaç C"]);
    });
  });

  // -------------------------------------------------------------------------
  // audit — her event tetiklenir
  // -------------------------------------------------------------------------

  describe("audit", () => {
    it("create + start + complete + cancel her biri için ilgili audit event çağrılır", async () => {
      const o1 = await service.create(TENANT_A, validInput(), VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await service.start(TENANT_A, o1.id, VET_A);
      await service.complete(TENANT_A, o1.id, VET_A);

      const o2 = await service.create(TENANT_A, validInput(), VET_A);
      await service.cancel(TENANT_A, o2.id, { reason: "iptal" }, VET_A);

      const calls = (audit.recordSimple as ReturnType<typeof vi.fn>).mock
        .calls as unknown[][];
      const events = calls.map((call) =>
        typeof call[0] === "string" ? call[0] : null,
      );
      const actions = calls.map((call) =>
        typeof call[6] === "object" && call[6] !== null
          ? (call[6] as { action?: string }).action
          : undefined,
      );
      expect(events).toContain("audit:order.update");
      expect(actions).toContain("start");
      expect(actions).toContain("complete");
      expect(actions).toContain("cancel");
    });
  });

  // -------------------------------------------------------------------------
  // GOAL-044 yeni tipler — application, instruction
  // -------------------------------------------------------------------------

  describe("plan öğesi tipleri (GOAL-044)", () => {
    it("application (uygulama) order oluşturma + tamamlama", async () => {
      const o = await service.create(
        TENANT_A,
        validInput({ type: "application", description: "Pansuman 2x1 5 gün" }),
        VET_A,
      );
      expect(o.type).toBe("application");
      expect(o.status).toBe("pending");
      await service.start(TENANT_A, o.id, VET_A);
      const done = await service.complete(TENANT_A, o.id, VET_A);
      expect(done.status).toBe("completed");
    });

    it("instruction (genel talimat) order oluşturma + iptal", async () => {
      const o = await service.create(
        TENANT_A,
        validInput({
          type: "instruction",
          description: "Düşük yağlı diyet 14 gün",
        }),
        VET_A,
      );
      expect(o.type).toBe("instruction");
      const cancelled = await service.cancel(
        TENANT_A,
        o.id,
        { reason: "Sahibi karşı çıktı" },
        VET_A,
      );
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancellationReason).toBe("Sahibi karşı çıktı");
    });

    it("type=application filter doğru çalışır", async () => {
      await service.create(
        TENANT_A,
        validInput({ type: "application", description: "Pansuman" }),
        VET_A,
      );
      await service.create(
        TENANT_A,
        validInput({ type: "instruction", description: "Diyet" }),
        VET_A,
      );
      const r = await service.list(
        TENANT_A,
        { type: "application", limit: 20, offset: 0 },
        VET_A,
      );
      expect(r.total).toBe(1);
      expect(r.items[0]?.type).toBe("application");
    });
  });
});
