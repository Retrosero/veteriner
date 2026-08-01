/**
 * @file FollowupsService unit testleri.
 * @module apps/api/modules/followups/followups.service.spec
 *
 * @description Muayene/reçeteden kontrol randevusu türetme (success
 * + cross-tenant 404 + past date 422), listPending (gelecek filtre),
 * audit event yayını. DB migration olmadığı için mock'larla
 * (AppointmentsService, ExaminationsService, PrescriptionsService)
 * çalışılır.
 *
 * @since GOAL-046 (FAZ-4) kontrol randevusu core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { FollowupsService } from "./followups.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { AppointmentsService } from "../appointments/appointments.service.js";
import type { ExaminationsService } from "../examinations/examinations.service.js";
import type { PrescriptionsService } from "../prescriptions/prescriptions.service.js";
import type {
  Appointment,
  Examination,
  Prescription,
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

const EXAM_ID_A = "exam-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EXAM_ID_B = "exam-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PRSC_ID_A = "prsc-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PRSC_ID_B = "prsc-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PATIENT_ID_A = "33333333-3333-3333-3333-333333333333";
const VET_USER_ID_A = "vet-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const VET_USER_ID_OVERRIDE = "vet-override-1111-1111-111111111111";

/** Gelecekte bir tarih (1 gün sonrası, saat 10:00 UTC). */
function futureStart(plusDays = 2): string {
  const d = new Date(Date.now() + plusDays * 24 * 60 * 60 * 1000);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(10);
  return d.toISOString();
}

/** Geçmişte bir tarih (1 gün öncesi). */
function pastStart(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(10);
  return d.toISOString();
}

/** Mock exam store. */
const examStore = new Map<string, Examination>();
function seedExam(
  tenantId: string,
  id: string,
  patientId: string,
  vetId: string,
): void {
  const e: Examination = {
    id,
    tenantId,
    patientId,
    veterinarianId: vetId,
    appointmentId: "appt-1",
    status: "completed",
    type: "consultation",
    chiefComplaint: "Test",
    startedAt: "2025-01-01T10:00:00.000Z",
    completedAt: "2025-01-01T10:30:00.000Z",
    signedAt: "2025-01-01T10:35:00.000Z",
    signedBy: vetId,
    createdAt: "2025-01-01T10:00:00.000Z",
    updatedAt: "2025-01-01T10:35:00.000Z",
  };
  examStore.set(`${tenantId}|${id}`, e);
}

/** Mock prescription store. */
const prscStore = new Map<string, Prescription>();
function seedPrsc(
  tenantId: string,
  id: string,
  patientId: string,
  vetId: string,
  examinationId: string,
): void {
  const p: Prescription = {
    id,
    tenantId,
    examinationId,
    patientId,
    veterinarianId: vetId,
    items: [
      {
        drugName: "Amoksisilin",
        dosage: "50 mg",
        frequency: "twice_daily",
        durationDays: 7,
        route: "oral",
        instructions: "Yemekten sonra",
      },
    ],
    notes: "Test",
    status: "active",
    prescribedAt: "2025-01-01T10:00:00.000Z",
    expiresAt: "2025-01-08T10:00:00.000Z",
    dispensedAt: null,
    dispensedBy: null,
    cancelReason: null,
    createdAt: "2025-01-01T10:00:00.000Z",
    updatedAt: "2025-01-01T10:00:00.000Z",
  };
  prscStore.set(`${tenantId}|${id}`, p);
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

function makePrescriptions(): PrescriptionsService {
  return {
    findById: vi
      .fn()
      .mockImplementation(
        async (tenantId: string, id: string) =>
          prscStore.get(`${tenantId}|${id}`) ?? null,
      ),
  } as unknown as PrescriptionsService;
}

function makeAppointments(): {
  appointments: AppointmentsService;
  created: Appointment[];
  listedItems: Appointment[];
} {
  const created: Appointment[] = [];
  const listedItems: Appointment[] = [];
  const appointments = {
    create: vi.fn().mockImplementation(
      async (
        _tenantId: string,
        input: {
          patientId: string;
          veterinarianId: string;
          type: Appointment["type"];
          start: string;
          durationMin: number;
          notes?: string;
        },
      ): Promise<Appointment> => {
        const id = `appt-${String(created.length + 1).padStart(6, "0")}`;
        const end = new Date(
          new Date(input.start).getTime() + input.durationMin * 60_000,
        ).toISOString();
        const appt: Appointment = {
          id,
          tenantId: _tenantId,
          patientId: input.patientId,
          ownerId: "own-1",
          veterinarianId: input.veterinarianId,
          type: input.type,
          status: "scheduled",
          start: input.start,
          end,
          notes: input.notes ?? null,
          createdAt: new Date().toISOString(),
          createdBy: "usr-vet-a",
        };
        created.push(appt);
        return appt;
      },
    ),
    list: vi.fn().mockImplementation(
      async (
        _tenantId: string,
        filters: {
          patientId?: string;
          status?: Appointment["status"];
          from?: string;
        },
      ) => {
        const filtered = listedItems.filter((a) => {
          if (filters.patientId && a.patientId !== filters.patientId)
            return false;
          if (filters.status && a.status !== filters.status) return false;
          if (filters.from && a.start < filters.from) return false;
          return true;
        });
        return { items: filtered, total: filtered.length };
      },
    ),
  } as unknown as AppointmentsService;
  return { appointments, created, listedItems };
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

describe("FollowupsService", () => {
  let service: FollowupsService;
  let appointments: AppointmentsService;
  let created: Appointment[];
  let listedItems: Appointment[];
  let examinations: ExaminationsService;
  let prescriptions: PrescriptionsService;
  let audit: AuditService;

  beforeEach(() => {
    examStore.clear();
    prscStore.clear();
    seedExam(TENANT_A, EXAM_ID_A, PATIENT_ID_A, VET_USER_ID_A);
    seedExam(TENANT_B, EXAM_ID_B, PATIENT_ID_A, VET_USER_ID_A);
    seedPrsc(TENANT_A, PRSC_ID_A, PATIENT_ID_A, VET_USER_ID_A, EXAM_ID_A);
    seedPrsc(TENANT_B, PRSC_ID_B, PATIENT_ID_A, VET_USER_ID_A, EXAM_ID_B);
    const a = makeAppointments();
    appointments = a.appointments;
    created = a.created;
    listedItems = a.listedItems;
    examinations = makeExaminations();
    prescriptions = makePrescriptions();
    audit = makeAudit();
    service = new FollowupsService(
      appointments,
      examinations,
      prescriptions,
      audit,
    );
  });

  // -------------------------------------------------------------------------
  // scheduleFromExamination
  // -------------------------------------------------------------------------

  describe("scheduleFromExamination", () => {
    it("başarı: type=follow_up + patient+vet examination'dan + audit", async () => {
      const appt = await service.scheduleFromExamination(
        TENANT_A,
        EXAM_ID_A,
        futureStart(2),
        undefined,
        "Yara kontrolü",
        VET_A,
      );

      expect(appt.type).toBe("follow_up");
      expect(appt.patientId).toBe(PATIENT_ID_A);
      expect(appt.veterinarianId).toBe(VET_USER_ID_A);
      expect(appt.notes).toBe("[Kontrol Randevusu] Yara kontrolü");
      expect(appt.start).toBe(futureStart(2));
      expect(appt.end).toBe(
        new Date(
          new Date(futureStart(2)).getTime() + 30 * 60_000,
        ).toISOString(),
      );

      // AppointmentsService.create doğru parametrelerle çağrıldı.
      expect(appointments.create).toHaveBeenCalledWith(
        TENANT_A,
        expect.objectContaining({
          patientId: PATIENT_ID_A,
          veterinarianId: VET_USER_ID_A,
          type: "follow_up",
          durationMin: 30,
        }),
        VET_A,
      );

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:followup.create",
        "appointment",
        appt.id,
        "create",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({
          source: "examination",
          examinationId: EXAM_ID_A,
          prescriptionId: null,
          patientId: PATIENT_ID_A,
          veterinarianId: VET_USER_ID_A,
          type: "follow_up",
        }),
      );
    });

    it("veterinarianId override → override kullanılır", async () => {
      const appt = await service.scheduleFromExamination(
        TENANT_A,
        EXAM_ID_A,
        futureStart(3),
        VET_USER_ID_OVERRIDE,
        undefined,
        VET_A,
      );
      expect(appt.veterinarianId).toBe(VET_USER_ID_OVERRIDE);
      expect(appt.notes).toBe("[Kontrol Randevusu]");
    });

    it("cross-tenant (tenantB'den examA isteği) → 404 VET-CLINIC-0001", async () => {
      await expect(
        service.scheduleFromExamination(
          TENANT_B,
          EXAM_ID_A,
          futureStart(2),
          undefined,
          undefined,
          VET_B,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
      // Hiç appointment oluşturulmadı, audit çağrılmadı.
      expect(created).toHaveLength(0);
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });

    it("geçmiş tarih → 422 VET-VALIDATION-0009", async () => {
      await expect(
        service.scheduleFromExamination(
          TENANT_A,
          EXAM_ID_A,
          pastStart(),
          undefined,
          undefined,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0009",
        httpStatus: 422,
      });
      expect(created).toHaveLength(0);
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // scheduleFromPrescription
  // -------------------------------------------------------------------------

  describe("scheduleFromPrescription", () => {
    it("başarı: patient+vet prescription'dan + audit", async () => {
      const appt = await service.scheduleFromPrescription(
        TENANT_A,
        PRSC_ID_A,
        futureStart(2),
        "İlaç kontrolü",
        VET_A,
      );

      expect(appt.type).toBe("follow_up");
      expect(appt.patientId).toBe(PATIENT_ID_A);
      expect(appt.veterinarianId).toBe(VET_USER_ID_A);
      expect(appt.notes).toBe("[Kontrol Randevusu] İlaç kontrolü");

      expect(appointments.create).toHaveBeenCalledWith(
        TENANT_A,
        expect.objectContaining({
          patientId: PATIENT_ID_A,
          veterinarianId: VET_USER_ID_A,
          type: "follow_up",
          durationMin: 30,
        }),
        VET_A,
      );

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:followup.create",
        "appointment",
        appt.id,
        "create",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({
          source: "prescription",
          prescriptionId: PRSC_ID_A,
          examinationId: EXAM_ID_A,
          type: "follow_up",
        }),
      );
    });

    it("cross-tenant (tenantB'den prscA) → 404 VET-CLINIC-0001", async () => {
      await expect(
        service.scheduleFromPrescription(
          TENANT_B,
          PRSC_ID_A,
          futureStart(2),
          undefined,
          VET_B,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
      expect(created).toHaveLength(0);
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });

    it("geçmiş tarih → 422 VET-VALIDATION-0009", async () => {
      await expect(
        service.scheduleFromPrescription(
          TENANT_A,
          PRSC_ID_A,
          pastStart(),
          undefined,
          VET_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0009",
        httpStatus: 422,
      });
      expect(created).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // listPending
  // -------------------------------------------------------------------------

  describe("listPending", () => {
    it("status=scheduled + type=follow_up + gelecekte olanlar", async () => {
      const futureAppt: Appointment = {
        id: "appt-future-1",
        tenantId: TENANT_A,
        patientId: PATIENT_ID_A,
        ownerId: "own-1",
        veterinarianId: VET_USER_ID_A,
        type: "follow_up",
        status: "scheduled",
        start: futureStart(5),
        end: new Date(
          new Date(futureStart(5)).getTime() + 30 * 60_000,
        ).toISOString(),
        notes: null,
        createdAt: new Date().toISOString(),
        createdBy: "usr-vet-a",
      };
      const pastAppt: Appointment = {
        ...futureAppt,
        id: "appt-past-1",
        start: pastStart(),
        end: pastStart(),
      };
      const consultationAppt: Appointment = {
        ...futureAppt,
        id: "appt-consult-1",
        type: "consultation",
      };
      const cancelledAppt: Appointment = {
        ...futureAppt,
        id: "appt-cancel-1",
        status: "cancelled",
      };

      listedItems.push(pastAppt, futureAppt, consultationAppt, cancelledAppt);

      const result = await service.listPending(TENANT_A, PATIENT_ID_A, VET_A);

      // Sadece follow_up + scheduled + gelecek.
      expect(result).toHaveLength(1);
      const first = result[0];
      expect(first).toBeDefined();
      expect(first!.id).toBe("appt-future-1");

      // appointments.list doğru filtrelerle çağrıldı.
      expect(appointments.list).toHaveBeenCalledWith(
        TENANT_A,
        expect.objectContaining({
          patientId: PATIENT_ID_A,
          status: "scheduled",
        }),
        VET_A,
      );
    });

    it("boş liste döner (kayıt yok)", async () => {
      const result = await service.listPending(TENANT_A, PATIENT_ID_A, VET_A);
      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting
  // -------------------------------------------------------------------------

  it("tenant scope uyuşmazlığı → 403 VET-AUTHZ-0001", async () => {
    // VET_B, TENANT_B tenantId'ye sahip; TENANT_A kaynağına erişemez.
    await expect(
      service.listPending(TENANT_A, PATIENT_ID_A, VET_B),
    ).rejects.toMatchObject({
      errorCode: "VET-AUTHZ-0001",
      httpStatus: 403,
    });
  });

  it("audit: her başarılı scheduleFromExamination 1 kez audit:followup.create", async () => {
    await service.scheduleFromExamination(
      TENANT_A,
      EXAM_ID_A,
      futureStart(2),
      undefined,
      undefined,
      VET_A,
    );
    await service.scheduleFromExamination(
      TENANT_A,
      EXAM_ID_A,
      futureStart(3),
      undefined,
      undefined,
      VET_A,
    );
    const calls = (audit.recordSimple as ReturnType<typeof vi.fn>).mock.calls;
    const followupCalls = calls.filter((c) => c[0] === "audit:followup.create");
    expect(followupCalls).toHaveLength(2);
  });
});
