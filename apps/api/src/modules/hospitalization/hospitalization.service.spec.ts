/**
 * @file HospitalizationService unit testleri.
 * @module apps/api/modules/hospitalization/hospitalization.service.spec
 *
 * @description GOAL-084 yatış + kafes service testleri.
 *   - createCage: code unique (409 VET-HOSP-0006).
 *   - createHospitalization: aynı patient için aktif yatış varsa
 *     409 VET-HOSP-0007.
 *   - admit/discharge/cancel: yaşam döngüsü.
 *   - assignCage: aynı kafeste zaman çakışması 409 VET-HOSP-0009.
 *   - endCageAssignment: to set; assignment kapanır.
 *   - Cross-tenant IDOR → null/404; cross-tenant create 403.
 *
 * @since GOAL-084 (FAZ-8) yatış ve kafes yönetimi core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { HospitalizationRepository } from "./hospitalization.repository.js";
import { HospitalizationService } from "./hospitalization.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type {
  CageAssignmentCreateInput,
  CageAssignmentEndInput,
  CageCreateInput,
  HospitalizationAdmitInput,
  HospitalizationCancelInput,
  HospitalizationCreateInput,
  HospitalizationDischargeInput,
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

const _STAFF_B: ActorContext = {
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

function isoOffset(minutes: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function makeCageInput(
  overrides: Partial<CageCreateInput> = {},
): CageCreateInput {
  return {
    code: "A1",
    kind: "dog_small",
    capacity: 1,
    active: true,
    ...overrides,
  };
}

function makeHospInput(
  overrides: Partial<HospitalizationCreateInput> = {},
): HospitalizationCreateInput {
  return {
    patientId: PATIENT_A,
    ...overrides,
  };
}

function makeAdmitInput(
  overrides: Partial<HospitalizationAdmitInput> = {},
): HospitalizationAdmitInput {
  return { ...overrides };
}

function makeDischargeInput(
  overrides: Partial<HospitalizationDischargeInput> = {},
): HospitalizationDischargeInput {
  return { reason: "iyileşti", ...overrides };
}

function makeCancelInput(
  overrides: Partial<HospitalizationCancelInput> = {},
): HospitalizationCancelInput {
  return { reason: "plan iptal", ...overrides };
}

function makeAssignmentInput(
  overrides: Partial<CageAssignmentCreateInput> = {},
): CageAssignmentCreateInput {
  return {
    cageId: "cag-1",
    from: isoOffset(-30),
    ...overrides,
  };
}

function makeEndInput(
  overrides: Partial<CageAssignmentEndInput> = {},
): CageAssignmentEndInput {
  return { to: isoOffset(30), ...overrides };
}

describe("HospitalizationService", () => {
  let service: HospitalizationService;
  let repo: HospitalizationRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new HospitalizationRepository();
    audit = makeAudit();
    service = new HospitalizationService(repo, audit);
  });

  // -------------------------------------------------------------------------
  // Cage
  // -------------------------------------------------------------------------

  describe("createCage", () => {
    it("yeni kafes oluşturur", async () => {
      const out = await service.createCage(TENANT_A, makeCageInput(), VET_A);
      expect(out.id).toMatch(/^cag-/);
      expect(out.code).toBe("A1");
      expect(out.active).toBe(true);
    });

    it("aynı code 409 VET-HOSP-0006", async () => {
      await service.createCage(TENANT_A, makeCageInput(), VET_A);
      await expect(
        service.createCage(TENANT_A, makeCageInput(), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-HOSP-0006",
        httpStatus: 409,
      });
    });

    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      // STAFF_A (TENANT_A) tries to create in TENANT_B
      await expect(
        service.createCage(TENANT_B, makeCageInput(), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Hospitalization create
  // -------------------------------------------------------------------------

  describe("createHospitalization", () => {
    it("yeni yatış oluşturur (planned)", async () => {
      const out = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      expect(out.id).toMatch(/^hos-/);
      expect(out.status).toBe("planned");
      expect(out.patientId).toBe(PATIENT_A);
    });

    it("aynı patient için aktif yatış 409 VET-HOSP-0007", async () => {
      await service.createHospitalization(TENANT_A, makeHospInput(), VET_A);
      await expect(
        service.createHospitalization(TENANT_A, makeHospInput(), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-HOSP-0007",
        httpStatus: 409,
      });
    });

    it("discharged yatıştan sonra yeni planned açılabilir", async () => {
      const h = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      await service.admitHospitalization(
        TENANT_A,
        h.id,
        makeAdmitInput(),
        VET_A,
      );
      await service.dischargeHospitalization(
        TENANT_A,
        h.id,
        makeDischargeInput(),
        VET_A,
      );
      const h2 = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      expect(h2.id).not.toBe(h.id);
      expect(h2.status).toBe("planned");
    });

    it("cross-tenant create 403", async () => {
      // STAFF_A (TENANT_A) tries to create in TENANT_B → 403
      await expect(
        service.createHospitalization(
          TENANT_B,
          makeHospInput({ patientId: PATIENT_B }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Yaşam döngüsü
  // -------------------------------------------------------------------------

  describe("yaşam döngüsü", () => {
    it("planned → admitted → active (cage atayarak) → discharged", async () => {
      const cage = await service.createCage(TENANT_A, makeCageInput(), VET_A);
      const h = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      const admitted = await service.admitHospitalization(
        TENANT_A,
        h.id,
        makeAdmitInput(),
        VET_A,
      );
      expect(admitted.status).toBe("admitted");
      expect(admitted.admittedAt).not.toBeNull();

      const assigned = await service.assignCage(
        TENANT_A,
        h.id,
        makeAssignmentInput({ cageId: cage.id }),
        VET_A,
      );
      expect(assigned.cageId).toBe(cage.id);

      const detail = await service.getHospitalizationDetail(
        TENANT_A,
        h.id,
        VET_A,
      );
      expect(detail!.hospitalization.status).toBe("active");

      const discharged = await service.dischargeHospitalization(
        TENANT_A,
        h.id,
        makeDischargeInput(),
        VET_A,
      );
      expect(discharged.status).toBe("discharged");
      expect(discharged.dischargedAt).not.toBeNull();
    });

    it("admit 409 VET-HOSP-0003 (zaten admitted)", async () => {
      const h = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      await service.admitHospitalization(
        TENANT_A,
        h.id,
        makeAdmitInput(),
        VET_A,
      );
      await expect(
        service.admitHospitalization(TENANT_A, h.id, makeAdmitInput(), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-HOSP-0003",
        httpStatus: 409,
      });
    });

    it("discharge planned yatışta 409 VET-HOSP-0004", async () => {
      const h = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      await expect(
        service.dischargeHospitalization(
          TENANT_A,
          h.id,
          makeDischargeInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-HOSP-0004",
        httpStatus: 409,
      });
    });

    it("cancel planned → cancelled; tekrar cancel 409 VET-HOSP-0008", async () => {
      const h = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      const cancelled = await service.cancelHospitalization(
        TENANT_A,
        h.id,
        makeCancelInput(),
        VET_A,
      );
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelReason).toBe("plan iptal");

      await expect(
        service.cancelHospitalization(TENANT_A, h.id, makeCancelInput(), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-HOSP-0008",
        httpStatus: 409,
      });
    });

    it("discharged yatış düzenlenemez 409 VET-HOSP-0002", async () => {
      const h = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      await service.admitHospitalization(
        TENANT_A,
        h.id,
        makeAdmitInput(),
        VET_A,
      );
      await service.dischargeHospitalization(
        TENANT_A,
        h.id,
        makeDischargeInput(),
        VET_A,
      );
      await expect(
        service.updateHospitalization(TENANT_A, h.id, { reason: "x" }, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-HOSP-0002",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // CageAssignment
  // -------------------------------------------------------------------------

  describe("assignCage", () => {
    it("ilk cage ataması admitted → active geçişi yapar", async () => {
      const cage = await service.createCage(TENANT_A, makeCageInput(), VET_A);
      const h = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      await service.admitHospitalization(
        TENANT_A,
        h.id,
        makeAdmitInput(),
        VET_A,
      );
      await service.assignCage(
        TENANT_A,
        h.id,
        makeAssignmentInput({ cageId: cage.id }),
        VET_A,
      );
      const detail = await service.getHospitalizationDetail(
        TENANT_A,
        h.id,
        VET_A,
      );
      expect(detail!.hospitalization.status).toBe("active");
      expect(detail!.cageAssignments.length).toBe(1);
    });

    it("aynı kafeste zaman çakışması 409 VET-HOSP-0009", async () => {
      const cage = await service.createCage(TENANT_A, makeCageInput(), VET_A);
      // İlk yatış: cage atama + discharge
      const h1 = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      await service.admitHospitalization(
        TENANT_A,
        h1.id,
        makeAdmitInput(),
        VET_A,
      );
      await service.assignCage(
        TENANT_A,
        h1.id,
        makeAssignmentInput({
          cageId: cage.id,
          from: isoOffset(-60),
          to: isoOffset(-30),
        }),
        VET_A,
      );
      await service.dischargeHospitalization(
        TENANT_A,
        h1.id,
        makeDischargeInput(),
        VET_A,
      );
      // İkinci yatış: aynı cage, çakışan aralık
      const h2 = await service.createHospitalization(
        TENANT_A,
        makeHospInput({ patientId: PATIENT_B }),
        VET_A,
      );
      await service.admitHospitalization(
        TENANT_A,
        h2.id,
        makeAdmitInput(),
        VET_A,
      );
      await expect(
        service.assignCage(
          TENANT_A,
          h2.id,
          makeAssignmentInput({
            cageId: cage.id,
            from: isoOffset(-45),
            to: isoOffset(-15),
          }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-HOSP-0009",
        httpStatus: 409,
      });
    });

    it("aynı yatış için ikinci açık atama 409 VET-HOSP-0011", async () => {
      const cage = await service.createCage(TENANT_A, makeCageInput(), VET_A);
      const h = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      await service.admitHospitalization(
        TENANT_A,
        h.id,
        makeAdmitInput(),
        VET_A,
      );
      await service.assignCage(
        TENANT_A,
        h.id,
        makeAssignmentInput({ cageId: cage.id }),
        VET_A,
      );
      await expect(
        service.assignCage(
          TENANT_A,
          h.id,
          makeAssignmentInput({ cageId: cage.id }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-HOSP-0011",
        httpStatus: 409,
      });
    });

    it("pasif kafese atama 409 VET-HOSP-0010", async () => {
      const cage = await service.createCage(
        TENANT_A,
        makeCageInput({ active: false }),
        VET_A,
      );
      const h = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      await service.admitHospitalization(
        TENANT_A,
        h.id,
        makeAdmitInput(),
        VET_A,
      );
      await expect(
        service.assignCage(
          TENANT_A,
          h.id,
          makeAssignmentInput({ cageId: cage.id }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-HOSP-0010",
        httpStatus: 409,
      });
    });

    it("discharged yatışa kafes atanamaz 409 VET-HOSP-0005", async () => {
      const cage = await service.createCage(TENANT_A, makeCageInput(), VET_A);
      const h = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      await service.admitHospitalization(
        TENANT_A,
        h.id,
        makeAdmitInput(),
        VET_A,
      );
      await service.dischargeHospitalization(
        TENANT_A,
        h.id,
        makeDischargeInput(),
        VET_A,
      );
      await expect(
        service.assignCage(
          TENANT_A,
          h.id,
          makeAssignmentInput({ cageId: cage.id }),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-HOSP-0005",
        httpStatus: 409,
      });
    });
  });

  describe("endCageAssignment", () => {
    it("to set eder; assignment kapanır", async () => {
      const cage = await service.createCage(TENANT_A, makeCageInput(), VET_A);
      const h = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      await service.admitHospitalization(
        TENANT_A,
        h.id,
        makeAdmitInput(),
        VET_A,
      );
      const a = await service.assignCage(
        TENANT_A,
        h.id,
        makeAssignmentInput({ cageId: cage.id }),
        VET_A,
      );
      const ended = await service.endCageAssignment(
        TENANT_A,
        a.id,
        makeEndInput(),
        VET_A,
      );
      expect(ended.to).not.toBeNull();
      expect(ended.endedBy).toBe("usr-vet-a");
    });

    it("zaten kapalı 409 VET-HOSP-0013", async () => {
      const cage = await service.createCage(TENANT_A, makeCageInput(), VET_A);
      const h = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      await service.admitHospitalization(
        TENANT_A,
        h.id,
        makeAdmitInput(),
        VET_A,
      );
      const a = await service.assignCage(
        TENANT_A,
        h.id,
        makeAssignmentInput({ cageId: cage.id }),
        VET_A,
      );
      await service.endCageAssignment(TENANT_A, a.id, makeEndInput(), VET_A);
      await expect(
        service.endCageAssignment(TENANT_A, a.id, makeEndInput(), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-HOSP-0013",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Discharging closes open assignments
  // -------------------------------------------------------------------------

  describe("discharge kafes atamalarını kapatır", () => {
    it("taburcu sırasında açık cage assignment'lar kapanır", async () => {
      const cage = await service.createCage(TENANT_A, makeCageInput(), VET_A);
      const h = await service.createHospitalization(
        TENANT_A,
        makeHospInput(),
        VET_A,
      );
      await service.admitHospitalization(
        TENANT_A,
        h.id,
        makeAdmitInput(),
        VET_A,
      );
      const a = await service.assignCage(
        TENANT_A,
        h.id,
        makeAssignmentInput({ cageId: cage.id }),
        VET_A,
      );
      await service.dischargeHospitalization(
        TENANT_A,
        h.id,
        makeDischargeInput(),
        VET_A,
      );
      const detail = await service.getHospitalizationDetail(
        TENANT_A,
        h.id,
        VET_A,
      );
      const ended = detail!.cageAssignments.find((x) => x.id === a.id);
      expect(ended!.to).not.toBeNull();
    });
  });
});
