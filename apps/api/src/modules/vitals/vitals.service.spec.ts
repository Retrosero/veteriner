/**
 * @file VitalsService unit testleri.
 * @module apps/api/modules/vitals/vitals.service.spec
 *
 * @description Vital bulgular kayıt, range validation, tenant
 * izolasyonu, listeleme (takenAt desc) ve latest sorgusu iş
 * kuralları. DB migration olmadığı için in-memory repo + mock
 * ExaminationsService / PatientsService kullanılır.
 *
 * @since GOAL-042 (FAZ-4) vital bulgular core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { VitalsRepository } from "./vitals.repository.js";
import { VitalsService } from "./vitals.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { Patient } from "../../common/patients/patient.types.js";
import type { ExaminationsService } from "../examinations/examinations.service.js";
import type { PatientsService } from "../patients/patients.service.js";
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

const VET_B: ActorContext = {
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

const PATIENT_ID_A = "33333333-3333-3333-3333-333333333333";
const VET_USER_ID_A = "vet-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EXAM_ID_A = "exam-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EXAM_ID_B = "exam-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const APPT_ID_A = "appt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** Mock examination store. */
const examStore = new Map<string, Examination>();

function seedExam(
  tenantId: string,
  id: string,
  patientId: string,
  veterinarianId: string,
): void {
  const e: Examination = {
    id,
    tenantId,
    patientId,
    veterinarianId,
    appointmentId: APPT_ID_A,
    status: "in_progress",
    type: "consultation",
    chiefComplaint: "Kontrol",
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

/** Mock patient store (common Patient tipi ile). */
const patientStore = new Map<string, Patient>();

function seedPatientContract(tenantId: string, id: string): void {
  const p: Patient = {
    id,
    tenantId,
    ownerId: "own-1",
    name: "Boncuk",
    species: "dog",
    breed: null,
    birthDate: null,
    gender: "male",
    microchip: null,
    color: null,
    neutered: false,
    notes: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    archivedAt: null,
  };
  patientStore.set(`${tenantId}|${id}`, p);
}

function makePatients(): PatientsService {
  return {
    findById: vi
      .fn()
      .mockImplementation(
        async (tenantId: string, id: string) =>
          patientStore.get(`${tenantId}|${id}`) ?? null,
      ),
  } as unknown as PatientsService;
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

function validVitals() {
  return {
    vitalSigns: {
      temperatureC: 38.5,
      heartRateBpm: 110,
      respiratoryRateBpm: 24,
    },
  };
}

describe("VitalsService", () => {
  let service: VitalsService;
  let repo: VitalsRepository;
  let examinations: ExaminationsService;
  let patients: PatientsService;
  let audit: AuditService;

  beforeEach(() => {
    examStore.clear();
    patientStore.clear();
    seedExam(TENANT_A, EXAM_ID_A, PATIENT_ID_A, VET_USER_ID_A);
    seedExam(TENANT_B, EXAM_ID_B, PATIENT_ID_A, VET_USER_ID_A);
    seedPatientContract(TENANT_A, PATIENT_ID_A);
    repo = new VitalsRepository();
    examinations = makeExaminations();
    patients = makePatients();
    audit = makeAudit();
    service = new VitalsService(repo, examinations, patients, audit);
  });

  // -------------------------------------------------------------------------
  // record
  // -------------------------------------------------------------------------

  describe("record", () => {
    it("başarı: vital kaydedilir + audit:vitals.record (info)", async () => {
      const rec = await service.record(
        TENANT_A,
        EXAM_ID_A,
        validVitals(),
        VET_A,
      );
      expect(rec.id).toMatch(/^vitals-/);
      expect(rec.tenantId).toBe(TENANT_A);
      expect(rec.examinationId).toBe(EXAM_ID_A);
      expect(rec.patientId).toBe(PATIENT_ID_A);
      expect(rec.veterinarianId).toBe(VET_USER_ID_A);
      expect(rec.recordedBy).toBe("usr-vet-a");
      expect(rec.takenAt).toBeTruthy();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:vitals.record",
        "vitals",
        rec.id,
        "create",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({
          examinationId: EXAM_ID_A,
          patientId: PATIENT_ID_A,
        }),
      );
    });

    it("cross-tenant examination → 404 VET-CLINIC-0001", async () => {
      await expect(
        service.record(TENANT_A, EXAM_ID_B, validVitals(), VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });

    it("boş vitalSigns → 422 VET-VALIDATION-0010", async () => {
      await expect(
        service.record(
          TENANT_A,
          EXAM_ID_A,
          { vitalSigns: { notes: "sadece not" } },
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0010",
        httpStatus: 422,
      });
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // findByExamination
  // -------------------------------------------------------------------------

  describe("findByExamination", () => {
    it("3 kayıt takenAt desc sırayla döner", async () => {
      // takenAt'ı deterministik vermek için 3 ayrı kayıt
      await service.record(
        TENANT_A,
        EXAM_ID_A,
        {
          vitalSigns: { temperatureC: 38.0 },
          takenAt: "2025-01-01T08:00:00.000Z",
        },
        VET_A,
      );
      await service.record(
        TENANT_A,
        EXAM_ID_A,
        {
          vitalSigns: { temperatureC: 39.0 },
          takenAt: "2025-01-01T12:00:00.000Z",
        },
        VET_A,
      );
      await service.record(
        TENANT_A,
        EXAM_ID_A,
        {
          vitalSigns: { temperatureC: 38.5 },
          takenAt: "2025-01-01T10:00:00.000Z",
        },
        VET_A,
      );

      const list = await service.findByExamination(TENANT_A, EXAM_ID_A, VET_A);
      expect(list).toHaveLength(3);
      expect(list[0]?.takenAt).toBe("2025-01-01T12:00:00.000Z");
      expect(list[1]?.takenAt).toBe("2025-01-01T10:00:00.000Z");
      expect(list[2]?.takenAt).toBe("2025-01-01T08:00:00.000Z");
    });

    it("cross-tenant examinationId → boş liste", async () => {
      // tenantA'da bir kayıt oluştur
      await service.record(TENANT_A, EXAM_ID_A, validVitals(), VET_A);
      // tenantB aynı examinationId'yi sorsa bile tenant-scoped
      // sorgu boş döner (EXAM_ID_B farklı tenant'ta var).
      const list = await service.findByExamination(TENANT_B, EXAM_ID_A, VET_B);
      expect(list).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // latestForPatient
  // -------------------------------------------------------------------------

  describe("latestForPatient", () => {
    it("en yeni kayıt döner", async () => {
      await service.record(
        TENANT_A,
        EXAM_ID_A,
        {
          vitalSigns: { temperatureC: 38.0 },
          takenAt: "2025-01-01T08:00:00.000Z",
        },
        VET_A,
      );
      await service.record(
        TENANT_A,
        EXAM_ID_A,
        {
          vitalSigns: { temperatureC: 39.5 },
          takenAt: "2025-01-01T14:00:00.000Z",
        },
        VET_A,
      );
      await service.record(
        TENANT_A,
        EXAM_ID_A,
        {
          vitalSigns: { temperatureC: 38.5 },
          takenAt: "2025-01-01T10:00:00.000Z",
        },
        VET_A,
      );

      const latest = await service.latestForPatient(
        TENANT_A,
        PATIENT_ID_A,
        VET_A,
      );
      expect(latest).not.toBeNull();
      expect(latest?.takenAt).toBe("2025-01-01T14:00:00.000Z");
      expect(latest?.vitalSigns.temperatureC).toBe(39.5);
    });

    it("hiç kayıt yoksa null", async () => {
      const latest = await service.latestForPatient(
        TENANT_A,
        PATIENT_ID_A,
        VET_A,
      );
      expect(latest).toBeNull();
    });

    it("cross-tenant patient → 404 VET-CLINIC-0001", async () => {
      await expect(
        service.latestForPatient(TENANT_B, PATIENT_ID_A, VET_B),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
    });
  });

  // -------------------------------------------------------------------------
  // audit
  // -------------------------------------------------------------------------

  describe("audit", () => {
    it("her record için tek audit event publish'lenir", async () => {
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await service.record(TENANT_A, EXAM_ID_A, validVitals(), VET_A);
      await service.record(TENANT_A, EXAM_ID_A, validVitals(), VET_A);
      expect(audit.recordSimple).toHaveBeenCalledTimes(2);
      const calls = (audit.recordSimple as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0]?.[0]).toBe("audit:vitals.record");
      expect(calls[1]?.[0]).toBe("audit:vitals.record");
      expect(calls[0]?.[3]).toBe("create");
    });
  });
});
