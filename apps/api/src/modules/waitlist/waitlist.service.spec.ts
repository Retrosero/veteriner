/**
 * @file WaitlistService unit testleri.
 * @module apps/api/modules/waitlist/waitlist.service.spec
 *
 * @description Hasta cross-tenant, expiresAt default, priority
 * sıralaması, notify/convert/cancel/expire state machine ve audit
 * event yayını.
 *
 * @since GOAL-032 (FAZ-3) bekleme listesi core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";
import type { Patient } from "../../common/patients/patient.types.js";

import type { NotificationsService } from "../notifications/notifications.service.js";
import type { PatientsService } from "../patients/patients.service.js";

import { WaitlistService } from "./waitlist.service.js";
import { WaitlistRepository } from "./waitlist.repository.js";

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

const PATIENT_ID_A = "33333333-3333-3333-3333-333333333333";
const PATIENT_ID_B = "44444444-4444-4444-4444-444444444444";

const patientStore = new Map<string, Patient>();

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

function makeNotifications(): NotificationsService {
  return {
    send: vi.fn().mockResolvedValue({
      id: "notif-1",
      status: "queued",
      attempts: 0,
    }),
  } as unknown as NotificationsService;
}

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

function makeInput(
  overrides: Partial<{
    patientId: string;
    preferredDate: string;
    preferredVeterinarianId: string;
    reason: string;
    priority: "normal" | "urgent" | "emergency";
    expiresAt: string;
  }> = {},
) {
  return {
    patientId: PATIENT_ID_A,
    reason: "Muayene için uygun slot yok",
    priority: "normal" as const,
    ...overrides,
  };
}

describe("WaitlistService", () => {
  let service: WaitlistService;
  let repo: WaitlistRepository;
  let patients: PatientsService;
  let audit: AuditService;
  let notifications: NotificationsService;

  beforeEach(() => {
    patientStore.clear();
    seedPatient(TENANT_A, PATIENT_ID_A, "own-1");
    seedPatient(TENANT_B, PATIENT_ID_B, "own-2");
    repo = new WaitlistRepository();
    patients = makePatients();
    audit = makeAudit();
    notifications = makeNotifications();
    service = new WaitlistService(repo, patients, audit, notifications);
  });

  // -------------------------------------------------------------------------
  // add
  // -------------------------------------------------------------------------

  describe("add", () => {
    it("başarı: status=waiting, expiresAt = now+30 gün, audit.add (info)", async () => {
      const before = Date.now();
      const entry = await service.add(TENANT_A, makeInput(), STAFF_A);
      const after = Date.now();

      expect(entry.id).toMatch(/^wl-/);
      expect(entry.tenantId).toBe(TENANT_A);
      expect(entry.patientId).toBe(PATIENT_ID_A);
      expect(entry.ownerId).toBe("own-1");
      expect(entry.status).toBe("waiting");
      expect(entry.priority).toBe("normal");
      expect(entry.notifiedAt).toBeNull();
      expect(entry.scheduledAppointmentId).toBeNull();

      // expiresAt 30 gün sonrasına ayarlanmış olmalı.
      const expiresMs = new Date(entry.expiresAt).getTime();
      const expectedMin = before + 30 * 24 * 60 * 60 * 1000;
      const expectedMax = after + 30 * 24 * 60 * 60 * 1000;
      expect(expiresMs).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresMs).toBeLessThanOrEqual(expectedMax);

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:waitlist.add",
        "waitlist_entry",
        entry.id,
        "create",
        expect.objectContaining({ tenantId: TENANT_A }),
        "info",
        expect.objectContaining({
          patientId: PATIENT_ID_A,
          ownerId: "own-1",
          priority: "normal",
        }),
      );
    });

    it("custom expiresAt verilirse onu kullanır", async () => {
      const custom = "2099-01-01T00:00:00.000Z";
      const entry = await service.add(
        TENANT_A,
        makeInput({ expiresAt: custom }),
        STAFF_A,
      );
      expect(entry.expiresAt).toBe(custom);
    });

    it("cross-tenant patient → 404 VET-CLINIC-0001, audit yok", async () => {
      await expect(
        service.add(
          TENANT_A,
          makeInput({ patientId: PATIENT_ID_B }),
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0001",
        httpStatus: 404,
      });
      expect(audit.recordSimple).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // list — priority sıralaması
  // -------------------------------------------------------------------------

  describe("list", () => {
    beforeEach(async () => {
      await service.add(
        TENANT_A,
        makeInput({ priority: "normal", reason: "r-normal" }),
        STAFF_A,
      );
      // 1ms bekle: createdAt farkı için.
      await new Promise((r) => setTimeout(r, 2));
      await service.add(
        TENANT_A,
        makeInput({ priority: "emergency", reason: "r-emergency" }),
        STAFF_A,
      );
      await new Promise((r) => setTimeout(r, 2));
      await service.add(
        TENANT_A,
        makeInput({ priority: "urgent", reason: "r-urgent" }),
        STAFF_A,
      );
    });

    it("emergency > urgent > normal sıralaması", async () => {
      const r = await service.list(TENANT_A, {}, STAFF_A);
      expect(r.total).toBe(3);
      expect(r.items.map((i) => i.priority)).toEqual([
        "emergency",
        "urgent",
        "normal",
      ]);
    });

    it("status filtresi", async () => {
      const r = await service.list(
        TENANT_A,
        { status: "waiting" },
        STAFF_A,
      );
      expect(r.total).toBe(3);
    });

    it("priority filtresi", async () => {
      const r = await service.list(
        TENANT_A,
        { priority: "emergency" },
        STAFF_A,
      );
      expect(r.total).toBe(1);
      expect(r.items[0]?.priority).toBe("emergency");
    });
  });

  // -------------------------------------------------------------------------
  // notify
  // -------------------------------------------------------------------------

  describe("notify", () => {
    it("status=notified, notifiedAt set, audit.notify (info), notification stub", async () => {
      const entry = await service.add(TENANT_A, makeInput(), STAFF_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();
      (notifications.send as ReturnType<typeof vi.fn>).mockClear();

      await service.notify(TENANT_A, entry.id, STAFF_A);

      const found = await service.findById(TENANT_A, entry.id, STAFF_A);
      expect(found?.status).toBe("notified");
      expect(found?.notifiedAt).not.toBeNull();

      expect(notifications.send).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_A,
          category: "custom",
          templateKey: "waitlist.notify",
        }),
      );
      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:waitlist.notify",
        "waitlist_entry",
        entry.id,
        "update",
        expect.any(Object),
        "info",
        expect.objectContaining({
          patientId: PATIENT_ID_A,
          previousStatus: "waiting",
        }),
      );
    });

    it("cancelled kayıt notify edilemez → 422 VET-CLINIC-0006", async () => {
      const entry = await service.add(TENANT_A, makeInput(), STAFF_A);
      await service.cancel(TENANT_A, entry.id, "iptal", STAFF_A);
      await expect(
        service.notify(TENANT_A, entry.id, STAFF_A),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0006",
        httpStatus: 422,
      });
    });
  });

  // -------------------------------------------------------------------------
  // convertToAppointment
  // -------------------------------------------------------------------------

  describe("convertToAppointment", () => {
    it("status=scheduled, scheduledAppointmentId set, audit.schedule (info)", async () => {
      const entry = await service.add(TENANT_A, makeInput(), STAFF_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();

      await service.convertToAppointment(
        TENANT_A,
        entry.id,
        "appt-xyz-1",
        STAFF_A,
      );

      const found = await service.findById(TENANT_A, entry.id, STAFF_A);
      expect(found?.status).toBe("scheduled");
      expect(found?.scheduledAppointmentId).toBe("appt-xyz-1");

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:waitlist.schedule",
        "waitlist_entry",
        entry.id,
        "update",
        expect.any(Object),
        "info",
        expect.objectContaining({
          patientId: PATIENT_ID_A,
          appointmentId: "appt-xyz-1",
        }),
      );
    });

    it("cancelled kayıt schedule edilemez → 422 VET-CLINIC-0006", async () => {
      const entry = await service.add(TENANT_A, makeInput(), STAFF_A);
      await service.cancel(TENANT_A, entry.id, "iptal", STAFF_A);
      await expect(
        service.convertToAppointment(
          TENANT_A,
          entry.id,
          "appt-1",
          STAFF_A,
        ),
      ).rejects.toMatchObject({
        errorCode: "VET-CLINIC-0006",
        httpStatus: 422,
      });
    });
  });

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  describe("cancel", () => {
    it("status=cancelled, audit.cancel (warning)", async () => {
      const entry = await service.add(TENANT_A, makeInput(), STAFF_A);
      (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();

      await service.cancel(TENANT_A, entry.id, "Hasta gelmeyecek", STAFF_A);

      const found = await service.findById(TENANT_A, entry.id, STAFF_A);
      expect(found?.status).toBe("cancelled");

      expect(audit.recordSimple).toHaveBeenCalledWith(
        "audit:waitlist.cancel",
        "waitlist_entry",
        entry.id,
        "cancel",
        expect.any(Object),
        "warning",
        expect.objectContaining({ reason: "Hasta gelmeyecek" }),
      );
    });

    it("idempotent: ikinci kez cancel hata vermez", async () => {
      const entry = await service.add(TENANT_A, makeInput(), STAFF_A);
      await service.cancel(TENANT_A, entry.id, "x", STAFF_A);
      await expect(
        service.cancel(TENANT_A, entry.id, "x", STAFF_A),
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // expireOverdue
  // -------------------------------------------------------------------------

  describe("expireOverdue", () => {
    it("expiresAt<now olan waiting kayıtları → expired, audit.expire", async () => {
      // Süresi dolmuş bir kayıt oluştur.
      const past = "2020-01-01T00:00:00.000Z";
      const entry = await service.add(
        TENANT_A,
        makeInput({ expiresAt: past }),
        STAFF_A,
      );
      (audit.record as ReturnType<typeof vi.fn>).mockClear();

      const count = await service.expireOverdue();
      expect(count).toBe(1);

      const found = await service.findById(TENANT_A, entry.id, STAFF_A);
      expect(found?.status).toBe("expired");

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "audit:waitlist.expire",
          targetType: "waitlist_entry",
          targetId: entry.id,
          action: "update",
          actorType: "system",
          severity: "info",
        }),
      );
    });

    it("süresi dolmamış kayıtlar expired olmaz", async () => {
      // expiresAt verilmedi → now+30 gün → expired olmaz.
      await service.add(TENANT_A, makeInput(), STAFF_A);
      const count = await service.expireOverdue();
      expect(count).toBe(0);
    });
  });
});
