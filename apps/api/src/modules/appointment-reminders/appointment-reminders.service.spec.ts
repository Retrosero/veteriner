/**
 * @file AppointmentRemindersService unit testleri.
 * @module apps/api/modules/appointment-reminders/appointment-reminders.service.spec
 *
 * @description schedule (success/past/missing owner/patient), cancel
 * idempotency, reschedule (forward/past/negative delta), processDue
 * (success/failure/skipped-no-snapshot), list filter, tenant
 * izolasyonu ve audit event yayını.
 *
 * @since GOAL-036 (FAZ-3) randevu hatırlatma core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  NotificationRecord,
  Owner,
  Patient,
  TenantResponse,
} from "@vetniva/contracts";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import { ConsentService } from "../../common/notifications/consent.service.js";
import type { NotificationsService } from "../notifications/notifications.service.js";
import type { OwnersService } from "../owners/owners.service.js";
import type { PatientsService } from "../patients/patients.service.js";
import type { TenantService } from "../tenant/tenant.service.js";

import { AppointmentRemindersService } from "./appointment-reminders.service.js";
import { AppointmentRemindersRepository } from "./appointment-reminders.repository.js";

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

const APPT_ID_A = "appt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PATIENT_ID_A = "pat-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OWNER_ID_A = "own-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const VET_ID = "vet-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/** Hours ahead ISO datetime. */
function futureIso(hoursAhead: number): string {
  return new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

function makeNotifications(
  impl?: (req: unknown) => Promise<NotificationRecord>,
): { service: NotificationsService; send: ReturnType<typeof vi.fn> } {
  const send = vi.fn().mockImplementation(async (req: unknown) => {
    if (impl) return impl(req);
    return {
      id: "notif-1",
      tenantId: (req as { tenantId: string }).tenantId,
      userId: (req as { userId: string }).userId,
      channel: (req as { channel: NotificationRecord["channel"] }).channel,
      category: "appointment_reminder",
      templateKey: "appointment_reminder",
      status: "sent",
      attempts: 1,
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    } satisfies NotificationRecord;
  });
  return { service: { send } as unknown as NotificationsService, send };
}

function makePatient(): Patient {
  return {
    id: PATIENT_ID_A,
    tenantId: TENANT_A,
    ownerId: OWNER_ID_A,
    name: "Boncuk",
    species: "dog",
    breed: null,
    birthDate: null,
    gender: "male",
    microchip: null,
    color: null,
    neutered: false,
    notes: null,
    createdAt: new Date().toISOString(),
    archivedAt: null,
  };
}

function makeOwner(extra: Partial<Owner> = {}): Owner {
  return {
    id: OWNER_ID_A,
    tenantId: TENANT_A,
    firstName: "Ayşe",
    lastName: "Yılmaz",
    phone: "+905551112233",
    email: "ayse@example.com",
    taxId: null,
    address: null,
    consents: { kvkk: true, marketing: true },
    createdAt: new Date().toISOString(),
    archivedAt: null,
    ...extra,
  };
}

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  const start = futureIso(48);
  const end = new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
  return {
    id: APPT_ID_A,
    tenantId: TENANT_A,
    patientId: PATIENT_ID_A,
    ownerId: OWNER_ID_A,
    veterinarianId: VET_ID,
    type: "consultation" as AppointmentType,
    status: "scheduled" as AppointmentStatus,
    start,
    end,
    notes: null,
    createdAt: new Date().toISOString(),
    createdBy: "usr-staff-a",
    ...overrides,
  };
}

function makeOwners(
  _patient: Patient | null,
  owner: Owner | null,
): OwnersService {
  return {
    findById: vi
      .fn()
      .mockImplementation(
        async (tenantId: string, id: string) =>
          owner && tenantId === owner.tenantId && id === owner.id ? owner : null,
      ),
  } as unknown as OwnersService;
}

function makePatients(patient: Patient | null): PatientsService {
  return {
    findById: vi
      .fn()
      .mockImplementation(
        async (tenantId: string, id: string) =>
          patient && tenantId === patient.tenantId && id === patient.id
            ? patient
            : null,
      ),
  } as unknown as PatientsService;
}

function makeTenants(locale: "tr-TR" | "en-GB" = "tr-TR"): TenantService {
  return {
    findById: vi
      .fn()
      .mockImplementation(
        async (id: string, _actor: ActorContext): Promise<TenantResponse> => ({
          id,
          slug: "test",
          name: "Test Tenant",
          country: "TR",
          defaultLocale: locale,
          timezone: "Europe/Istanbul",
          status: "active",
          taxId: null,
          taxIdType: null,
          contactEmail: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          archivedAt: null,
          archivedReason: null,
        }),
      ),
  } as unknown as TenantService;
}

interface Harness {
  repo: AppointmentRemindersRepository;
  audit: AuditService;
  notif: { service: NotificationsService; send: ReturnType<typeof vi.fn> };
  consent: ConsentService;
  ownersSvc: OwnersService;
  patientsSvc: PatientsService;
  tenantsSvc: TenantService;
  service: AppointmentRemindersService;
}

function makeHarness(opts?: {
  notificationImpl?: (req: unknown) => Promise<NotificationRecord>;
  owner?: Owner | null;
  patient?: Patient | null;
  locale?: "tr-TR" | "en-GB";
}): Harness {
  const repo = new AppointmentRemindersRepository();
  const audit = makeAudit();
  const notif = makeNotifications(opts?.notificationImpl);
  const consent = new ConsentService();
  const patient = opts?.patient === undefined ? makePatient() : opts.patient;
  const owner = opts?.owner === undefined ? makeOwner() : opts.owner;
  const patientsSvc = makePatients(patient);
  const ownersSvc = makeOwners(patient, owner);
  const tenantsSvc = makeTenants(opts?.locale ?? "tr-TR");
  const service = new AppointmentRemindersService(
    repo,
    notif.service,
    consent,
    ownersSvc,
    patientsSvc,
    tenantsSvc,
    audit,
  );
  return {
    repo,
    audit,
    notif,
    consent,
    ownersSvc,
    patientsSvc,
    tenantsSvc,
    service,
  };
}

describe("AppointmentRemindersService", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
    (h.audit.record as ReturnType<typeof vi.fn>).mockClear();
  });

  // -------------------------------------------------------------------
  // scheduleForAppointment
  // -------------------------------------------------------------------

  describe("scheduleForAppointment", () => {
    it("default config ile sms+in_app oluşturur, audit yazar", async () => {
      const appt = makeAppointment();
      const id = await h.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      expect(id).not.toBeNull();

      const all = h.repo.listForAppointment(TENANT_A, APPT_ID_A, undefined, 50, 0);
      expect(all.total).toBe(2);
      const channels = all.items.map((r) => r.channel).sort();
      expect(channels).toEqual(["in_app", "sms"]);
      for (const r of all.items) {
        expect(r.status).toBe("scheduled");
        expect(r.snapshot).not.toBeNull();
        expect(r.snapshot?.id).toBe(APPT_ID_A);
      }
      expect(h.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:appointment_reminder.schedule",
          action: "create",
          severity: "info",
        }),
      );
    });

    it("appointment.start çok yakınsa (geçmiş) skip eder, null döner", async () => {
      const appt = makeAppointment({ start: futureIso(1) });
      const id = await h.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      expect(id).toBeNull();
      expect(
        h.repo.listForAppointment(TENANT_A, APPT_ID_A, undefined, 50, 0).total,
      ).toBe(0);
    });

    it("marketing consent yoksa sms atlanır, sadece in_app kalır", async () => {
      const owner = makeOwner({
        consents: { kvkk: true, marketing: false },
      });
      h.ownersSvc = makeOwners(makePatient(), owner);
      h.service = new AppointmentRemindersService(
        h.repo,
        h.notif.service,
        h.consent,
        h.ownersSvc,
        h.patientsSvc,
        h.tenantsSvc,
        h.audit,
      );
      const appt = makeAppointment();
      await h.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      const all = h.repo.listForAppointment(TENANT_A, APPT_ID_A, undefined, 50, 0);
      expect(all.total).toBe(1);
      expect(all.items[0]!.channel).toBe("in_app");
    });

    it("idempotent: aynı planlama ikinci kez no-op", async () => {
      const appt = makeAppointment();
      const id1 = await h.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      const id2 = await h.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      expect(id1).toBe(id2);
      const all = h.repo.listForAppointment(TENANT_A, APPT_ID_A, undefined, 50, 0);
      expect(all.total).toBe(2);
    });

    it("patient bulunamadı → null + no audit", async () => {
      const local = makeHarness({ patient: null });
      const appt = makeAppointment();
      const id = await local.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      expect(id).toBeNull();
      expect(local.audit.record).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // cancelForAppointment
  // -------------------------------------------------------------------

  describe("cancelForAppointment", () => {
    it("scheduled olanları cancel eder, sayıyı döner", async () => {
      const appt = makeAppointment();
      await h.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      (h.audit.record as ReturnType<typeof vi.fn>).mockClear();
      const cancelled = await h.service.cancelForAppointment(
        TENANT_A,
        APPT_ID_A,
        STAFF_A,
      );
      expect(cancelled).toBe(2);
      const all = h.repo.listForAppointment(TENANT_A, APPT_ID_A, undefined, 50, 0);
      expect(all.items.every((r) => r.status === "cancelled")).toBe(true);
      expect(h.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:appointment_reminder.cancel",
          action: "cancel",
        }),
      );
    });

    it("idempotent: ikinci kez 0 döner", async () => {
      const appt = makeAppointment();
      await h.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      const c1 = await h.service.cancelForAppointment(TENANT_A, APPT_ID_A, STAFF_A);
      const c2 = await h.service.cancelForAppointment(TENANT_A, APPT_ID_A, STAFF_A);
      expect(c1).toBe(2);
      expect(c2).toBe(0);
    });

    it("başka tenant scope'undaki actor → 403 VET-AUTHZ-0001", async () => {
      const appt = makeAppointment();
      await h.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      const otherTenantStaff: ActorContext = { ...STAFF_A, tenantId: TENANT_B };
      await expect(
        h.service.cancelForAppointment(TENANT_A, APPT_ID_A, otherTenantStaff),
      ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0001" });
    });
  });

  // -------------------------------------------------------------------
  // rescheduleForAppointment
  // -------------------------------------------------------------------

  describe("rescheduleForAppointment", () => {
    it("delta pozitifse scheduledFor'u offsetler", async () => {
      const appt = makeAppointment({ start: futureIso(48) });
      await h.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      const allBefore = h.repo.listForAppointment(
        TENANT_A,
        APPT_ID_A,
        undefined,
        50,
        0,
      );
      const before = allBefore.items[0]!.scheduledFor;
      const oldStart = appt.start;
      const newStart = futureIso(72);
      const newEnd = new Date(
        new Date(newStart).getTime() + 30 * 60_000,
      ).toISOString();
      const moved = await h.service.rescheduleForAppointment(
        TENANT_A,
        APPT_ID_A,
        oldStart,
        newStart,
        newEnd,
        STAFF_A,
      );
      expect(moved).toBe(2);
      const allAfter = h.repo.listForAppointment(
        TENANT_A,
        APPT_ID_A,
        undefined,
        50,
        0,
      );
      const after = allAfter.items[0]!.scheduledFor;
      const beforeMs = new Date(before).getTime();
      const afterMs = new Date(after).getTime();
      const delta = new Date(newStart).getTime() - new Date(oldStart).getTime();
      expect(afterMs - beforeMs).toBe(delta);
    });

    it("delta sıfırsa 0 döner (no-op)", async () => {
      const appt = makeAppointment();
      await h.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      const moved = await h.service.rescheduleForAppointment(
        TENANT_A,
        APPT_ID_A,
        appt.start,
        appt.start,
        appt.end,
        STAFF_A,
      );
      expect(moved).toBe(0);
    });
  });

  // -------------------------------------------------------------------
  // processDueReminders
  // -------------------------------------------------------------------

  describe("processDueReminders", () => {
    it("scheduled ve zamanı gelenleri sent yapar", async () => {
      const appt = makeAppointment();
      await h.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      (h.audit.record as ReturnType<typeof vi.fn>).mockClear();
      // Zamanı 25 saat sonraya çek (default 24 saat öncesi geçmiş).
      const now = Date.now() + 25 * 60 * 60 * 1000;
      const result = await h.service.processDueReminders(now);
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(h.notif.send).toHaveBeenCalledTimes(2);
      const all = h.repo.listForAppointment(TENANT_A, APPT_ID_A, undefined, 50, 0);
      expect(all.items.every((r) => r.status === "sent")).toBe(true);
    });

    it("notification başarısız → status=failed + lastError", async () => {
      const local = makeHarness({
        notificationImpl: async (): Promise<NotificationRecord> => ({
          id: "n-fail",
          tenantId: TENANT_A,
          userId: OWNER_ID_A,
          channel: "sms",
          category: "appointment_reminder",
          templateKey: "appointment_reminder",
          status: "failed",
          attempts: 1,
          lastError: "provider 500",
          createdAt: new Date().toISOString(),
        }),
      });
      const appt = makeAppointment();
      await local.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      (local.audit.record as ReturnType<typeof vi.fn>).mockClear();
      const result = await local.service.processDueReminders(
        Date.now() + 25 * 60 * 60 * 1000,
      );
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(2);
      const all = local.repo.listForAppointment(
        TENANT_A,
        APPT_ID_A,
        undefined,
        50,
        0,
      );
      expect(all.items.every((r) => r.status === "failed")).toBe(true);
      expect(all.items.every((r) => r.lastError !== null)).toBe(true);
    });

    it("notification throw ederse catch edip failed yazar", async () => {
      const local = makeHarness({
        notificationImpl: async () => {
          throw new Error("network down");
        },
      });
      const appt = makeAppointment();
      await local.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      const result = await local.service.processDueReminders(
        Date.now() + 25 * 60 * 60 * 1000,
      );
      expect(result.failed).toBe(2);
      const all = local.repo.listForAppointment(
        TENANT_A,
        APPT_ID_A,
        undefined,
        50,
        0,
      );
      expect(all.items.every((r) => r.status === "failed")).toBe(true);
      expect(all.items.every((r) => r.lastError === "network down")).toBe(true);
    });

    it("appointment snapshot cancelled ise → reminder cancelled", async () => {
      const appt = makeAppointment();
      await h.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      // Snapshot'ı cancelled yap.
      const all = h.repo.listForAppointment(TENANT_A, APPT_ID_A, undefined, 50, 0);
      for (const rec of all.items) {
        h.repo.updateSnapshot(TENANT_A, rec.id, {
          ...rec.snapshot!,
          status: "cancelled",
        });
      }
      const result = await h.service.processDueReminders(
        Date.now() + 25 * 60 * 60 * 1000,
      );
      expect(result.skipped).toBe(2);
      const after = h.repo.listForAppointment(
        TENANT_A,
        APPT_ID_A,
        undefined,
        50,
        0,
      );
      expect(after.items.every((r) => r.status === "cancelled")).toBe(true);
    });

    it("due yoksa no-op (processed=0)", async () => {
      const result = await h.service.processDueReminders(Date.now());
      expect(result.processed).toBe(0);
      expect(h.notif.send).not.toHaveBeenCalled();
    });

    it("tenant izolasyonu: tenant B reminder'ı tenant A job'ından etkilenmez", async () => {
      // Tenant A'da schedule.
      const apptA = makeAppointment();
      await h.service.scheduleForAppointment(TENANT_A, apptA, STAFF_A);
      // Tenant B'de ayrı bir harness ile schedule.
      const ownerB: Owner = { ...makeOwner(), id: "own-b", tenantId: TENANT_B };
      const patientB: Patient = {
        ...makePatient(),
        id: "pat-b",
        tenantId: TENANT_B,
        ownerId: ownerB.id,
      };
      const apptB: Appointment = {
        ...makeAppointment(),
        id: "appt-b",
        tenantId: TENANT_B,
        patientId: patientB.id,
        ownerId: ownerB.id,
      };
      const localB = makeHarness({ patient: patientB, owner: ownerB });
      await localB.service.scheduleForAppointment(TENANT_B, apptB, STAFF_A);
      const result = await h.service.processDueReminders(
        Date.now() + 25 * 60 * 60 * 1000,
      );
      // Sadece tenant A reminder'ları dispatch edilir.
      expect(result.processed).toBe(2);
      // Tenant B kayıtları hâlâ scheduled.
      const bAll = localB.repo.listForAppointment(
        TENANT_B,
        "appt-b",
        undefined,
        50,
        0,
      );
      expect(bAll.items.every((r) => r.status === "scheduled")).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // listForAppointment
  // -------------------------------------------------------------------

  describe("listForAppointment", () => {
    it("status filtresi ile yalnızca eşleşenleri döner", async () => {
      const appt = makeAppointment();
      await h.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      await h.service.cancelForAppointment(TENANT_A, APPT_ID_A, STAFF_A);
      const cancelled = await h.service.listForAppointment(
        TENANT_A,
        APPT_ID_A,
        { status: "cancelled", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(cancelled.items).toHaveLength(2);
      const scheduled = await h.service.listForAppointment(
        TENANT_A,
        APPT_ID_A,
        { status: "scheduled", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(scheduled.items).toHaveLength(0);
    });

    it("başka tenant randevusunun hatırlatıcılarını döndürmez", async () => {
      const appt = makeAppointment();
      await h.service.scheduleForAppointment(TENANT_A, appt, STAFF_A);
      // Tenant B'nin kendi actor'ı ile sorgular: kendi tenant'ında
      // reminder yok, boş döner.
      const bStaff: ActorContext = { ...STAFF_A, tenantId: TENANT_B };
      const result = await h.service.listForAppointment(
        TENANT_B,
        APPT_ID_A,
        { limit: 50, offset: 0 },
        bStaff,
      );
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("cross-tenant actor → 403", async () => {
      const otherTenantStaff: ActorContext = { ...STAFF_A, tenantId: TENANT_B };
      await expect(
        h.service.listForAppointment(
          TENANT_A,
          APPT_ID_A,
          { limit: 50, offset: 0 },
          otherTenantStaff,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0001" });
    });
  });

  // -------------------------------------------------------------------
  // repository unit
  // -------------------------------------------------------------------

  describe("repository", () => {
    it("buildDedupeKey deterministik", () => {
      const k1 = AppointmentRemindersRepository.buildDedupeKey(
        APPT_ID_A,
        "sms",
        futureIso(24),
      );
      const k2 = AppointmentRemindersRepository.buildDedupeKey(
        APPT_ID_A,
        "sms",
        futureIso(24),
      );
      expect(k1).toBe(k2);
      const k3 = AppointmentRemindersRepository.buildDedupeKey(
        APPT_ID_A,
        "email",
        futureIso(24),
      );
      expect(k1).not.toBe(k3);
    });

    it("insert aynı tenant+dedupeKey ile ikinci kez no-op", () => {
      // Aynı scheduledFor değerini paylaşmalı (milisaniye farkı
      // dedupeKey'i bozar; futureIso() her çağrıda yeni Date.now()
      // okur). Bu yüzden tek seferlik hesaplanır.
      const scheduled = futureIso(24);
      const rec1 = makeRepoRecord(TENANT_A, "id-1", APPT_ID_A, scheduled, "sms");
      const rec2 = makeRepoRecord(TENANT_A, "id-2", APPT_ID_A, scheduled, "sms");
      const r1 = h.repo.insert(rec1);
      const r2 = h.repo.insert(rec2);
      expect(r1.inserted).toBe(true);
      expect(r2.inserted).toBe(false);
      if (!r2.inserted) expect(r2.existing.id).toBe("id-1");
    });

    it("findById cross-tenant → null", () => {
      const rec = makeRepoRecord(TENANT_A, "id-1", APPT_ID_A, futureIso(24), "sms");
      h.repo.insert(rec);
      expect(h.repo.findById(TENANT_B, "id-1")).toBeNull();
    });

    it("listDue yalnızca scheduled ve zamanı gelmiş olanları döner", () => {
      const now = Date.now();
      h.repo.insert(
        makeRepoRecord(
          TENANT_A,
          "past",
          APPT_ID_A,
          new Date(now - 1000).toISOString(),
          "sms",
        ),
      );
      h.repo.insert(
        makeRepoRecord(
          TENANT_A,
          "future",
          APPT_ID_A,
          new Date(now + 1000).toISOString(),
          "sms",
        ),
      );
      h.repo.insert(
        makeRepoRecord(
          TENANT_A,
          "sent",
          APPT_ID_A,
          new Date(now - 1000).toISOString(),
          "sms",
          { status: "sent" },
        ),
      );
      const due = h.repo.listDue(now, 10);
      expect(due).toHaveLength(1);
      expect(due[0]!.id).toBe("past");
    });
  });
});

function makeRepoRecord(
  tenantId: string,
  id: string,
  appointmentId: string,
  scheduledFor: string,
  channel: "sms" | "email" | "in_app",
  overrides: Partial<{
    status: "scheduled" | "sent" | "failed" | "cancelled";
  }> = {},
) {
  return {
    id,
    tenantId,
    appointmentId,
    channel,
    scheduledFor,
    status: overrides.status ?? "scheduled",
    attempts: 0,
    lastError: null,
    sentAt: null,
    createdAt: new Date().toISOString(),
    dedupeKey: `${appointmentId}|${channel}|${scheduledFor}`,
    snapshot: null,
  };
}
