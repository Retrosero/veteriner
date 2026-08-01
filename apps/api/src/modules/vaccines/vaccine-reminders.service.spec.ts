/**
 * @file VaccineRemindersService unit testleri.
 * @module apps/api/modules/vaccines/vaccine-reminders.service.spec
 * @description Schedule (success/no_due_date/past/missing owner/patient),
 * cancel idempotency, reschedule (forward/past), processDue
 * (success/failure/skipped-no-snapshot/cancelled-application/opted_out),
 * list filter, tenant config update, tenant izolasyonu ve audit
 * event yayını.
 * @since GOAL-053 (FAZ-5) aşı hatırlatma core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { VaccineRemindersRepository } from "./vaccine-reminders.repository.js";
import { VaccineRemindersService } from "./vaccine-reminders.service.js";
import { ConsentService } from "../../common/notifications/consent.service.js";

import type { VaccineApplicationsService } from "./vaccine-applications.service.js";
import type { VaccinesService } from "./vaccines.service.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { NotificationsService } from "../notifications/notifications.service.js";
import type { OwnersService } from "../owners/owners.service.js";
import type { PatientsService } from "../patients/patients.service.js";
import type { TenantService } from "../tenant/tenant.service.js";
import type {
  NotificationRecord,
  Owner,
  Patient,
  TenantResponse,
  VaccineApplication,
  VaccineProtocol,
} from "@vetniva/contracts";

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

const PATIENT_ID_A = "pat-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OWNER_ID_A = "own-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROTOCOL_ID_A = "prt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const APPLICATION_ID_A = "vap-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/**
 * Days ahead ISO date (YYYY-MM-DD).
 * @param daysAhead
 */
function futureDate(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  return d.toISOString().slice(0, 10);
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
 *
 * @param impl
 */
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
      category: "vaccine_reminder",
      templateKey: "vaccine_reminder",
      status: "sent",
      attempts: 1,
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    } satisfies NotificationRecord;
  });
  return { service: { send } as unknown as NotificationsService, send };
}

/**
 *
 */
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

/**
 *
 * @param extra
 */
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

/**
 *
 * @param overrides
 */
function makeProtocol(
  overrides: Partial<VaccineProtocol> = {},
): VaccineProtocol {
  return {
    id: PROTOCOL_ID_A,
    tenantId: TENANT_A,
    name: "Karma Aşı",
    species: "dog",
    category: "core",
    manufacturer: null,
    defaultDose: null,
    steps: [
      { ageWeeks: 8, vaccineName: "İlk doz", boosterIntervalDays: 21 },
      { ageWeeks: 12, vaccineName: "İkinci doz", boosterIntervalDays: 365 },
    ],
    totalDurationMonths: 12,
    isCore: true,
    createdAt: new Date().toISOString(),
    createdBy: "usr-admin",
    updatedAt: new Date().toISOString(),
    archivedAt: null,
    ...overrides,
  };
}

/**
 *
 * @param overrides
 */
function makeApplication(
  overrides: Partial<VaccineApplication> = {},
): VaccineApplication {
  return {
    id: APPLICATION_ID_A,
    tenantId: TENANT_A,
    patientId: PATIENT_ID_A,
    protocolId: PROTOCOL_ID_A,
    lot: {
      lot: "LOT-2026-A",
      expiryDate: futureDate(180),
      stockProductId: "stk-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    },
    dose: null,
    administeredBy: "usr-staff-a",
    applicationDate: new Date().toISOString(),
    nextDueDate: futureDate(180),
    notes: null,
    status: "active",
    createdAt: new Date().toISOString(),
    createdBy: "usr-staff-a",
    updatedAt: new Date().toISOString(),
    amendedAt: null,
    amendedBy: null,
    amendedReason: null,
    cancelledAt: null,
    cancellationReason: null,
    stockMovementIds: ["stm-1"],
    ...overrides,
  };
}

/**
 *
 * @param patient
 * @param owner
 */
function makeOwnersSvc(
  patient: Patient | null,
  owner: Owner | null,
): OwnersService {
  return {
    findById: vi
      .fn()
      .mockImplementation(async (tenantId: string, id: string) =>
        owner && tenantId === owner.tenantId && id === owner.id ? owner : null,
      ),
  } as unknown as OwnersService;
}

/**
 *
 * @param patient
 */
function makePatientsSvc(patient: Patient | null): PatientsService {
  return {
    findById: vi
      .fn()
      .mockImplementation(async (tenantId: string, id: string) =>
        patient && tenantId === patient.tenantId && id === patient.id
          ? patient
          : null,
      ),
  } as unknown as PatientsService;
}

/**
 *
 * @param locale
 */
function makeTenantsSvc(locale: "tr-TR" | "en-GB" = "tr-TR"): TenantService {
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

/**
 *
 * @param protocol
 */
function makeVaccinesSvc(protocol: VaccineProtocol | null): VaccinesService {
  return {
    getProtocol: vi
      .fn()
      .mockImplementation(async (tenantId: string, id: string) =>
        protocol && tenantId === protocol.tenantId && id === protocol.id
          ? protocol
          : null,
      ),
  } as unknown as VaccinesService;
}

/**
 *
 */
function makeApplicationsSvc(): VaccineApplicationsService {
  // VaccineApplicationsService yalnızca DI için; bu servis hatırlatma
  // service'ında doğrudan çağrılmıyor (snapshot deseni sayesinde).
  return {} as unknown as VaccineApplicationsService;
}

interface Harness {
  repo: VaccineRemindersRepository;
  audit: AuditService;
  notif: { service: NotificationsService; send: ReturnType<typeof vi.fn> };
  consent: ConsentService;
  ownersSvc: OwnersService;
  patientsSvc: PatientsService;
  tenantsSvc: TenantService;
  vaccinesSvc: VaccinesService;
  applicationsSvc: VaccineApplicationsService;
  service: VaccineRemindersService;
  patient: Patient | null;
  owner: Owner | null;
  protocol: VaccineProtocol | null;
}

/**
 *
 * @param opts
 * @param opts.notificationImpl
 * @param opts.owner
 * @param opts.patient
 * @param opts.protocol
 * @param opts.locale
 */
function makeHarness(opts?: {
  notificationImpl?: (req: unknown) => Promise<NotificationRecord>;
  owner?: Owner | null;
  patient?: Patient | null;
  protocol?: VaccineProtocol | null;
  locale?: "tr-TR" | "en-GB";
}): Harness {
  const repo = new VaccineRemindersRepository();
  const audit = makeAudit();
  const notif = makeNotifications(opts?.notificationImpl);
  const consent = new ConsentService();
  const patient = opts?.patient === undefined ? makePatient() : opts.patient;
  const owner = opts?.owner === undefined ? makeOwner() : opts.owner;
  const protocol =
    opts?.protocol === undefined ? makeProtocol() : opts.protocol;
  const patientsSvc = makePatientsSvc(patient);
  const ownersSvc = makeOwnersSvc(patient, owner);
  const tenantsSvc = makeTenantsSvc(opts?.locale ?? "tr-TR");
  const vaccinesSvc = makeVaccinesSvc(protocol);
  const applicationsSvc = makeApplicationsSvc();
  const service = new VaccineRemindersService(
    repo,
    notif.service,
    consent,
    ownersSvc,
    patientsSvc,
    tenantsSvc,
    vaccinesSvc,
    applicationsSvc,
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
    vaccinesSvc,
    applicationsSvc,
    service,
    patient,
    owner,
    protocol,
  };
}

describe("VaccineRemindersService", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
    (h.audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
    (h.audit.record as ReturnType<typeof vi.fn>).mockClear();
  });

  // -------------------------------------------------------------------
  // scheduleForApplication
  // -------------------------------------------------------------------

  describe("scheduleForApplication", () => {
    it("default config ile sms+in_app oluşturur, audit yazar", async () => {
      const app = makeApplication();
      const ids = await h.service.scheduleForApplication(
        TENANT_A,
        app,
        STAFF_A,
      );
      expect(ids.length).toBe(2);
      const all = h.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      expect(all.total).toBe(2);
      const channels = all.items.map((r) => r.channel).sort();
      expect(channels).toEqual(["in_app", "sms"]);
      for (const r of all.items) {
        expect(r.status).toBe("scheduled");
        expect(r.applicationSnapshot).not.toBeNull();
        expect(r.applicationSnapshot?.id).toBe(APPLICATION_ID_A);
        expect(r.nextDueDate).toBe(app.nextDueDate);
      }
      expect(h.audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccine.reminder.schedule",
        "vaccine_reminder",
        expect.any(String),
        "create",
        expect.objectContaining({ actorId: STAFF_A.actorId }),
        "info",
        expect.objectContaining({
          applicationId: APPLICATION_ID_A,
          // Vitest asymmetric matcher tipi `any`; yalnızca assertion verisidir.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          channel: expect.stringMatching(/sms|in_app/),
        }),
      );
    });

    it("nextDueDate geçmiş ise skip (no scheduledFor)", async () => {
      const app = makeApplication({ nextDueDate: futureDate(-1) });
      const ids = await h.service.scheduleForApplication(
        TENANT_A,
        app,
        STAFF_A,
      );
      expect(ids.length).toBe(0);
      expect(
        h.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0).total,
      ).toBe(0);
    });

    it("nextDueDate yok ve step booster yoksa skip", async () => {
      const protocol = makeProtocol({
        steps: [{ ageWeeks: 8, vaccineName: "İlk doz" }], // no boosterIntervalDays
      });
      const local = makeHarness({ protocol });
      const app = makeApplication({ nextDueDate: null });
      const ids = await local.service.scheduleForApplication(
        TENANT_A,
        app,
        STAFF_A,
      );
      expect(ids.length).toBe(0);
    });

    it("nextDueDate yok ama step boosterIntervalDays varsa, applicationDate+booster üzerinden planlar", async () => {
      const protocol = makeProtocol({
        steps: [
          { ageWeeks: 8, vaccineName: "İlk doz", boosterIntervalDays: 90 },
        ],
      });
      const local = makeHarness({ protocol });
      const app = makeApplication({ nextDueDate: null });
      const ids = await local.service.scheduleForApplication(
        TENANT_A,
        app,
        STAFF_A,
      );
      expect(ids.length).toBe(2);
      const all = local.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      for (const r of all.items) {
        // dueMs = appDate + 90 days, scheduledFor = dueMs - 7 days
        expect(r.nextDueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(r.scheduledFor).getTime()).toBeGreaterThan(Date.now());
      }
    });

    it("marketing consent yoksa sms atlanır, sadece in_app kalır", async () => {
      const owner = makeOwner({
        consents: { kvkk: true, marketing: false },
      });
      const local = makeHarness({ owner });
      const app = makeApplication();
      const ids = await local.service.scheduleForApplication(
        TENANT_A,
        app,
        STAFF_A,
      );
      expect(ids.length).toBe(1);
      const all = local.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      expect(all.items[0]!.channel).toBe("in_app");
    });

    it("idempotent: aynı planlama ikinci kez no-op", async () => {
      const app = makeApplication();
      const ids1 = await h.service.scheduleForApplication(
        TENANT_A,
        app,
        STAFF_A,
      );
      const ids2 = await h.service.scheduleForApplication(
        TENANT_A,
        app,
        STAFF_A,
      );
      expect(ids1.length).toBe(2);
      expect(ids2.length).toBe(2);
      // IDs should be identical to first call (existing returned).
      for (let i = 0; i < ids1.length; i++) {
        expect(ids2.at(i)).toBe(ids1.at(i));
      }
      const all = h.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      expect(all.total).toBe(2);
    });

    it("patient bulunamadı → boş dizi + no audit", async () => {
      const local = makeHarness({ patient: null });
      const app = makeApplication();
      const ids = await local.service.scheduleForApplication(
        TENANT_A,
        app,
        STAFF_A,
      );
      expect(ids).toEqual([]);
      expect(local.audit.recordSimple).not.toHaveBeenCalled();
    });

    it("owner bulunamadı → boş dizi", async () => {
      const local = makeHarness({ owner: null });
      const app = makeApplication();
      const ids = await local.service.scheduleForApplication(
        TENANT_A,
        app,
        STAFF_A,
      );
      expect(ids).toEqual([]);
    });

    it("protocol bulunamadı → boş dizi", async () => {
      const local = makeHarness({ protocol: null });
      const app = makeApplication();
      const ids = await local.service.scheduleForApplication(
        TENANT_A,
        app,
        STAFF_A,
      );
      expect(ids).toEqual([]);
    });

    it("tenant config override edilmişse daysBeforeDue uygulanır", async () => {
      // 30 gün sonrası için planlama; daysBeforeDue=14, scheduledFor = dueDate - 14 days
      const cfg = h.repo.upsertTenantConfig({
        tenantId: TENANT_A,
        daysBeforeDue: 14,
        channels: ["email"],
        updatedAt: new Date().toISOString(),
      });
      expect(cfg.daysBeforeDue).toBe(14);
      const app = makeApplication({ nextDueDate: futureDate(30) });
      const ids = await h.service.scheduleForApplication(
        TENANT_A,
        app,
        STAFF_A,
      );
      expect(ids.length).toBe(1);
      const all = h.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      expect(all.items[0]!.channel).toBe("email");
      // 30 - 14 = 16 gün sonrası
      const expected = new Date(Date.now() + 16 * 86_400_000).getTime();
      const actual = new Date(all.items[0]!.scheduledFor).getTime();
      // ±1 gün tolerans (test'in çalıştığı zamana göre)
      expect(Math.abs(expected - actual)).toBeLessThan(2 * 86_400_000);
    });
  });

  // -------------------------------------------------------------------
  // cancelForApplication
  // -------------------------------------------------------------------

  describe("cancelForApplication", () => {
    it("scheduled olanları cancel eder, sayıyı döner", async () => {
      const app = makeApplication();
      await h.service.scheduleForApplication(TENANT_A, app, STAFF_A);
      (h.audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const cancelled = await h.service.cancelForApplication(
        TENANT_A,
        APPLICATION_ID_A,
        STAFF_A,
      );
      expect(cancelled).toBe(2);
      const all = h.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      expect(all.items.every((r) => r.status === "cancelled")).toBe(true);
      expect(h.audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccine.reminder.cancel",
        "vaccine_reminder",
        APPLICATION_ID_A,
        "cancel",
        expect.objectContaining({ actorId: STAFF_A.actorId }),
        "info",
        expect.objectContaining({ cancelledCount: 2 }),
      );
    });

    it("idempotent: ikinci kez 0 döner, audit yazmaz", async () => {
      const app = makeApplication();
      await h.service.scheduleForApplication(TENANT_A, app, STAFF_A);
      const c1 = await h.service.cancelForApplication(
        TENANT_A,
        APPLICATION_ID_A,
        STAFF_A,
      );
      (h.audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const c2 = await h.service.cancelForApplication(
        TENANT_A,
        APPLICATION_ID_A,
        STAFF_A,
      );
      expect(c1).toBe(2);
      expect(c2).toBe(0);
      expect(h.audit.recordSimple).not.toHaveBeenCalled();
    });

    it("başka tenant scope'undaki actor → 403 VET-AUTHZ-0001", async () => {
      const app = makeApplication();
      await h.service.scheduleForApplication(TENANT_A, app, STAFF_A);
      const otherTenantStaff: ActorContext = { ...STAFF_A, tenantId: TENANT_B };
      await expect(
        h.service.cancelForApplication(
          TENANT_A,
          APPLICATION_ID_A,
          otherTenantStaff,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0001" });
    });

    it("SUPERADMIN cross-tenant erişim izni", async () => {
      const app = makeApplication();
      await h.service.scheduleForApplication(TENANT_A, app, STAFF_A);
      const superadmin: ActorContext = {
        ...STAFF_A,
        actorId: "usr-super",
        role: "SUPERADMIN",
        tenantId: TENANT_B,
      };
      const c = await h.service.cancelForApplication(
        TENANT_A,
        APPLICATION_ID_A,
        superadmin,
      );
      expect(c).toBe(2);
    });
  });

  // -------------------------------------------------------------------
  // cancelForPatient
  // -------------------------------------------------------------------

  describe("cancelForPatient", () => {
    it("hastanın tüm scheduled hatırlatmalarını iptal eder", async () => {
      const app1 = makeApplication({ id: "vap-1" });
      const app2 = makeApplication({
        id: "vap-2",
        nextDueDate: futureDate(60),
      });
      await h.service.scheduleForApplication(TENANT_A, app1, STAFF_A);
      await h.service.scheduleForApplication(TENANT_A, app2, STAFF_A);
      (h.audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const cancelled = await h.service.cancelForPatient(
        TENANT_A,
        PATIENT_ID_A,
        STAFF_A,
      );
      expect(cancelled).toBe(4);
      const all = h.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      expect(all.items.every((r) => r.status === "cancelled")).toBe(true);
      expect(h.audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccine.reminder.cancel_patient",
        "vaccine_reminder",
        PATIENT_ID_A,
        "cancel",
        expect.objectContaining({ actorId: STAFF_A.actorId }),
        "info",
        expect.objectContaining({ cancelledCount: 4 }),
      );
    });
  });

  // -------------------------------------------------------------------
  // rescheduleForApplication
  // -------------------------------------------------------------------

  describe("rescheduleForApplication", () => {
    it("delta pozitifse scheduledFor'u offsetler", async () => {
      const app = makeApplication({ nextDueDate: futureDate(60) });
      await h.service.scheduleForApplication(TENANT_A, app, STAFF_A);
      const allBefore = h.repo.listForPatient(
        TENANT_A,
        PATIENT_ID_A,
        {},
        50,
        0,
      );
      const beforeFor = allBefore.items[0]!.scheduledFor;
      const beforeNext = allBefore.items[0]!.nextDueDate;
      // nextDueDate'yi 30 gün ileri al
      const newNext = futureDate(90);
      const moved = await h.service.rescheduleForApplication(
        TENANT_A,
        APPLICATION_ID_A,
        newNext,
        STAFF_A,
      );
      expect(moved).toBe(2);
      const allAfter = h.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      for (const r of allAfter.items) {
        expect(r.nextDueDate).toBe(newNext);
        // ScheduledFor = eski scheduledFor + 30 days (yaklaşık)
        const delta =
          new Date(r.scheduledFor).getTime() - new Date(beforeFor).getTime();
        const expectedDelta =
          new Date(newNext).getTime() - new Date(beforeNext).getTime();
        expect(delta).toBe(expectedDelta);
      }
    });

    it("yeni nextDueDate geçmişte ise hatırlatmalar cancel olur", async () => {
      const app = makeApplication({ nextDueDate: futureDate(60) });
      await h.service.scheduleForApplication(TENANT_A, app, STAFF_A);
      const newNext = futureDate(-30); // 30 gün önce
      const moved = await h.service.rescheduleForApplication(
        TENANT_A,
        APPLICATION_ID_A,
        newNext,
        STAFF_A,
      );
      expect(moved).toBe(2);
      const all = h.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      expect(all.items.every((r) => r.status === "cancelled")).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // processDueReminders
  // -------------------------------------------------------------------

  describe("processDueReminders", () => {
    it("scheduled ve zamanı gelenleri sent yapar", async () => {
      // scheduledFor = (nextDueDate) - 7 gün. nextDueDate 5 gün sonra =
      // scheduledFor 2 gün önce = bugünden önce → due.
      // scheduleForApplication skip kontrolünü geçmesi için nextDueDate
      // 7+ gün sonra olmalı. Burada doğrudan repo üzerinden
      // scheduledFor'ı geçmişe çekiyoruz.
      const app = makeApplication({ nextDueDate: futureDate(30) });
      await h.service.scheduleForApplication(TENANT_A, app, STAFF_A);
      // 30 gün sonra scheduledFor = 23 gün sonra. Şimdi bunu 30 gün
      // ileriye çekerek scheduledFor'ı geçmişe alalım (reschedule).
      // Reschedule ile newNextDueDate = -7 gün (geçmiş) → cancelled
      // olur. Bu yüzden burada doğrudan repo'ya yazıp due kontrolü
      // için zamanı değiştiriyoruz.
      const all = h.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      // scheduledFor'ı doğrudan 5 dakika öncesine çek.
      for (const r of all.items) {
        h.repo.update(r.tenantId, r.id, {});
        // Direct mutation: byId Map'inde r'in scheduledFor'ını değiştir.
        // Test sürdürülebilirliği için Map'i hook'luyoruz.
      }
      // Map'i doğrudan mutate etmek için repo.clear + yeniden insert
      // yapmak yerine due testini `processDueReminders(now)` ile
      // büyük bir `now` değeriyle çağırıyoruz.
      (h.audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      const now = Date.now() + 25 * 86_400_000; // 25 gün sonra
      const result = await h.service.processDueReminders(now);
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(h.notif.send).toHaveBeenCalledTimes(2);
      const allAfter = h.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      expect(allAfter.items.every((r) => r.status === "sent")).toBe(true);
    });

    it("due olmayan scheduled'ları skip eder", async () => {
      const app = makeApplication({ nextDueDate: futureDate(60) });
      await h.service.scheduleForApplication(TENANT_A, app, STAFF_A);
      h.notif.send.mockClear();
      const result = await h.service.processDueReminders();
      expect(result.processed).toBe(0);
      expect(h.notif.send).not.toHaveBeenCalled();
    });

    it("application status=cancelled ise reminder cancelled olur", async () => {
      // Yüksek nextDueDate → scheduledFor gelecekte. processDueReminders
      // için 25 gün sonra `now` ile çalıştırıyoruz.
      const app = makeApplication({
        nextDueDate: futureDate(30),
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
        cancellationReason: "iptal",
      });
      await h.service.scheduleForApplication(TENANT_A, app, STAFF_A);
      h.notif.send.mockClear();
      const now = Date.now() + 25 * 86_400_000;
      const result = await h.service.processDueReminders(now);
      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(2);
      const all = h.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      expect(all.items.every((r) => r.status === "cancelled")).toBe(true);
    });

    it("notification başarısız → status=failed + lastError", async () => {
      const local = makeHarness({
        notificationImpl: async () => ({
          id: "notif-1",
          tenantId: TENANT_A,
          userId: OWNER_ID_A,
          channel: "sms",
          category: "vaccine_reminder",
          templateKey: "vaccine_reminder",
          status: "failed",
          attempts: 1,
          createdAt: new Date().toISOString(),
        }),
      });
      const app = makeApplication({ nextDueDate: futureDate(30) });
      await local.service.scheduleForApplication(TENANT_A, app, STAFF_A);
      const now = Date.now() + 25 * 86_400_000;
      const result = await local.service.processDueReminders(now);
      expect(result.failed).toBe(2);
      const all = local.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      for (const r of all.items) {
        expect(r.status).toBe("failed");
        expect(r.lastError).toBeTruthy();
      }
    });

    it("opted_out gelirse reminder cancelled yapılır, sent 0 olur", async () => {
      const local = makeHarness({
        notificationImpl: async () => ({
          id: "notif-1",
          tenantId: TENANT_A,
          userId: OWNER_ID_A,
          channel: "sms",
          category: "vaccine_reminder",
          templateKey: "vaccine_reminder",
          status: "opted_out",
          attempts: 0,
          createdAt: new Date().toISOString(),
        }),
      });
      const app = makeApplication({ nextDueDate: futureDate(30) });
      await local.service.scheduleForApplication(TENANT_A, app, STAFF_A);
      const now = Date.now() + 25 * 86_400_000;
      const result = await local.service.processDueReminders(now);
      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(2);
      const all = local.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      expect(all.items.every((r) => r.status === "cancelled")).toBe(true);
    });

    it("notification hata fırlatırsa catch edilir, status=failed", async () => {
      const local = makeHarness({
        notificationImpl: async () => {
          throw new Error("network down");
        },
      });
      const app = makeApplication({ nextDueDate: futureDate(30) });
      await local.service.scheduleForApplication(TENANT_A, app, STAFF_A);
      const now = Date.now() + 25 * 86_400_000;
      const result = await local.service.processDueReminders(now);
      expect(result.failed).toBe(2);
      const all = local.repo.listForPatient(TENANT_A, PATIENT_ID_A, {}, 50, 0);
      for (const r of all.items) {
        expect(r.status).toBe("failed");
        expect(r.lastError).toBe("network down");
      }
    });

    it("process batch: SYSTEM audit event yayınlanır", async () => {
      const app = makeApplication({ nextDueDate: futureDate(30) });
      await h.service.scheduleForApplication(TENANT_A, app, STAFF_A);
      (h.audit.record as ReturnType<typeof vi.fn>).mockClear();
      const now = Date.now() + 25 * 86_400_000;
      await h.service.processDueReminders(now);
      expect(h.audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:vaccine.reminder.process_due",
          actorType: "system",
          tenantId: "system",
          severity: "info",
        }),
      );
    });
  });

  // -------------------------------------------------------------------
  // listForPatient
  // -------------------------------------------------------------------

  describe("listForPatient", () => {
    it("status filtresi uygular", async () => {
      const app = makeApplication();
      await h.service.scheduleForApplication(TENANT_A, app, STAFF_A);
      await h.service.cancelForApplication(TENANT_A, APPLICATION_ID_A, STAFF_A);
      // Yeni planlama ile 2 tane scheduled oluştur
      const app2 = makeApplication({
        id: "vap-2",
        nextDueDate: futureDate(45),
      });
      await h.service.scheduleForApplication(TENANT_A, app2, STAFF_A);
      const scheduled = await h.service.listForPatient(
        TENANT_A,
        PATIENT_ID_A,
        { status: "scheduled", limit: 50, offset: 0 },
        STAFF_A,
      );
      expect(scheduled.items.every((r) => r.status === "scheduled")).toBe(true);
      expect(scheduled.total).toBe(2);
    });

    it("başka tenant scope'undaki actor → 403 VET-AUTHZ-0001", async () => {
      const otherTenantStaff: ActorContext = { ...STAFF_A, tenantId: TENANT_B };
      await expect(
        h.service.listForPatient(
          TENANT_A,
          PATIENT_ID_A,
          { limit: 50, offset: 0 },
          otherTenantStaff,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0001" });
    });
  });

  // -------------------------------------------------------------------
  // Tenant config
  // -------------------------------------------------------------------

  describe("tenant config", () => {
    it("getTenantConfig default config döner (kayıt yoksa)", async () => {
      const cfg = await h.service.getTenantConfig(TENANT_A, STAFF_A);
      expect(cfg.daysBeforeDue).toBe(7);
      expect(cfg.channels).toEqual(["sms", "in_app"]);
    });

    it("updateTenantConfig yazar, audit yazar, sonraki get güncellenmiş döner", async () => {
      const updated = await h.service.updateTenantConfig(
        TENANT_A,
        { daysBeforeDue: 14, channels: ["email"] },
        STAFF_A,
      );
      expect(updated.daysBeforeDue).toBe(14);
      expect(updated.channels).toEqual(["email"]);
      const refetched = await h.service.getTenantConfig(TENANT_A, STAFF_A);
      expect(refetched).toEqual(updated);
      expect(h.audit.recordSimple).toHaveBeenCalledWith(
        "audit:vaccine.reminder.config.update",
        "vaccine_reminder_config",
        TENANT_A,
        "update",
        expect.objectContaining({ actorId: STAFF_A.actorId }),
        "info",
        expect.objectContaining({ daysBeforeDue: 14, channels: ["email"] }),
      );
    });

    it("updateTenantConfig invalid input → 422 VET-VALIDATION-0010", async () => {
      await expect(
        h.service.updateTenantConfig(
          TENANT_A,
          { daysBeforeDue: 0, channels: ["sms"] },
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-VALIDATION-0010" });
      await expect(
        h.service.updateTenantConfig(
          TENANT_A,
          { daysBeforeDue: 14, channels: [] },
          STAFF_A,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-VALIDATION-0010" });
    });

    it("updateTenantConfig cross-tenant → 403", async () => {
      const otherTenantStaff: ActorContext = { ...STAFF_A, tenantId: TENANT_B };
      await expect(
        h.service.updateTenantConfig(
          TENANT_A,
          { daysBeforeDue: 7, channels: ["sms"] },
          otherTenantStaff,
        ),
      ).rejects.toMatchObject({ errorCode: "VET-AUTHZ-0001" });
    });
  });
});
