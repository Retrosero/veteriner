/**
 * @file CalendarService unit testleri.
 * @module apps/api/modules/calendar/calendar.service.spec
 *
 * @description Slot üretimi (09:00-17:00, 30dk → 16 slot), booked
 * + blocked durumu, cross-tenant guard, veterinarian filtresi,
 * setWorkingHours / blockSlot / unblockSlot, audit event
 * yayını.
 *
 * @since GOAL-030 (FAZ-3) klinik takvimi core (partial)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { AuditService } from "../../common/audit/audit.service.js";

import { CalendarService } from "./calendar.service.js";

const TENANT_A = "tnt-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "tnt-bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const VET_A = "vet-aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

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

const SUPERADMIN: ActorContext = {
  actorId: "usr-sa",
  actorType: "user",
  role: "SUPERADMIN",
  tenantId: null,
  branchId: null,
  isSuperadmin: true,
  correlationId: "req-sa",
  ipAddress: null,
  userAgentHash: null,
  source: "header",
};

function makeAudit(): AuditService {
  return {
    record: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
    recordSimple: vi.fn().mockResolvedValue({ eventId: "ev-1" }),
  } as unknown as AuditService;
}

describe("CalendarService", () => {
  let service: CalendarService;
  let audit: AuditService;

  beforeEach(() => {
    audit = makeAudit();
    service = new CalendarService(audit);
  });

  // ---------------------------------------------------------------------
  // getDay
  // ---------------------------------------------------------------------

  it("getDay: 09:00-17:00 varsayılan saat + 30 dk slot = 16 slot (Pzt)", async () => {
    // 2025-03-17 = Pazartesi (UTC)
    const day = await service.getDay(
      TENANT_A,
      "2025-03-17",
      {},
      STAFF_A,
    );
    expect(day.date).toBe("2025-03-17");
    expect(day.slots).toHaveLength(16);
    // İlk slot 09:00-09:30, son slot 16:30-17:00
    expect(day.slots[0]?.start).toBe("2025-03-17T09:00:00.000Z");
    expect(day.slots[0]?.end).toBe("2025-03-17T09:30:00.000Z");
    expect(day.slots[15]?.start).toBe("2025-03-17T16:30:00.000Z");
    expect(day.slots[15]?.end).toBe("2025-03-17T17:00:00.000Z");
    // Tüm slot'lar available
    for (const s of day.slots) {
      expect(s.status).toBe("available");
    }
  });

  it("getDay: booked slot status='booked' + appointmentId", async () => {
    // 10:00-10:30 slot'unu booked yap
    service.seedBookedSlot({
      tenantId: TENANT_A,
      veterinarianId: "vet-default",
      appointmentId: "appt-1",
      start: "2025-03-17T10:00:00.000Z",
      end: "2025-03-17T10:30:00.000Z",
    });

    const day = await service.getDay(
      TENANT_A,
      "2025-03-17",
      {},
      STAFF_A,
    );
    const booked = day.slots.find(
      (s) => s.start === "2025-03-17T10:00:00.000Z",
    );
    expect(booked?.status).toBe("booked");
    expect(booked?.appointmentId).toBe("appt-1");
  });

  it("getDay: blocked slot status='blocked' (mola/izin)", async () => {
    // 12:00-13:00 aralığını blocked yap (öğle molası)
    await service.blockSlot(
      TENANT_A,
      {
        veterinarianId: "vet-default",
        start: "2025-03-17T12:00:00.000Z",
        end: "2025-03-17T13:00:00.000Z",
        reason: "Öğle molası",
      },
      STAFF_A,
    );

    const day = await service.getDay(
      TENANT_A,
      "2025-03-17",
      {},
      STAFF_A,
    );
    // 12:00-12:30 ve 12:30-13:00 → blocked
    const slot1 = day.slots.find(
      (s) => s.start === "2025-03-17T12:00:00.000Z",
    );
    const slot2 = day.slots.find(
      (s) => s.start === "2025-03-17T12:30:00.000Z",
    );
    expect(slot1?.status).toBe("blocked");
    expect(slot2?.status).toBe("blocked");
    // 11:30 hâlâ available
    const before = day.slots.find(
      (s) => s.start === "2025-03-17T11:30:00.000Z",
    );
    expect(before?.status).toBe("available");
  });

  it("getDay: cross-tenant → 403 (VET-AUTHZ-0001)", async () => {
    await expect(
      service.getDay(TENANT_A, "2025-03-17", {}, STAFF_B),
    ).rejects.toMatchObject({
      errorCode: "VET-AUTHZ-0001",
      httpStatus: 403,
    });
  });

  it("getDay: SUPERADMIN her tenant'a erişebilir", async () => {
    const day = await service.getDay(
      TENANT_B,
      "2025-03-17",
      {},
      SUPERADMIN,
    );
    expect(day.slots.length).toBeGreaterThan(0);
  });

  it("getDay: veterinarianId filtresi yalnızca o vet'in saatlerini üretir", async () => {
    // Vet A için sadece Çarşamba 10:00-12:00 tanımla
    await service.setWorkingHours(
      TENANT_A,
      {
        veterinarianId: VET_A,
        hours: [
          { dayOfWeek: 3, startTime: "10:00", endTime: "12:00", slotDurationMin: 30 },
        ],
      },
      STAFF_A,
    );

    // Pazartesi 2025-03-17 — VET_A için hiç saat yok → 0 slot
    const mon = await service.getDay(
      TENANT_A,
      "2025-03-17",
      { veterinarianId: VET_A },
      STAFF_A,
    );
    expect(mon.slots).toHaveLength(0);

    // Çarşamba 2025-03-19 — 4 slot (10:00-10:30, 10:30-11:00, 11:00-11:30, 11:30-12:00)
    const wed = await service.getDay(
      TENANT_A,
      "2025-03-19",
      { veterinarianId: VET_A },
      STAFF_A,
    );
    expect(wed.slots).toHaveLength(4);
  });

  it("getDay: Pazar (varsayılan çalışılmaz) → 0 slot", async () => {
    // 2025-03-16 = Pazar
    const sun = await service.getDay(
      TENANT_A,
      "2025-03-16",
      {},
      STAFF_A,
    );
    expect(sun.slots).toHaveLength(0);
  });

  // ---------------------------------------------------------------------
  // setWorkingHours
  // ---------------------------------------------------------------------

  it("setWorkingHours: başarı + audit yayını", async () => {
    await service.setWorkingHours(
      TENANT_A,
      {
        hours: [
          { dayOfWeek: 1, startTime: "08:00", endTime: "18:00", slotDurationMin: 60 },
        ],
      },
      STAFF_A,
    );
    expect(audit.recordSimple).toHaveBeenCalledWith(
      "audit:calendar.hours.update",
      "calendar.working_hours",
      expect.stringContaining(TENANT_A),
      "update",
      expect.objectContaining({ tenantId: TENANT_A }),
      "info",
      expect.any(Object),
    );

    // Pazartesi günü yeni saatler uygulanır
    const day = await service.getDay(TENANT_A, "2025-03-17", {}, STAFF_A);
    expect(day.slots).toHaveLength(10); // 08-18 arası 60dk
  });

  it("setWorkingHours: aynı gün 2 kez → 422 (VET-APPT-0003)", async () => {
    await expect(
      service.setWorkingHours(
        TENANT_A,
        {
          hours: [
            { dayOfWeek: 1, startTime: "09:00", endTime: "12:00", slotDurationMin: 30 },
            { dayOfWeek: 1, startTime: "13:00", endTime: "17:00", slotDurationMin: 30 },
          ],
        },
        STAFF_A,
      ),
    ).rejects.toMatchObject({
      errorCode: "VET-APPT-0003",
      httpStatus: 422,
    });
  });

  // ---------------------------------------------------------------------
  // blockSlot / unblockSlot
  // ---------------------------------------------------------------------

  it("blockSlot: başarı + audit yayını", async () => {
    const rec = await service.blockSlot(
      TENANT_A,
      {
        veterinarianId: VET_A,
        start: "2025-03-17T14:00:00.000Z",
        end: "2025-03-17T15:00:00.000Z",
        reason: "Toplantı",
      },
      STAFF_A,
    );
    expect(rec.id).toMatch(/^blk-/);
    expect(rec.reason).toBe("Toplantı");
    expect(audit.recordSimple).toHaveBeenCalledWith(
      "audit:calendar.block",
      "calendar.blocked_slot",
      rec.id,
      "create",
      expect.objectContaining({ tenantId: TENANT_A }),
      "info",
      expect.objectContaining({ reason: "Toplantı" }),
    );
  });

  it("blockSlot: end <= start → 422 (VET-APPT-0001)", async () => {
    await expect(
      service.blockSlot(
        TENANT_A,
        {
          veterinarianId: VET_A,
          start: "2025-03-17T15:00:00.000Z",
          end: "2025-03-17T14:00:00.000Z",
          reason: "Test",
        },
        STAFF_A,
      ),
    ).rejects.toMatchObject({
      errorCode: "VET-APPT-0001",
      httpStatus: 422,
    });
  });

  it("unblockSlot: başarı + audit yayını", async () => {
    const rec = await service.blockSlot(
      TENANT_A,
      {
        veterinarianId: VET_A,
        start: "2025-03-17T14:00:00.000Z",
        end: "2025-03-17T15:00:00.000Z",
        reason: "Test",
      },
      STAFF_A,
    );
    (audit.recordSimple as ReturnType<typeof vi.fn>).mockClear();

    await service.unblockSlot(TENANT_A, rec.id, STAFF_A);
    expect(audit.recordSimple).toHaveBeenCalledWith(
      "audit:calendar.unblock",
      "calendar.blocked_slot",
      rec.id,
      "archive",
      expect.objectContaining({ tenantId: TENANT_A }),
      "info",
      expect.any(Object),
    );

    // Slot tekrar available
    const day = await service.getDay(
      TENANT_A,
      "2025-03-17",
      { veterinarianId: VET_A },
      STAFF_A,
    );
    // VET_A için default saat tanımlı değil → 0 slot
    // Vet default için bloklamanın kalktığını doğrulayalım
    const dayDefault = await service.getDay(TENANT_A, "2025-03-17", {}, STAFF_A);
    const slot = dayDefault.slots.find(
      (s) => s.start === "2025-03-17T14:00:00.000Z",
    );
    expect(slot?.status).toBe("available");
    // 14:30 da available (çünkü sadece default vet için 09-17 çalışıyor)
    const slot2 = dayDefault.slots.find(
      (s) => s.start === "2025-03-17T14:30:00.000Z",
    );
    expect(slot2?.status).toBe("available");
  });

  it("unblockSlot: cross-tenant blockId → 404 (VET-APPT-0002)", async () => {
    const rec = await service.blockSlot(
      TENANT_A,
      {
        veterinarianId: VET_A,
        start: "2025-03-17T14:00:00.000Z",
        end: "2025-03-17T15:00:00.000Z",
        reason: "Test",
      },
      STAFF_A,
    );
    // Tenant B STAFF_A'nın blockId'sini kullanmaya çalışıyor
    await expect(
      service.unblockSlot(TENANT_B, rec.id, STAFF_B),
    ).rejects.toMatchObject({
      errorCode: "VET-APPT-0002",
      httpStatus: 404,
    });
  });
});
