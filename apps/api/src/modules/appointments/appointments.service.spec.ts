/**
 * @file AppointmentsService unit testleri.
 * @module apps/api/modules/appointments/appointments.service.spec
 * @description Hasta cross-tenant, gelecekte olmayan start, slot
 * çakışması (booked + blocked), duration validasyonu, findById
 * tenant izolasyonu, list filtre, update çakışma, cancel /
 * complete / no_show state machine ve audit event yayını.
 * @since GOAL-031 (FAZ-3) randevu oluşturma core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppointmentsRepository } from "./appointments.repository.js";
import { AppointmentsService } from "./appointments.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { Patient } from "../../common/patients/patient.types.js";
import type { CalendarService } from "../calendar/calendar.service.js";
import type { PatientsService } from "../patients/patients.service.js";

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

const PATIENT_ID_A = "33333333-3333-3333-3333-333333333333";
const PATIENT_ID_B = "44444444-4444-4444-4444-444444444444";
const VET_ID = "vet-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** Mock patient store. */
const patientStore = new Map<string, Patient>();

/**
 *
 * @param tenantId
 * @param id
 * @param ownerId
 */
function seedPatient(tenantId: string, id: string, ownerId: string): void {
  const p: Patient = {
    id,
    tenantId,
    ownerId,
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

/**
 *
 */
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

/**
 *
 */
function makeCalendar(): CalendarService {
  return {
    checkAvailability: vi.fn().mockReturnValue({
      available: true,
      reason: null,
      conflictId: null,
    }),
    bookSlot: vi.fn(),
    releaseSlot: vi.fn().mockReturnValue(true),
  } as unknown as CalendarService;
}

/**
 *
 */
function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

/**
 * Yarından 1 saat sonrası, ISO.
 * @param plusDays
 */
function futureStart(plusDays = 1): string {
  const d = new Date(Date.now() + plusDays * 24 * 60 * 60 * 1000);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(10); // 10:00 UTC
  return d.toISOString();
}

/**
 *
 * @param overrides
 */
function validInput(
  overrides: Partial<{
    patientId: string;
    veterinarianId: string;
    type:
      | "consultation"
      | "vaccination"
      | "surgery"
      | "follow_up"
      | "lab_visit"
      | "grooming";
    start: string;
    durationMin: number;
    notes: string;
  }> = {},
) {
  return {
    patientId: PATIENT_ID_A,
    veterinarianId: VET_ID,
    type: "consultation" as const,
    start: futureStart(1),
    durationMin: 30,
    ...overrides,
  };
}

describe("AppointmentsService", () => {
  let service: AppointmentsService;
  let repo: AppointmentsRepository;
  let calendar: CalendarService;
  let patients: PatientsService;
  let audit: AuditService;

  beforeEach(() => {
    patientStore.clear();
    seedPatient(TENANT_A, PATIENT_ID_A, "own-1");
    seedPatient(TENANT_B, PATIENT_ID_B, "own-2");
    repo = new AppointmentsRepository();
    calendar = makeCalendar();
    patients = makePatients();
    audit = makeAudit();
    service = new AppointmentsService(repo, calendar, patients, audit);
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe("create", () => {
    it("başarı: randevu oluşturur, calendar.booked + audit.create (info)", async () => {
      const appt = await service.create(TENANT_A, validInput(), STAFF_A);
      expect(appt.id).toMatch(/^appt-/);
      expect(appt.tenantId).toBe(TENANT_A);
      expect(appt.status).toBe("scheduled");
      expect(appt.start).toBe(validInput().start);
      expect(appt.end).toBe(
        new Date(
          new Date(validInput().start).getTime() + 30 * 60_000,
        ).toISOString(),
      );
      expect(appt.ownerId).toBe("own-1");
      expect(appt.createdBy).toBe("usr-staff-a");

      expect(calendar.bookSlot).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          veterinarianId: VET_ID,
          appointmentId: appt.id,
        }),
      );
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:appointment.create",
        "appointment",
        appt.id,
        "create",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.any(Object),
      );
    });

    it("cross-tenant patient → 404 VET-CLINIC-0001", async () => {
      await expect(
        service.create(
          TENANT_A,
          validInput({ patientId: PATIENT_ID_B }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
      expect(audit.recordSimple).not.toHaveBeenCalled();
      expect(calendar.bookSlot).not.toHaveBeenCalled();
    });

    it("geçmiş start → 422 VET-VALIDATION-0009", async () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await expect(
        service.create(TENANT_A, validInput({ start: past }), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0009",
        httpStatus: 422,
      });
    });

    it("slot booked çakışması → 409 VET-APPT-0005", async () => {
      (calendar.checkAvailability as ReturnType<typeof vi.fn>).mockReturnValue({
        available: false,
        reason: "booked",
        conflictId: "appt-existing",
      });
      await expect(
        service.create(TENANT_A, validInput(), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-APPT-0005",
        httpStatus: 409,
        details: { reason: "booked", conflictId: "appt-existing" },
      });
      expect(calendar.bookSlot).not.toHaveBeenCalled();
    });

    it("slot blocked çakışması → 409 VET-APPT-0005", async () => {
      (calendar.checkAvailability as ReturnType<typeof vi.fn>).mockReturnValue({
        available: false,
        reason: "blocked",
        conflictId: "blk-existing",
      });
      await expect(
        service.create(TENANT_A, validInput(), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-APPT-0005",
        httpStatus: 409,
        details: { reason: "blocked" },
      });
    });

    it("durationMin=0 → 422 VET-VALIDATION-0009", async () => {
      await expect(
        service.create(TENANT_A, validInput({ durationMin: 0 }), STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0009",
        httpStatus: 422,
      });
    });
  });

  // -------------------------------------------------------------------------
  // findById — tenant izolasyonu
  // -------------------------------------------------------------------------

  describe("findById", () => {
    it("kendi tenant'ından okur", async () => {
      const created = await service.create(TENANT_A, validInput(), STAFF_A);
      const found = await service.findById(TENANT_A, created.id, STAFF_A);
      expect(found?.id).toBe(created.id);
    });

    it("cross-tenant → null", async () => {
      const created = await service.create(TENANT_A, validInput(), STAFF_A);
      const found = await service.findById(TENANT_B, created.id, STAFF_B);
      expect(found).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  describe("list", () => {
    beforeEach(async () => {
      await service.create(TENANT_A, validInput(), STAFF_A);
      await service.create(
        TENANT_A,
        validInput({ start: futureStart(2) }),
        STAFF_A,
      );
    });

    it("patientId filtresi", async () => {
      const r = await service.list(
        TENANT_A,
        { patientId: PATIENT_ID_A, limit: 20, offset: 0 },
        STAFF_A,
      );
      expect(r.total).toBe(2);
      expect(r.items.every((a) => a.patientId === PATIENT_ID_A)).toBe(true);
    });

    it("veterinarianId filtresi yanlış eşleşme → 0", async () => {
      const r = await service.list(
        TENANT_A,
        {
          patientId: PATIENT_ID_A,
          veterinarianId: "vet-other",
          limit: 20,
          offset: 0,
        },
        STAFF_A,
      );
      expect(r.total).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe("update", () => {
    it("start değişikliği + çakışma → 409 VET-APPT-0005", async () => {
      const created = await service.create(TENANT_A, validInput(), STAFF_A);
      (calendar.checkAvailability as ReturnType<typeof vi.fn>).mockReturnValue({
        available: false,
        reason: "booked",
        conflictId: "appt-other",
      });
      await expect(
        service.update(
          TENANT_A,
          created.id,
          { start: futureStart(5) },
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-APPT-0005",
        httpStatus: 409,
      });
      // Eski booked slot compensation ile geri konmuş olmalı.
      expect(calendar.bookSlot).toHaveBeenCalledWith(
        expect.objectContaining({ start: created.start }),
      );
    });

    it("notes güncelleme → başarı + audit.update (info)", async () => {
      const created = await service.create(TENANT_A, validInput(), STAFF_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const updated = await service.update(
        TENANT_A,
        created.id,
        { notes: "Yeni not" },
        STAFF_A,
      );
      expect(updated.notes).toBe("Yeni not");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:appointment.update",
        "appointment",
        created.id,
        "update",
        expect.any(Object),
        "info",
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  describe("cancel", () => {
    it("status=cancelled + calendar.releaseSlot + audit.cancel (warning)", async () => {
      const created = await service.create(TENANT_A, validInput(), STAFF_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();

      await service.cancel(TENANT_A, created.id, "Hasta gelmedi", STAFF_A);

      const found = await service.findById(TENANT_A, created.id, STAFF_A);
      expect(found?.status).toBe("cancelled");
      expect(calendar.releaseSlot).toHaveBeenCalledWith(
        TENANT_A,
        VET_ID,
        created.start,
      );
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:appointment.cancel",
        "appointment",
        created.id,
        "cancel",
        expect.any(Object),
        "warning",
        expect.objectContaining({ reason: "Hasta gelmedi" }),
      );
    });

    it("idempotent: ikinci kez cancel hata vermez", async () => {
      const created = await service.create(TENANT_A, validInput(), STAFF_A);
      await service.cancel(TENANT_A, created.id, "x", STAFF_A);
      await expect(
        service.cancel(TENANT_A, created.id, "x", STAFF_A),
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // complete
  // -------------------------------------------------------------------------

  describe("complete", () => {
    it("status=completed + audit.complete (info)", async () => {
      const created = await service.create(TENANT_A, validInput(), STAFF_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await service.complete(TENANT_A, created.id, STAFF_A);
      const found = await service.findById(TENANT_A, created.id, STAFF_A);
      expect(found?.status).toBe("completed");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:appointment.complete",
        "appointment",
        created.id,
        "complete",
        expect.any(Object),
        "info",
        expect.any(Object),
      );
    });
  });

  // -------------------------------------------------------------------------
  // noShow
  // -------------------------------------------------------------------------

  describe("markNoShow", () => {
    it("status=no_show + audit.no_show (warning)", async () => {
      const created = await service.create(TENANT_A, validInput(), STAFF_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      await service.markNoShow(TENANT_A, created.id, STAFF_A);
      const found = await service.findById(TENANT_A, created.id, STAFF_A);
      expect(found?.status).toBe("no_show");
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:appointment.no_show",
        "appointment",
        created.id,
        "update",
        expect.any(Object),
        "warning",
        expect.any(Object),
      );
    });
  });
});
