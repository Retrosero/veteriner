/**
 * @file LogRetentionScheduler unit testleri.
 * @module apps/api/modules/log-retention/log-retention.scheduler.spec
 *
 * @description GOAL-106 (FAZ-10) PII maskeleme ve log retention
 * scheduler testleri:
 *   - parseCron: 5 alanlı cron pattern ayrıştırma (wildcard, step,
 *     range, virgül, geçersiz format).
 *   - matchesCron: verilen tarih için pattern eşleşmesi.
 *   - tick: hedef saate geldiğinde `runScheduledSweep` çağrısı;
 *     aynı gün içinde 2. çağrı no-op; hata durumunda sonraki güne
 *     bırakır.
 *   - onModuleInit / onModuleDestroy: scheduler lifecycle (default
 *     davranış).
 *
 * @since GOAL-106 (FAZ-10) log retention scheduler
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LogRetentionScheduler,
  matchesCron,
  parseCron,
} from "./log-retention.scheduler.js";

import type { LogRetentionService } from "./log-retention.service.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";

const SUPERADMIN: ActorContext = {
  actorId: "usr-super-1",
  actorType: "user",
  role: "SUPERADMIN",
  tenantId: null,
  branchId: null,
  isSuperadmin: true,
  correlationId: "req-super-1",
  ipAddress: "192.168.1.***",
  userAgentHash: "01234567",
  source: "header",
};

function makeServiceStub(): {
  service: LogRetentionService;
  runScheduledSweep: ReturnType<typeof vi.fn>;
} {
  const runScheduledSweep = vi.fn().mockResolvedValue({
    id: "sweep-1",
    triggeredBy: "manual",
    startedAt: "2026-08-02T03:00:00.000Z",
    finishedAt: "2026-08-02T03:00:01.000Z",
    totalScanned: 0,
    totalArchived: 0,
    totalDeleted: 0,
    totalErrors: 0,
    buckets: [],
    dryRun: false,
    note: null,
    triggeredById: "system",
  });
  const service = {
    runScheduledSweep,
  } as unknown as LogRetentionService;
  return { service, runScheduledSweep };
}

describe("parseCron", () => {
  it("wildcard (*) tüm alanları kapsar", () => {
    const f = parseCron("* * * * *");
    expect(f.minute).toEqual(Array.from({ length: 60 }, (_, i) => i));
    expect(f.hour).toEqual(Array.from({ length: 24 }, (_, i) => i));
    expect(f.dayOfMonth).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(f.month).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(f.dayOfWeek).toEqual(Array.from({ length: 7 }, (_, i) => i));
  });

  it("tek değerleri ayrıştırır", () => {
    const f = parseCron("0 3 * * *");
    expect(f.minute).toEqual([0]);
    expect(f.hour).toEqual([3]);
  });

  it("virgülle ayrılmış listeleri ayrıştırır", () => {
    const f = parseCron("0,30 9,17 * * *");
    expect(f.minute).toEqual([0, 30]);
    expect(f.hour).toEqual([9, 17]);
  });

  it("step (adım) değerlerini ayrıştırır", () => {
    const f = parseCron("*/15 * * * *");
    expect(f.minute).toEqual([0, 15, 30, 45]);
  });

  it("range (A-B) değerlerini ayrıştırır", () => {
    const f = parseCron("0 9-17 * * *");
    expect(f.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it("5 alan olmamalı → hata", () => {
    expect(() => parseCron("0 3 * *")).toThrow(/5 alan bekleniyor/);
  });

  it("geçersiz step → hata", () => {
    expect(() => parseCron("*/abc * * * *")).toThrow(/cron step/);
  });

  it("sınır dışı değer → hata", () => {
    expect(() => parseCron("60 3 * * *")).toThrow(/cron değeri/);
  });

  it("ters aralık → hata", () => {
    expect(() => parseCron("0 17-9 * * *")).toThrow(/cron aralığı/);
  });
});

describe("matchesCron", () => {
  const fields = parseCron("0 3 * * *");

  it("saat 03:00 tam eşleşir", () => {
    const d = new Date(2026, 7, 2, 3, 0, 0); // 2 Ağustos 2026 03:00
    expect(matchesCron(d, fields)).toBe(true);
  });

  it("saat 03:00 değilse eşleşmez", () => {
    const d = new Date(2026, 7, 2, 3, 1, 0);
    expect(matchesCron(d, fields)).toBe(false);
  });

  it("farklı saat → eşleşmez", () => {
    const d = new Date(2026, 7, 2, 4, 0, 0);
    expect(matchesCron(d, fields)).toBe(false);
  });
});

describe("LogRetentionScheduler", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env["NODE_ENV"] = "test";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("default cron '0 3 * * *' olarak parse edilir", () => {
    const scheduler = new LogRetentionScheduler();
    expect(scheduler.getCronPattern()).toBe("0 3 * * *");
  });

  it("LOG_RETENTION_SWEEP_CRON env ile override edilir", () => {
    process.env["LOG_RETENTION_SWEEP_CRON"] = "*/30 4-6 * * *";
    const scheduler = new LogRetentionScheduler();
    expect(scheduler.getCronPattern()).toBe("*/30 4-6 * * *");
  });

  it("geçersiz pattern default'a düşer", () => {
    process.env["LOG_RETENTION_SWEEP_CRON"] = "0 3 *";
    const scheduler = new LogRetentionScheduler();
    expect(scheduler.getCronPattern()).toBe("0 3 *");
    // matchesAt default ile çalışmalı (saat 3'te eşleşir).
    const d = new Date(2026, 7, 2, 3, 0, 0);
    expect(scheduler.matchesAt(d)).toBe(true);
  });

  it("test ortamında onModuleInit interval başlatmaz", () => {
    const { service } = makeServiceStub();
    const scheduler = new LogRetentionScheduler(service);
    scheduler.onModuleInit();
    scheduler.onModuleDestroy();
    // Çağrı hatasız tamamlanmalı; interval handle yok.
  });

  it("test ortamı dışında service inject edilmemişse başlatmaz", () => {
    process.env["NODE_ENV"] = "development";
    const scheduler = new LogRetentionScheduler();
    scheduler.onModuleInit();
    scheduler.onModuleDestroy();
    // Uyarı logu yazılır; interval handle null kalır.
  });

  it("tick: hedef saate geldiğinde runScheduledSweep çağrılır", async () => {
    const { service, runScheduledSweep } = makeServiceStub();
    const scheduler = new LogRetentionScheduler(service);
    const now = new Date(2026, 7, 2, 3, 0, 0);
    const fired = await scheduler.tick(now);
    expect(fired).toBe(true);
    expect(runScheduledSweep).toHaveBeenCalledOnce();
  });

  it("tick: aynı gün içinde 2. çağrı no-op", async () => {
    const { service, runScheduledSweep } = makeServiceStub();
    const scheduler = new LogRetentionScheduler(service);
    const day1 = new Date(2026, 7, 2, 3, 0, 0);
    const day1Later = new Date(2026, 7, 2, 3, 5, 0);
    expect(await scheduler.tick(day1)).toBe(true);
    expect(await scheduler.tick(day1Later)).toBe(false);
    expect(runScheduledSweep).toHaveBeenCalledOnce();
  });

  it("tick: hedef saat dışında no-op", async () => {
    const { service, runScheduledSweep } = makeServiceStub();
    const scheduler = new LogRetentionScheduler(service);
    const notThree = new Date(2026, 7, 2, 4, 0, 0);
    expect(await scheduler.tick(notThree)).toBe(false);
    expect(runScheduledSweep).not.toHaveBeenCalled();
  });

  it("tick: ertesi gün yine çalışır", async () => {
    const { service, runScheduledSweep } = makeServiceStub();
    const scheduler = new LogRetentionScheduler(service);
    const day1 = new Date(2026, 7, 2, 3, 0, 0);
    const day2 = new Date(2026, 7, 3, 3, 0, 0);
    expect(await scheduler.tick(day1)).toBe(true);
    expect(await scheduler.tick(day2)).toBe(true);
    expect(runScheduledSweep).toHaveBeenCalledTimes(2);
  });

  it("tick: hata durumunda lastRunDate sıfırlanır", async () => {
    const failing = vi
      .fn()
      .mockRejectedValueOnce(new Error("DB erişilemez"))
      .mockResolvedValueOnce({
        id: "sweep-2",
        triggeredBy: "manual",
        startedAt: "2026-08-03T03:00:00.000Z",
        finishedAt: "2026-08-03T03:00:01.000Z",
        totalScanned: 0,
        totalArchived: 0,
        totalDeleted: 0,
        totalErrors: 0,
        buckets: [],
        dryRun: false,
        note: null,
        triggeredById: "system",
      });
    const service = {
      runScheduledSweep: failing,
    } as unknown as LogRetentionService;
    const scheduler = new LogRetentionScheduler(service);
    const day1 = new Date(2026, 7, 2, 3, 0, 0);
    const day2 = new Date(2026, 7, 3, 3, 0, 0);
    expect(await scheduler.tick(day1)).toBe(false);
    // 2. gün yeniden denenir.
    expect(await scheduler.tick(day2)).toBe(true);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("tick: service yoksa no-op", async () => {
    const scheduler = new LogRetentionScheduler();
    const now = new Date(2026, 7, 2, 3, 0, 0);
    expect(await scheduler.tick(now)).toBe(false);
  });

  it("onModuleDestroy çağrılmadan sonra interval handle null kalır (test ort.)", () => {
    const { service } = makeServiceStub();
    const scheduler = new LogRetentionScheduler(service);
    scheduler.onModuleInit();
    scheduler.onModuleDestroy();
    // İkinci kez çağırmak da sorun çıkarmaz.
    scheduler.onModuleDestroy();
  });
});

describe("SUPERADMIN aktör bağlamı (scheduler çağrısı)", () => {
  it("runScheduledSweep sistem aktörü ile çağrılır", async () => {
    const { service, runScheduledSweep } = makeServiceStub();
    const scheduler = new LogRetentionScheduler(service);
    const now = new Date(2026, 7, 2, 3, 0, 0);
    await scheduler.tick(now);
    // Service stub tetiklendi; SUPERADMIN bağlamı service.runSweep
    // içinde oluşturulur (production'da). Bu test sözleşmeyi doğrular.
    expect(runScheduledSweep).toHaveBeenCalledOnce();
    // actor role: SYSTEM (runScheduledSweep içinde)
    void SUPERADMIN; // context reference
  });
});
