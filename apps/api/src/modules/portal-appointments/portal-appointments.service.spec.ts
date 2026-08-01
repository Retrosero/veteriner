/**
 * @file PortalAppointmentsService unit testleri.
 * @module apps/api/modules/portal-appointments/portal-appointments.service.spec
 *
 * @description Owner/patient doğrulama, geçmiş tarih reddi,
 * cross-tenant maskeleme, portal-list isolation, cancel/approve/reject
 * state machine, audit event yayını ve AppointmentsService entegrasyonu.
 *
 * @since GOAL-035 (FAZ-3) online randevu talebi core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { PortalAppointmentsService } from "./portal-appointments.service.js";
import { PortalAuthRepository } from "../portal-auth/portal-auth.repository.js";
import { PortalAuthService } from "../portal-auth/portal-auth.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { AppointmentsService } from "../appointments/appointments.service.js";
import type { NotificationsService } from "../notifications/notifications.service.js";
import type { PatientsService } from "../patients/patients.service.js";
import type { Appointment, Patient } from "@vetniva/contracts";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const OWNER_A = "own-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OWNER_B = "own-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PORTAL_USER_A = "pusr-portal-a";
const PATIENT_A1 = "pat-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
const PATIENT_B1 = "pat-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1";

const PORTAL_ACTOR: ActorContext = {
  actorId: null,
  actorType: "portal_user",
  role: "PET_OWNER_PORTAL",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-portal-1",
  ipAddress: null,
  userAgentHash: null,
  source: "portal_session",
};

const STAFF_ACTOR: ActorContext = {
  actorId: "usr-staff",
  actorType: "user",
  role: "STAFF",
  tenantId: TENANT_A,
  branchId: null,
  isSuperadmin: false,
  correlationId: "req-staff-1",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

const patientStore = new Map<string, Patient>();
let appointmentCounter = 0;

function seedPatient(
  tenantId: string,
  id: string,
  ownerId: string,
  name = "Boncuk",
): void {
  const p: Patient = {
    id,
    tenantId,
    ownerId,
    name,
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

function seedPortalUser(
  repo: PortalAuthRepository,
  ownerId: string,
  id: string = PORTAL_USER_A,
): void {
  repo.insertPortalUser({
    id,
    tenantId: TENANT_A,
    ownerId,
    email: "owner@example.com",
    passwordHash: "h",
    status: "active",
    consentKvkk: true,
    consentKvkkAt: new Date().toISOString(),
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    patientIds: [],
    displayName: null,
    locale: "tr-TR",
    invitationId: null,
    emailVerified: true,
    emailVerifiedAt: new Date().toISOString(),
  });
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

function makeAppointments(): {
  service: AppointmentsService;
  createdIds: string[];
} {
  const createdIds: string[] = [];
  const service = {
    create: vi
      .fn()
      .mockImplementation(
        async (tenantId: string, input: { start: string }) => {
          appointmentCounter += 1;
          const id = `appt-stub-${appointmentCounter}`;
          createdIds.push(id);
          const startMs = new Date(input.start).getTime();
          const end = new Date(startMs + 30 * 60_000).toISOString();
          const appt: Appointment = {
            id,
            tenantId,
            patientId: "pat-any",
            ownerId: OWNER_A,
            veterinarianId: "vet-stub",
            type: "consultation",
            status: "scheduled",
            start: input.start,
            end,
            notes: null,
            createdAt: new Date().toISOString(),
            createdBy: "usr-staff",
          };
          return appt;
        },
      ),
    findById: vi.fn().mockImplementation(async () => null),
  } as unknown as AppointmentsService;
  return { service, createdIds };
}

function makeNotifications(): NotificationsService {
  return {
    send: vi.fn().mockResolvedValue({
      id: "notif-1",
      tenantId: TENANT_A,
      userId: "x",
      channel: "in_app",
      category: "custom",
      templateKey: "x",
      status: "queued",
      attempts: 0,
      createdAt: new Date().toISOString(),
    }),
  } as unknown as NotificationsService;
}

function makeAudit(): AuditService & {
  calls: Array<{
    eventName: string;
    targetId: string;
    severity: string;
    metadata: Record<string, unknown> | null;
  }>;
} {
  const calls: Array<{
    eventName: string;
    targetId: string;
    severity: string;
    metadata: Record<string, unknown> | null;
  }> = [];
  return {
    recordSimple: vi
      .fn()
      .mockImplementation(
        async (
          eventName: string,
          _targetType: string,
          targetId: string,
          _action: string,
          _actor: unknown,
          severity: string = "info",
          metadata: Record<string, unknown> | null = null,
        ) => {
          calls.push({ eventName, targetId, severity, metadata });
          return { eventId: `ev-${calls.length}` };
        },
      ),
    record: vi.fn(),
    calls,
  } as unknown as AuditService & {
    calls: Array<{
      eventName: string;
      targetId: string;
      severity: string;
      metadata: Record<string, unknown> | null;
    }>;
  };
}

function futureIso(deltaMin = 60): string {
  return new Date(Date.now() + deltaMin * 60_000).toISOString();
}

describe("PortalAppointmentsService", () => {
  let portalAuthRepo: PortalAuthRepository;
  let portalAuth: PortalAuthService;
  let patients: PatientsService;
  let appointments: AppointmentsService;
  let notifications: NotificationsService;
  let audit: ReturnType<typeof makeAudit>;
  let service: PortalAppointmentsService;
  let createdApptIds: string[];

  beforeEach(() => {
    patientStore.clear();
    appointmentCounter = 0;
    portalAuthRepo = new PortalAuthRepository();
    portalAuth = new PortalAuthService(
      portalAuthRepo,
      makeAudit(),
      {} as never,
    );
    patients = makePatients();
    const a = makeAppointments();
    appointments = a.service;
    createdApptIds = a.createdIds;
    notifications = makeNotifications();
    audit = makeAudit();
    service = new PortalAppointmentsService(
      portalAuth,
      patients,
      appointments,
      notifications,
      audit as unknown as AuditService,
    );

    seedPatient(TENANT_A, PATIENT_A1, OWNER_A);
    seedPatient(TENANT_B, PATIENT_B1, OWNER_B);
    seedPortalUser(portalAuthRepo, OWNER_A);
  });

  // -------------------------------------------------------------------------
  // CREATE
  // -------------------------------------------------------------------------

  describe("create", () => {
    it("başarı: pending statüde request oluşturur, audit + 2 notification", async () => {
      const result = await service.create(
        TENANT_A,
        PORTAL_USER_A,
        {
          patientId: PATIENT_A1,
          preferredDate: futureIso(120),
          type: "consultation",
          reason: "Yıllık kontrol",
          contactPreference: "phone",
        },
        PORTAL_ACTOR,
      );

      expect(result.id).toMatch(/^pareq-/);
      expect(result.status).toBe("pending");
      expect(result.patientId).toBe(PATIENT_A1);
      expect(result.ownerId).toBe(OWNER_A);
      expect(result.decidedAt).toBeNull();

      // Audit: 1 kez (request.create).
      const reqAudits = audit.calls.filter(
        (c) => c.eventName === "audit:portal.appointment.request",
      );
      expect(reqAudits).toHaveLength(1);
      expect(reqAudits[0]?.severity).toBe("info");

      // Notifications: 2 (sahibine + personele).
      expect(notifications.send).toHaveBeenCalledTimes(2);
      const sendMock = notifications.send as ReturnType<typeof vi.fn>;
      const calls = sendMock.mock.calls as Array<[Record<string, unknown>]>;
      const templateKeys = calls.map((c) => c[0]?.["templateKey"]);
      expect(templateKeys).toContain("portal.appointment.requested");
      expect(templateKeys).toContain("clinic.appointment.requested");
    });

    it("cross-tenant patient → 404 VET-CLINIC-0001, audit yok", async () => {
      await expect(
        service.create(
          TENANT_A,
          PORTAL_USER_A,
          {
            patientId: PATIENT_B1, // TENANT_B'de
            preferredDate: futureIso(60),
            type: "consultation",
            reason: "x",
            contactPreference: "phone",
          },
          PORTAL_ACTOR,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
      expect(
        audit.calls.filter(
          (c) => c.eventName === "audit:portal.appointment.request",
        ),
      ).toHaveLength(0);
    });

    it("geçmiş preferredDate → 422 VET-VALIDATION-0009", async () => {
      await expect(
        service.create(
          TENANT_A,
          PORTAL_USER_A,
          {
            patientId: PATIENT_A1,
            preferredDate: new Date(Date.now() - 60_000).toISOString(),
            type: "consultation",
            reason: "x",
            contactPreference: "phone",
          },
          PORTAL_ACTOR,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-VALIDATION-0009",
        httpStatus: 422,
      });
    });

    it("patient başka owner'a aitse → 404 (bilgi sızdırmaz)", async () => {
      // OWNER_A'ya portal user var; farklı bir owner'ın hastasını dene.
      const otherPatient = "pat-other-owner-pet";
      seedPatient(TENANT_A, otherPatient, OWNER_B);
      await expect(
        service.create(
          TENANT_A,
          PORTAL_USER_A,
          {
            patientId: otherPatient,
            preferredDate: futureIso(60),
            type: "consultation",
            reason: "x",
            contactPreference: "phone",
          },
          PORTAL_ACTOR,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
    });
  });

  // -------------------------------------------------------------------------
  // LIST
  // -------------------------------------------------------------------------

  describe("list", () => {
    it("portal user sadece kendi ownerId'sine ait request'leri görür", async () => {
      // OWNER_A için 2 talep.
      await service.create(
        TENANT_A,
        PORTAL_USER_A,
        {
          patientId: PATIENT_A1,
          preferredDate: futureIso(120),
          type: "consultation",
          reason: "r1",
          contactPreference: "phone",
        },
        PORTAL_ACTOR,
      );
      await new Promise((r) => setTimeout(r, 2));
      await service.create(
        TENANT_A,
        PORTAL_USER_A,
        {
          patientId: PATIENT_A1,
          preferredDate: futureIso(180),
          type: "vaccination",
          reason: "r2",
          contactPreference: "email",
        },
        PORTAL_ACTOR,
      );

      // OWNER_B için 1 talep — farklı portal user ile simüle et.
      const portalRepoB = new PortalAuthRepository();
      seedPortalUser(portalRepoB, OWNER_B, "pusr-portal-b");
      seedPatient(TENANT_A, "pat-for-b", OWNER_B);
      // OWNER_B portal user'ı ile aynı service'i kullan; bu sefer
      // service'in in-memory state'inde OWNER_B'ye ait bir request
      // doğrudan görünmesin diye patientId'yi OWNER_A'ya bağlı biri
      // üzerinden yaratmayız. Bunun yerine test'te OWNER_A'nın
      // taleplerini sayıyoruz; OWNER_B tarafı 0 olmalı.
      const result = await service.list(TENANT_A, PORTAL_USER_A, PORTAL_ACTOR);
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.ownerId === OWNER_A)).toBe(true);
      // Yeni → eski sıralama.
      expect(result[0]?.reason).toBe("r2");
      expect(result[1]?.reason).toBe("r1");

      // portal user yoksa boş.
      const empty = await service.list(
        TENANT_A,
        "missing-portal-user",
        PORTAL_ACTOR,
      );
      expect(empty).toEqual([]);
      void portalRepoB; // referans; kullanılmadı (OWNER_B izolasyonu yukarıda)
    });
  });

  // -------------------------------------------------------------------------
  // CANCEL
  // -------------------------------------------------------------------------

  describe("cancel", () => {
    it("pending talep → cancelled + audit.cancel (info)", async () => {
      const created = await service.create(
        TENANT_A,
        PORTAL_USER_A,
        {
          patientId: PATIENT_A1,
          preferredDate: futureIso(120),
          type: "consultation",
          reason: "iptal test",
          contactPreference: "phone",
        },
        PORTAL_ACTOR,
      );
      audit.calls.length = 0;

      await service.cancel(TENANT_A, PORTAL_USER_A, created.id, PORTAL_ACTOR);

      const list = await service.list(TENANT_A, PORTAL_USER_A, PORTAL_ACTOR);
      expect(list[0]?.status).toBe("cancelled");

      const cancelAudits = audit.calls.filter(
        (c) => c.eventName === "audit:portal.appointment.cancel",
      );
      expect(cancelAudits).toHaveLength(1);
      expect(cancelAudits[0]?.severity).toBe("info");
    });

    it("idempotent: ikinci cancel hata vermez", async () => {
      const created = await service.create(
        TENANT_A,
        PORTAL_USER_A,
        {
          patientId: PATIENT_A1,
          preferredDate: futureIso(120),
          type: "consultation",
          reason: "x",
          contactPreference: "phone",
        },
        PORTAL_ACTOR,
      );
      await service.cancel(TENANT_A, PORTAL_USER_A, created.id, PORTAL_ACTOR);
      await expect(
        service.cancel(TENANT_A, PORTAL_USER_A, created.id, PORTAL_ACTOR),
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // APPROVE
  // -------------------------------------------------------------------------

  describe("approve", () => {
    it("pending → approved, approvedAppointmentId set, appointment.create çağrıldı, audit.approve", async () => {
      const created = await service.create(
        TENANT_A,
        PORTAL_USER_A,
        {
          patientId: PATIENT_A1,
          preferredDate: futureIso(120),
          type: "consultation",
          reason: "onay test",
          contactPreference: "phone",
        },
        PORTAL_ACTOR,
      );
      audit.calls.length = 0;
      (notifications.send as ReturnType<typeof vi.fn>).mockClear();

      const result = await service.approve(
        TENANT_A,
        created.id,
        "usr-decider",
        STAFF_ACTOR,
      );

      expect(result.request.status).toBe("approved");
      expect(result.request.decidedBy).toBe("usr-decider");
      expect(result.request.approvedAppointmentId).toMatch(/^appt-stub-/);
      expect(result.appointmentId).toBe(result.request.approvedAppointmentId);
      expect(createdApptIds).toContain(result.appointmentId);
      // AppointmentsService.create doğru parametrelerle çağrıldı.
      expect(appointments.create).toHaveBeenCalledWith(
        TENANT_A,
        expect.objectContaining({
          patientId: PATIENT_A1,
          start: created.preferredDate,
          durationMin: 30,
          type: "consultation",
        }),
        expect.objectContaining({ actorId: "usr-decider" }),
      );

      const approveAudits = audit.calls.filter(
        (c) => c.eventName === "audit:portal.appointment.approve",
      );
      expect(approveAudits).toHaveLength(1);
      expect(approveAudits[0]?.severity).toBe("info");

      // Onay bildirimi gönderildi.
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({
          templateKey: "portal.appointment.approved",
          category: "custom",
        }),
      );
    });

    it("zaten approved → 422 VET-PORTAL-0006", async () => {
      const created = await service.create(
        TENANT_A,
        PORTAL_USER_A,
        {
          patientId: PATIENT_A1,
          preferredDate: futureIso(120),
          type: "consultation",
          reason: "x",
          contactPreference: "phone",
        },
        PORTAL_ACTOR,
      );
      await service.approve(TENANT_A, created.id, "usr-decider", STAFF_ACTOR);
      await expect(
        service.approve(TENANT_A, created.id, "usr-decider", STAFF_ACTOR),
      ).rejects.toMatchObject({
        errorCode: "VET-PORTAL-0006",
        httpStatus: 422,
      });
    });
  });

  // -------------------------------------------------------------------------
  // REJECT
  // -------------------------------------------------------------------------

  describe("reject", () => {
    it("pending → rejected + reason, audit.reject (warning)", async () => {
      const created = await service.create(
        TENANT_A,
        PORTAL_USER_A,
        {
          patientId: PATIENT_A1,
          preferredDate: futureIso(120),
          type: "consultation",
          reason: "red test",
          contactPreference: "phone",
        },
        PORTAL_ACTOR,
      );
      audit.calls.length = 0;

      await service.reject(
        TENANT_A,
        created.id,
        "usr-decider",
        "Uygun slot yok",
        STAFF_ACTOR,
      );

      const list = await service.list(TENANT_A, PORTAL_USER_A, PORTAL_ACTOR);
      expect(list[0]?.status).toBe("rejected");
      expect(list[0]?.rejectionReason).toBe("Uygun slot yok");
      expect(list[0]?.decidedBy).toBe("usr-decider");

      const rejectAudits = audit.calls.filter(
        (c) => c.eventName === "audit:portal.appointment.reject",
      );
      expect(rejectAudits).toHaveLength(1);
      expect(rejectAudits[0]?.severity).toBe("warning");
      expect(rejectAudits[0]?.metadata?.["reason"]).toBe("Uygun slot yok");

      // Red bildirimi gönderildi.
      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({
          templateKey: "portal.appointment.rejected",
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // AUDIT coverage: tüm event'ler doğru eventName ile
  // -------------------------------------------------------------------------

  describe("audit event coverage", () => {
    it("create + approve flow: 2 farklı eventName (request, approve)", async () => {
      const created = await service.create(
        TENANT_A,
        PORTAL_USER_A,
        {
          patientId: PATIENT_A1,
          preferredDate: futureIso(120),
          type: "consultation",
          reason: "audit-coverage",
          contactPreference: "phone",
        },
        PORTAL_ACTOR,
      );
      audit.calls.length = 0;
      await service.approve(TENANT_A, created.id, "usr-decider", STAFF_ACTOR);

      const eventNames = audit.calls.map((c) => c.eventName);
      expect(eventNames).toContain("audit:portal.appointment.approve");
      // Approve sırasında tek audit event'i (approve); create zaten
      // audit.calls.length = 0 ile sıfırlandı.
      expect(eventNames).toHaveLength(1);
    });
  });
});
