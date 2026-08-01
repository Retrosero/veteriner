/**
 * @file DischargeSummariesService unit testleri.
 * @module apps/api/modules/discharge-summaries/discharge-summaries.service.spec
 * @description GOAL-086 gözlem + taburcu özeti service testleri.
 *   - addObservation: append-only; discharged/cancelled 422.
 *   - createDischargeSummary: yatış discharged olmalı 422.
 *   - update / finalize / amend / portal-share state transitions.
 *   - Cross-tenant IDOR → null/404; cross-tenant create 403.
 * @since GOAL-086 (FAZ-8) gözlem ve taburcu özeti core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { DischargeSummariesRepository } from "./discharge-summaries.repository.js";
import { DischargeSummariesService } from "./discharge-summaries.service.js";
import { HospitalizationRepository } from "../hospitalization/hospitalization.repository.js";
import { HospitalizationService } from "../hospitalization/hospitalization.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type {
  DischargeSummaryAmendInput,
  DischargeSummaryCreateInput,
  DischargeSummaryUpdateInput,
  ObservationCreateInput,
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

/**
 *
 * @param overrides
 */
function makeObsInput(
  overrides: Partial<ObservationCreateInput> = {},
): ObservationCreateInput {
  return { kind: "vital", value: "38.5°C", ...overrides };
}

/**
 *
 * @param overrides
 */
function makeSummaryInput(
  overrides: Partial<DischargeSummaryCreateInput> = {},
): DischargeSummaryCreateInput {
  return {
    clinicalSummary: "Komplikasyonsuz post-op",
    treatments: "Amoxicillin 7 gün",
    homeInstructions: "Yara bakımı günlük",
    medications: [
      {
        name: "Amoxicillin",
        dose: "500mg",
        frequency: "BID",
        durationDays: 7,
      },
    ],
    followUpDate: "2026-08-15",
    ...overrides,
  };
}

/**
 *
 * @param overrides
 */
function makeUpdateInput(
  overrides: Partial<DischargeSummaryUpdateInput> = {},
): DischargeSummaryUpdateInput {
  return { clinicalSummary: "güncellenmiş özet", ...overrides };
}

/**
 *
 * @param overrides
 */
function makeAmendInput(
  overrides: Partial<DischargeSummaryAmendInput> = {},
): DischargeSummaryAmendInput {
  return { reason: "ilaç dozajı düzeltildi", ...overrides };
}

describe("DischargeSummariesService", () => {
  let service: DischargeSummariesService;
  let repo: DischargeSummariesRepository;
  let hospService: HospitalizationService;
  let hospRepo: HospitalizationRepository;
  let audit: AuditService;

  beforeEach(() => {
    repo = new DischargeSummariesRepository();
    hospRepo = new HospitalizationRepository();
    audit = makeAudit();
    hospService = new HospitalizationService(hospRepo, audit);
    service = new DischargeSummariesService(repo, hospService, audit);
  });

  /** Discharged yatış oluşturur, id döner. */
  async function makeDischargedHosp(): Promise<string> {
    const h = await hospService.createHospitalization(
      TENANT_A,
      { patientId: PATIENT_A },
      VET_A,
    );
    await hospService.admitHospitalization(TENANT_A, h.id, {}, VET_A);
    await hospService.dischargeHospitalization(
      TENANT_A,
      h.id,
      { reason: "iyileşti" },
      VET_A,
    );
    return h.id;
  }

  // -------------------------------------------------------------------------
  // addObservation
  // -------------------------------------------------------------------------

  describe("addObservation", () => {
    it("active yatışa gözlem ekler", async () => {
      const h = await hospService.createHospitalization(
        TENANT_A,
        { patientId: PATIENT_A },
        VET_A,
      );
      await hospService.admitHospitalization(TENANT_A, h.id, {}, VET_A);
      const obs = await service.addObservation(
        TENANT_A,
        h.id,
        makeObsInput(),
        VET_A,
      );
      expect(obs.id).toMatch(/^obs-/);
      expect(obs.kind).toBe("vital");
      expect(obs.value).toBe("38.5°C");
    });

    it("discharged yatışa gözlem 422 VET-DSUM-0003", async () => {
      const hospId = await makeDischargedHosp();
      await expect(
        service.addObservation(TENANT_A, hospId, makeObsInput(), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-DSUM-0003",
        httpStatus: 422,
      });
    });
  });

  // -------------------------------------------------------------------------
  // createDischargeSummary
  // -------------------------------------------------------------------------

  describe("createDischargeSummary", () => {
    it("discharged yatış için özet oluşturur (draft)", async () => {
      const hospId = await makeDischargedHosp();
      const out = await service.createDischargeSummary(
        TENANT_A,
        hospId,
        makeSummaryInput(),
        VET_A,
      );
      expect(out.id).toMatch(/^dsm-/);
      expect(out.status).toBe("draft");
      expect(out.medications.length).toBe(1);
      expect(out.medications[0]?.name).toBe("Amoxicillin");
      expect(out.followUpDate).toBe("2026-08-15");
    });

    it("active yatış için özet 422 VET-DSUM-0004", async () => {
      const h = await hospService.createHospitalization(
        TENANT_A,
        { patientId: PATIENT_A },
        VET_A,
      );
      await hospService.admitHospitalization(TENANT_A, h.id, {}, VET_A);
      await expect(
        service.createDischargeSummary(
          TENANT_A,
          h.id,
          makeSummaryInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-DSUM-0004",
        httpStatus: 422,
      });
    });

    it("aynı yatış için ikinci özet 409 VET-DSUM-0005", async () => {
      const hospId = await makeDischargedHosp();
      await service.createDischargeSummary(
        TENANT_A,
        hospId,
        makeSummaryInput(),
        VET_A,
      );
      await expect(
        service.createDischargeSummary(
          TENANT_A,
          hospId,
          makeSummaryInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-DSUM-0005",
        httpStatus: 409,
      });
    });

    it("cross-tenant create 403 VET-AUTHZ-0001", async () => {
      // STAFF_A (TENANT_A) → TENANT_B
      await expect(
        service.createDischargeSummary(
          TENANT_B,
          "hos-any",
          makeSummaryInput(),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-AUTHZ-0001",
        httpStatus: 403,
      });
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe("updateDischargeSummary", () => {
    it("draft özeti günceller", async () => {
      const hospId = await makeDischargedHosp();
      const s = await service.createDischargeSummary(
        TENANT_A,
        hospId,
        makeSummaryInput(),
        VET_A,
      );
      const out = await service.updateDischargeSummary(
        TENANT_A,
        hospId,
        makeUpdateInput(),
        VET_A,
      );
      expect(out.id).toBe(s.id);
      expect(out.clinicalSummary).toBe("güncellenmiş özet");
    });
  });

  // -------------------------------------------------------------------------
  // finalize
  // -------------------------------------------------------------------------

  describe("finalizeDischargeSummary", () => {
    it("draft → finalized + PDF flag set", async () => {
      const hospId = await makeDischargedHosp();
      await service.createDischargeSummary(
        TENANT_A,
        hospId,
        makeSummaryInput(),
        VET_A,
      );
      const out = await service.finalizeDischargeSummary(
        TENANT_A,
        hospId,
        {},
        VET_A,
      );
      expect(out.status).toBe("finalized");
      expect(out.finalizedAt).not.toBeNull();
      expect(out.pdfGenerated).toBe(true);
      expect(out.pdfGeneratedAt).not.toBeNull();
    });

    it("finalize sonrası update 409 VET-DSUM-0006", async () => {
      const hospId = await makeDischargedHosp();
      await service.createDischargeSummary(
        TENANT_A,
        hospId,
        makeSummaryInput(),
        VET_A,
      );
      await service.finalizeDischargeSummary(TENANT_A, hospId, {}, VET_A);
      await expect(
        service.updateDischargeSummary(
          TENANT_A,
          hospId,
          makeUpdateInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-DSUM-0006",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // amend
  // -------------------------------------------------------------------------

  describe("amendDischargeSummary", () => {
    it("finalized → amended; yeni revision (draft) oluşur", async () => {
      const hospId = await makeDischargedHosp();
      const original = await service.createDischargeSummary(
        TENANT_A,
        hospId,
        makeSummaryInput(),
        VET_A,
      );
      await service.finalizeDischargeSummary(TENANT_A, hospId, {}, VET_A);
      const newSummary = await service.amendDischargeSummary(
        TENANT_A,
        hospId,
        makeAmendInput(),
        VET_A,
      );
      expect(newSummary.id).not.toBe(original.id);
      expect(newSummary.status).toBe("draft");
      expect(newSummary.amendsSummaryId).toBe(original.id);
      expect(newSummary.amendmentReason).toBe("ilaç dozajı düzeltildi");

      // orijinal amended
      const current = await service.getDischargeSummary(
        TENANT_A,
        hospId,
        VET_A,
      );
      expect(current!.id).toBe(newSummary.id);
    });

    it("draft özet amend edilemez 409 VET-DSUM-0008", async () => {
      const hospId = await makeDischargedHosp();
      await service.createDischargeSummary(
        TENANT_A,
        hospId,
        makeSummaryInput(),
        VET_A,
      );
      await expect(
        service.amendDischargeSummary(
          TENANT_A,
          hospId,
          makeAmendInput(),
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-DSUM-0008",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // portal share
  // -------------------------------------------------------------------------

  describe("shareDischargeSummaryPortal", () => {
    it("finalized → portalShared=true; portalSharedAt set", async () => {
      const hospId = await makeDischargedHosp();
      await service.createDischargeSummary(
        TENANT_A,
        hospId,
        makeSummaryInput(),
        VET_A,
      );
      await service.finalizeDischargeSummary(TENANT_A, hospId, {}, VET_A);
      const out = await service.shareDischargeSummaryPortal(
        TENANT_A,
        hospId,
        VET_A,
      );
      expect(out.portalShared).toBe(true);
      expect(out.portalSharedAt).not.toBeNull();
    });

    it("draft özet portal'a paylaşılamaz 409 VET-DSUM-0007", async () => {
      const hospId = await makeDischargedHosp();
      await service.createDischargeSummary(
        TENANT_A,
        hospId,
        makeSummaryInput(),
        VET_A,
      );
      await expect(
        service.shareDischargeSummaryPortal(TENANT_A, hospId, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-DSUM-0007",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // listObservations
  // -------------------------------------------------------------------------

  describe("listObservations", () => {
    it("kind filtresi çalışır", async () => {
      const h = await hospService.createHospitalization(
        TENANT_A,
        { patientId: PATIENT_A },
        VET_A,
      );
      await hospService.admitHospitalization(TENANT_A, h.id, {}, VET_A);
      await service.addObservation(
        TENANT_A,
        h.id,
        makeObsInput({ kind: "vital" }),
        VET_A,
      );
      await service.addObservation(
        TENANT_A,
        h.id,
        makeObsInput({ kind: "behavior", value: "sakin" }),
        VET_A,
      );
      const vitalOnly = await service.listObservations(
        TENANT_A,
        { hospitalizationId: h.id, kind: "vital", limit: 50, offset: 0 },
        VET_A,
      );
      expect(vitalOnly.total).toBe(1);
      expect(vitalOnly.items[0]?.kind).toBe("vital");
    });
  });
});
