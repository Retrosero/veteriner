/**
 * @file AnesthesiaService unit testleri.
 * @module apps/api/modules/anesthesia/anesthesia.service.spec
 * @description GOAL-082 anestezi takip service testleri.
 *   - createAnesthesia: plan in_progress olmalı; aynı plan için
 *     ikinci kayıt 409 VET-ANESTHESIA-0004.
 *   - addMedication/addVital/addComplication/assignStaff: yalnızca
 *     draft durumda (409 VET-ANESTHESIA-0002).
 *   - finalizeAnesthesia: draft → finalized; tekrar finalize 409.
 *   - Cross-tenant IDOR → null; cross-tenant create 403.
 *   - Patient mismatch 422 VET-ANESTHESIA-0003.
 * @since GOAL-082 (FAZ-8) anestezi takip core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnesthesiaRepository } from "./anesthesia.repository.js";
import { AnesthesiaService } from "./anesthesia.service.js";
import { SurgeryPlansRepository } from "../surgery-plans/surgery-plans.repository.js";
import { SurgeryPlansService } from "../surgery-plans/surgery-plans.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type {
  AnesthesiaComplicationInput,
  AnesthesiaCreateInput,
  AnesthesiaMedicationInput,
  AnesthesiaStaffInput,
  AnesthesiaVitalInput,
  SurgeryPlanCreateInput,
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

const _STAFF_A: ActorContext = {
  actorId: "usr-staff-a",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-3",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

/**
 *
 */
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

/**
 *
 * @param daysAhead
 */
function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString();
}

/**
 *
 * @param overrides
 */
function makeSurgeryInput(
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

/**
 *
 * @param overrides
 */
function makeAnesthesiaInput(
  overrides: Partial<AnesthesiaCreateInput> = {},
): AnesthesiaCreateInput {
  return {
    surgeryPlanId: "sp-1",
    patientId: PATIENT_A,
    protocol: "TIVA",
    ...overrides,
  };
}

/**
 *
 * @param overrides
 */
function makeMedicationInput(
  overrides: Partial<AnesthesiaMedicationInput> = {},
): AnesthesiaMedicationInput {
  return {
    medicationName: "Propofol",
    dose: "10mg",
    route: "iv",
    administeredAt: futureDate(7),
    administeredByUserId: "usr-vet-a",
    ...overrides,
  };
}

/**
 *
 * @param overrides
 */
function makeVitalInput(
  overrides: Partial<AnesthesiaVitalInput> = {},
): AnesthesiaVitalInput {
  return {
    kind: "heart_rate",
    value: "80",
    unit: "bpm",
    observedAt: futureDate(7),
    observedByUserId: "usr-vet-a",
    ...overrides,
  };
}

/**
 *
 * @param overrides
 */
function makeComplicationInput(
  overrides: Partial<AnesthesiaComplicationInput> = {},
): AnesthesiaComplicationInput {
  return {
    description: "bradikardi",
    severity: "moderate",
    occurredAt: futureDate(7),
    reportedByUserId: "usr-vet-a",
    ...overrides,
  };
}

/**
 *
 * @param overrides
 */
function makeStaffInput(
  overrides: Partial<AnesthesiaStaffInput> = {},
): AnesthesiaStaffInput {
  return {
    userId: "usr-tech-1",
    role: "technician",
    assignedAt: futureDate(7),
    ...overrides,
  };
}

describe("AnesthesiaService", () => {
  let service: AnesthesiaService;
  let repo: AnesthesiaRepository;
  let surgeryService: SurgeryPlansService;
  let surgeryRepo: SurgeryPlansRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new AnesthesiaRepository();
    surgeryRepo = new SurgeryPlansRepository();
    audit = makeAudit();
    surgeryService = new SurgeryPlansService(surgeryRepo, audit);
    service = new AnesthesiaService(repo, surgeryService, audit);
  });

  // -------------------------------------------------------------------------
  // createAnesthesia
  // -------------------------------------------------------------------------

  describe("createAnesthesia", () => {
    it("in_progress plan için yeni takip oluşturur (draft)", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      await surgeryService.startPlan(TENANT_A, plan.id, VET_A);

      const out = await service.createAnesthesia(
        TENANT_A,
        makeAnesthesiaInput({ surgeryPlanId: plan.id }),
        VET_A,
      );
      expect(out.id).toMatch(/^an-/);
      expect(out.status).toBe("draft");
      expect(out.protocol).toBe("TIVA");
      expect(out.surgeryPlanId).toBe(plan.id);
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:anesthesia.create",
        "anesthesia",
        out.id,
        "create",
        expect.anything(),
        "info",
        expect.anything(),
      );
    });

    it("plan scheduled → 422 VET-ANESTHESIA-0003", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      // not started → still scheduled
      await expect(
        service.createAnesthesia(
          TENANT_A,
          makeAnesthesiaInput({ surgeryPlanId: plan.id }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-ANESTHESIA-0003",
        httpStatus: 422,
      });
    });

    it("plan tamamlanmış → 422 VET-ANESTHESIA-0003", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      await surgeryService.startPlan(TENANT_A, plan.id, VET_A);
      await surgeryService.completePlan(TENANT_A, plan.id, VET_A);
      await expect(
        service.createAnesthesia(
          TENANT_A,
          makeAnesthesiaInput({ surgeryPlanId: plan.id }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-ANESTHESIA-0003",
        httpStatus: 422,
      });
    });

    it("plan yok → 422 VET-ANESTHESIA-0003", async () => {
      await expect(
        service.createAnesthesia(
          TENANT_A,
          makeAnesthesiaInput({ surgeryPlanId: "sp-not-exist" }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-ANESTHESIA-0003",
        httpStatus: 422,
      });
    });

    it("patientId uyuşmazlığı → 422 VET-ANESTHESIA-0003", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput({ patientId: PATIENT_A }),
        VET_A,
      );
      await surgeryService.startPlan(TENANT_A, plan.id, VET_A);
      await expect(
        service.createAnesthesia(
          TENANT_A,
          makeAnesthesiaInput({
            surgeryPlanId: plan.id,
            patientId: PATIENT_B,
          }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-ANESTHESIA-0003",
        httpStatus: 422,
      });
    });

    it("aynı plan için ikinci takip 409 VET-ANESTHESIA-0004", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      await surgeryService.startPlan(TENANT_A, plan.id, VET_A);
      await service.createAnesthesia(
        TENANT_A,
        makeAnesthesiaInput({ surgeryPlanId: plan.id }),
        VET_A,
      );
      await expect(
        service.createAnesthesia(
          TENANT_A,
          makeAnesthesiaInput({ surgeryPlanId: plan.id }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-ANESTHESIA-0004",
        httpStatus: 409,
      });
    });

    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      // STAFF_B tenantB'de; create isteği TENANT_A'ya gidiyor → scope mismatch.
      await expect(
        service.createAnesthesia(TENANT_A, makeAnesthesiaInput(), STAFF_B),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });

  // -------------------------------------------------------------------------
  // addMedication / addVital / addComplication / assignStaff
  // -------------------------------------------------------------------------

  describe("addMedication", () => {
    it("draft durumda ilaç ekler", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      await surgeryService.startPlan(TENANT_A, plan.id, VET_A);
      const anesthesia = await service.createAnesthesia(
        TENANT_A,
        makeAnesthesiaInput({ surgeryPlanId: plan.id }),
        VET_A,
      );
      const med = await service.addMedication(
        TENANT_A,
        anesthesia.id,
        makeMedicationInput(),
        VET_A,
      );
      expect(med.medicationName).toBe("Propofol");
      expect(med.anesthesiaId).toBe(anesthesia.id);
    });
  });

  describe("addVital", () => {
    it("draft durumda vital ekler", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      await surgeryService.startPlan(TENANT_A, plan.id, VET_A);
      const anesthesia = await service.createAnesthesia(
        TENANT_A,
        makeAnesthesiaInput({ surgeryPlanId: plan.id }),
        VET_A,
      );
      const vital = await service.addVital(
        TENANT_A,
        anesthesia.id,
        makeVitalInput(),
        VET_A,
      );
      expect(vital.kind).toBe("heart_rate");
      expect(vital.value).toBe("80");
    });
  });

  describe("addComplication", () => {
    it("draft durumda komplikasyon ekler", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      await surgeryService.startPlan(TENANT_A, plan.id, VET_A);
      const anesthesia = await service.createAnesthesia(
        TENANT_A,
        makeAnesthesiaInput({ surgeryPlanId: plan.id }),
        VET_A,
      );
      const comp = await service.addComplication(
        TENANT_A,
        anesthesia.id,
        makeComplicationInput(),
        VET_A,
      );
      expect(comp.severity).toBe("moderate");
    });
  });

  describe("assignStaff", () => {
    it("draft durumda personel atar", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      await surgeryService.startPlan(TENANT_A, plan.id, VET_A);
      const anesthesia = await service.createAnesthesia(
        TENANT_A,
        makeAnesthesiaInput({ surgeryPlanId: plan.id }),
        VET_A,
      );
      const staff = await service.assignStaff(
        TENANT_A,
        anesthesia.id,
        makeStaffInput(),
        VET_A,
      );
      expect(staff.role).toBe("technician");
    });
  });

  // -------------------------------------------------------------------------
  // finalize
  // -------------------------------------------------------------------------

  describe("finalizeAnesthesia", () => {
    it("draft → finalized", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      await surgeryService.startPlan(TENANT_A, plan.id, VET_A);
      const anesthesia = await service.createAnesthesia(
        TENANT_A,
        makeAnesthesiaInput({ surgeryPlanId: plan.id }),
        VET_A,
      );
      const out = await service.finalizeAnesthesia(
        TENANT_A,
        anesthesia.id,
        {},
        VET_A,
      );
      expect(out.status).toBe("finalized");
      expect(out.finalizedAt).not.toBeNull();
      expect(out.finalizedBy).toBe("usr-vet-a");
    });

    it("finalize sonrası ilaç eklenemez 409 VET-ANESTHESIA-0002", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      await surgeryService.startPlan(TENANT_A, plan.id, VET_A);
      const anesthesia = await service.createAnesthesia(
        TENANT_A,
        makeAnesthesiaInput({ surgeryPlanId: plan.id }),
        VET_A,
      );
      await service.finalizeAnesthesia(TENANT_A, anesthesia.id, {}, VET_A);
      await expect(
        service.addMedication(
          TENANT_A,
          anesthesia.id,
          makeMedicationInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-ANESTHESIA-0002",
        httpStatus: 409,
      });
    });

    it("tekrar finalize 409 VET-ANESTHESIA-0002", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      await surgeryService.startPlan(TENANT_A, plan.id, VET_A);
      const anesthesia = await service.createAnesthesia(
        TENANT_A,
        makeAnesthesiaInput({ surgeryPlanId: plan.id }),
        VET_A,
      );
      await service.finalizeAnesthesia(TENANT_A, anesthesia.id, {}, VET_A);
      await expect(
        service.finalizeAnesthesia(TENANT_A, anesthesia.id, {}, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-ANESTHESIA-0002",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // list + getDetail
  // -------------------------------------------------------------------------

  describe("list / getDetail", () => {
    it("listAnesthesias + getAnesthesiaDetail alt kayıtları döner", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      await surgeryService.startPlan(TENANT_A, plan.id, VET_A);
      const anesthesia = await service.createAnesthesia(
        TENANT_A,
        makeAnesthesiaInput({ surgeryPlanId: plan.id }),
        VET_A,
      );
      await service.addMedication(
        TENANT_A,
        anesthesia.id,
        makeMedicationInput(),
        VET_A,
      );
      await service.addVital(TENANT_A, anesthesia.id, makeVitalInput(), VET_A);
      await service.assignStaff(
        TENANT_A,
        anesthesia.id,
        makeStaffInput(),
        VET_A,
      );

      const list = await service.listAnesthesias(
        TENANT_A,
        { limit: 50, offset: 0 },
        VET_A,
      );
      expect(list.total).toBe(1);

      const detail = await service.getAnesthesiaDetail(
        TENANT_A,
        anesthesia.id,
        VET_A,
      );
      expect(detail).not.toBeNull();
      expect(detail!.medications.length).toBe(1);
      expect(detail!.vitals.length).toBe(1);
      expect(detail!.staff.length).toBe(1);
      expect(detail!.complications.length).toBe(0);
    });

    it("cross-tenant getDetail → null", async () => {
      const plan = await surgeryService.createPlan(
        TENANT_A,
        makeSurgeryInput(),
        VET_A,
      );
      await surgeryService.startPlan(TENANT_A, plan.id, VET_A);
      const anesthesia = await service.createAnesthesia(
        TENANT_A,
        makeAnesthesiaInput({ surgeryPlanId: plan.id }),
        VET_A,
      );
      const detail = await service.getAnesthesiaDetail(
        TENANT_B,
        anesthesia.id,
        STAFF_B,
      );
      expect(detail).toBeNull();
    });
  });
});
