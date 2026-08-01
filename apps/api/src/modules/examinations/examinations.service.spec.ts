/**
 * @file ExaminationsService unit testleri.
 * @module apps/api/modules/examinations/examinations.service.spec
 *
 * @description Muayene başlatma, tenant izolasyonu, yaşam döngüsü
 * (in_progress → completed → signed → amended), amendment append-only
 * kaydı, audit event yayını. DB migration olmadığı için in-memory
 * repo + mock AppointmentsService / PatientsService kullanılır.
 *
 * @since GOAL-040 (FAZ-4) muayene başlatma ve yaşam döngüsü core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ExaminationAmendsRepository,
  ExaminationsRepository,
} from "./examinations.repository.js";
import { ExaminationsService } from "./examinations.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { Patient } from "../../common/patients/patient.types.js";
import type { AppointmentsService } from "../appointments/appointments.service.js";
import type { PatientsService } from "../patients/patients.service.js";
import type { Appointment } from "@vetniva/contracts";

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
const APPT_ID_A = "appt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const APPT_ID_B = "appt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

/** Mock appointment store. */
const apptStore = new Map<string, Appointment>();

function seedAppointment(
  tenantId: string,
  id: string,
  patientId: string,
  veterinarianId: string,
): void {
  const a: Appointment = {
    id,
    tenantId,
    patientId,
    ownerId: "own-1",
    veterinarianId,
    type: "consultation",
    status: "scheduled",
    start: "2025-01-01T10:00:00.000Z",
    end: "2025-01-01T10:30:00.000Z",
    notes: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    createdBy: "usr-staff-a",
  };
  apptStore.set(`${tenantId}|${id}`, a);
}

function makeAppointments(): AppointmentsService {
  return {
    findById: vi
      .fn()
      .mockImplementation(
        async (tenantId: string, id: string) =>
          apptStore.get(`${tenantId}|${id}`) ?? null,
      ),
  } as unknown as AppointmentsService;
}

const patientStore = new Map<string, Patient>();
function seedPatient(tenantId: string, id: string): void {
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

function validInput(
  overrides: Partial<{
    appointmentId: string;
    type: "consultation" | "follow_up" | "emergency" | "routine_check";
    chiefComplaint: string;
  }> = {},
) {
  return {
    appointmentId: APPT_ID_A,
    type: "consultation" as const,
    chiefComplaint: "Halsizlik ve iştahsızlık",
    ...overrides,
  };
}

describe("ExaminationsService", () => {
  let service: ExaminationsService;
  let repo: ExaminationsRepository;
  let amends: ExaminationAmendsRepository;
  let appointments: AppointmentsService;
  let patients: PatientsService;
  let audit: AuditService;

  beforeEach(() => {
    apptStore.clear();
    patientStore.clear();
    seedAppointment(TENANT_A, APPT_ID_A, PATIENT_ID_A, VET_USER_ID_A);
    seedAppointment(TENANT_B, APPT_ID_B, PATIENT_ID_A, VET_USER_ID_A);
    seedPatient(TENANT_A, PATIENT_ID_A);
    repo = new ExaminationsRepository();
    amends = new ExaminationAmendsRepository();
    appointments = makeAppointments();
    patients = makePatients();
    audit = makeAudit();
    service = new ExaminationsService(
      repo,
      amends,
      appointments,
      patients,
      audit,
    );
  });

  // -------------------------------------------------------------------------
  // start
  // -------------------------------------------------------------------------

  describe("start", () => {
    it("başarı: status=in_progress + audit.create (info)", async () => {
      const exam = await service.start(TENANT_A, validInput(), VET_A);
      expect(exam.id).toMatch(/^exam-/);
      expect(exam.tenantId).toBe(TENANT_A);
      expect(exam.status).toBe("in_progress");
      expect(exam.patientId).toBe(PATIENT_ID_A);
      expect(exam.veterinarianId).toBe(VET_USER_ID_A);
      expect(exam.appointmentId).toBe(APPT_ID_A);
      expect(exam.completedAt).toBeNull();
      expect(exam.signedAt).toBeNull();
      expect(exam.signedBy).toBeNull();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:examination.create",
        "examination",
        exam.id,
        "create",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({ status: "in_progress" }),
      );
    });

    it("cross-tenant appointment → 404 VET-CLINIC-0001", async () => {
      await expect(
        service.start(
          TENANT_A,
          validInput({ appointmentId: APPT_ID_B }),
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
  // findById — tenant izolasyonu
  // -------------------------------------------------------------------------

  describe("findById", () => {
    it("kendi tenant'ından okur", async () => {
      const created = await service.start(TENANT_A, validInput(), VET_A);
      const found = await service.findById(TENANT_A, created.id, VET_A);
      expect(found?.id).toBe(created.id);
    });

    it("cross-tenant → null", async () => {
      const created = await service.start(TENANT_A, validInput(), VET_A);
      const found = await service.findById(TENANT_B, created.id, VET_B);
      expect(found).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  describe("list", () => {
    beforeEach(async () => {
      await service.start(
        TENANT_A,
        validInput({ type: "consultation" }),
        VET_A,
      );
      // ikinci appointment oluştur
      const appt2 = "appt-cccc-cccc-cccc-cccccccccccc";
      seedAppointment(TENANT_A, appt2, PATIENT_ID_A, VET_USER_ID_A);
      await service.start(
        TENANT_A,
        validInput({ appointmentId: appt2, type: "follow_up" }),
        VET_A,
      );
    });

    it("status filtresi", async () => {
      const r = await service.list(
        TENANT_A,
        { status: "in_progress", limit: 20, offset: 0 },
        VET_A,
      );
      expect(r.total).toBe(2);
      expect(r.items.every((e) => e.status === "in_progress")).toBe(true);
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
  // complete
  // -------------------------------------------------------------------------

  describe("complete", () => {
    it("status=completed + completedAt set + audit.update (info)", async () => {
      const created = await service.start(TENANT_A, validInput(), VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const completed = await service.complete(TENANT_A, created.id, VET_A);
      expect(completed.status).toBe("completed");
      expect(completed.completedAt).toBeTruthy();
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:examination.update",
        "examination",
        created.id,
        "update",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.any(Object),
      );
    });

    it("in_progress değilse → 409 VET-EXAM-0001", async () => {
      const created = await service.start(TENANT_A, validInput(), VET_A);
      await service.complete(TENANT_A, created.id, VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await expect(
        service.complete(TENANT_A, created.id, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-EXAM-0001",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // sign
  // -------------------------------------------------------------------------

  describe("sign", () => {
    it("signedAt + signedBy set + audit.sign (info)", async () => {
      const created = await service.start(TENANT_A, validInput(), VET_A);
      await service.complete(TENANT_A, created.id, VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const signed = await service.sign(TENANT_A, created.id, VET_A);
      expect(signed.signedAt).toBeTruthy();
      expect(signed.signedBy).toBe("usr-vet-a");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:examination.sign",
        "examination",
        created.id,
        "sign",
        expect.any(Object),
        "info",
        expect.objectContaining({ signedBy: "usr-vet-a" }),
      );
    });

    it("zaten imzalı → 409 VET-EXAM-0002", async () => {
      const created = await service.start(TENANT_A, validInput(), VET_A);
      await service.complete(TENANT_A, created.id, VET_A);
      await service.sign(TENANT_A, created.id, VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await expect(
        service.sign(TENANT_A, created.id, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-EXAM-0002",
        httpStatus: 409,
      });
    });

    it("completed değilse (in_progress) → 409 VET-EXAM-0002", async () => {
      const created = await service.start(TENANT_A, validInput(), VET_A);
      await expect(
        service.sign(TENANT_A, created.id, VET_A),
      ).rejects.toMatchObject({
        errorCode: "VET-EXAM-0002",
        httpStatus: 409,
      });
    });
  });

  // -------------------------------------------------------------------------
  // amend
  // -------------------------------------------------------------------------

  describe("amend", () => {
    it("status=amended + ExaminationAmend kaydı + audit.amend (warning)", async () => {
      const created = await service.start(TENANT_A, validInput(), VET_A);
      await service.complete(TENANT_A, created.id, VET_A);
      await service.sign(TENANT_A, created.id, VET_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();

      const amended = await service.amend(
        TENANT_A,
        created.id,
        { reason: "Yanlış teşhis düzeltme" },
        VET_A,
      );
      expect(amended.status).toBe("amended");

      const amendList = await service.listAmends(TENANT_A, created.id, VET_A);
      expect(amendList).toHaveLength(1);
      expect(amendList[0]?.reason).toBe("Yanlış teşhis düzeltme");
      expect(amendList[0]?.amendedBy).toBe("usr-vet-a");
      expect(amendList[0]?.previousSignedBy).toBe("usr-vet-a");

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:examination.amend",
        "examination",
        created.id,
        "amend",
        expect.any(Object),
        "warning",
        expect.objectContaining({ reason: "Yanlış teşhis düzeltme" }),
      );
    });
  });
});
