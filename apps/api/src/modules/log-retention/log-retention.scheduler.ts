/**
 * @file Log retention günlük scheduled sweep.
 * @module apps/api/modules/log-retention/log-retention.scheduler
 *
 * @description GOAL-106 (FAZ-10) her gün saat 03:00 (yerel saat) sistem
 * aktörü ile `LogRetentionService.runScheduledSweep()` çağrısı yapar.
 * BullMQ veya @nestjs/schedule bağımlılığı olmadan, sadece `setInterval`
 * üzerinden dakikada-bir kontrol ile hedef saati yakalar.
 *
 * Davranış:
 * - `onModuleInit` scheduler'ı başlatır (uygulama açılışında).
 * - `onModuleDestroy` interval'i temizler (graceful shutdown).
 * - `LOG_RETENTION_SWEEP_CRON` env değişkeni opsiyonel olarak cron
 *   pattern (5-field) verir; default `0 3 * * *` (günde bir 03:00).
 * - Bir günde birden fazla çalıştırma engellenir (son çalıştırma
 *   tarihi `lastRunDate` değişkeninde tutulur).
 * - Hata durumunda loglama yapılır; scheduler çökmez; bir sonraki
 *   gün tekrar denenir.
 * - Test ortamında (`NODE_ENV=test` veya `LOG_RETENTION_SCHEDULER_DISABLED=true`)
 *   scheduler başlatılmaz; `runScheduledSweep` çağrısı dışarıdan yapılabilir.
 *
 * @security Scheduler yalnızca SUPERADMIN/SYSTEM yetkisiyle çalışır;
 *   tüm sweep aksiyonları `app.is_superadmin=true` + `app.system_write=true`
 *   bağlamı altında yürütülür.
 *
 * @since GOAL-106 (FAZ-10) PII maskeleme ve log retention scheduler
 */

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";

import { LogRetentionService } from "./log-retention.service.js";

/** Default cron pattern: her gün saat 03:00. */
const DEFAULT_CRON = "0 3 * * *";

/** Scheduler tick aralığı (ms). 1 dakika yeterli: hedef saat 1 dakika hassasiyetle çalışır. */
const TICK_MS = 60_000;

/** 5-field cron parser state machine. */
interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

/**
 * 5-field cron pattern'i parse eder. Desteklenen formatlar:
 * - `*` — her değer
 * - `N` — tek değer
 * - `N,M` — birden fazla değer
 * - `STAR/N` — adım değeri (N aralıkla; STAR = yıldız)
 * - `A-B` — aralık (örn. 1-5)
 *
 * @param pattern
 */
export function parseCron(pattern: string): CronFields {
  const parts = pattern.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(
      `Geçersiz cron pattern: 5 alan bekleniyor (dakika saat gun ay haftanin_gunu), "${pattern}" alindi.`,
    );
  }
  const [minute, hour, dom, month, dow] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  return {
    minute: parseField(minute ?? "*", 0, 59),
    hour: parseField(hour ?? "*", 0, 23),
    dayOfMonth: parseField(dom ?? "*", 1, 31),
    month: parseField(month ?? "*", 1, 12),
    dayOfWeek: parseField(dow ?? "*", 0, 6),
  };
}

/**
 * Tek bir cron alanını parse eder. Sınırlar dahilinde.
 * @param expr
 * @param min
 * @param max
 */
function parseField(expr: string, min: number, max: number): number[] {
  const out = new Set<number>();
  for (const part of expr.split(",")) {
    const trimmed = part.trim();
    if (!trimmed || trimmed === "*") {
      for (let i = min; i <= max; i++) out.add(i);
      continue;
    }
    if (trimmed.startsWith("*/")) {
      const step = Number.parseInt(trimmed.slice(2), 10);
      if (!Number.isFinite(step) || step <= 0) {
        throw new Error(`Geçersiz cron step: "${trimmed}"`);
      }
      for (let i = min; i <= max; i += step) out.add(i);
      continue;
    }
    if (trimmed.includes("-")) {
      const [aStr, bStr] = trimmed.split("-");
      const a = Number.parseInt(aStr ?? "", 10);
      const b = Number.parseInt(bStr ?? "", 10);
      if (
        !Number.isFinite(a) ||
        !Number.isFinite(b) ||
        a < min ||
        b > max ||
        a > b
      ) {
        throw new Error(`Geçersiz cron aralığı: "${trimmed}"`);
      }
      for (let i = a; i <= b; i++) out.add(i);
      continue;
    }
    const single = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(single) || single < min || single > max) {
      throw new Error(`Geçersiz cron değeri: "${trimmed}"`);
    }
    out.add(single);
  }
  return Array.from(out).sort((a, b) => a - b);
}

/**
 * Verilen tarih, cron pattern ile eşleşiyor mu?
 * - dayOfMonth ve dayOfWeek birlikte kullanıldığında Vixie cron
 *   semantiği uygulanır (OR): biri eşleşiyorsa geçer.
 * - Burada yaygın kullanım: biri `*` ise yalnız diğeri kontrol edilir.
 *
 * @param date
 * @param fields
 */
export function matchesCron(date: Date, fields: CronFields): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1; // 1-12
  const dow = date.getDay(); // 0=Pazar
  if (!fields.minute.includes(minute)) return false;
  if (!fields.hour.includes(hour)) return false;
  if (!fields.month.includes(month)) return false;
  // Vixie cron: dayOfMonth ve dayOfWeek'ten biri * ise yalnız diğerine
  // bakılır; aksi halde OR semantiği uygulanır (her ikisi * ise
  // ikisi de kabul edilir).
  const domStar = fields.dayOfMonth.length === 31;
  const dowStar = fields.dayOfWeek.length === 7;
  if (domStar && dowStar) return true;
  if (domStar) return fields.dayOfWeek.includes(dow);
  if (dowStar) return fields.dayOfMonth.includes(dom);
  return fields.dayOfMonth.includes(dom) || fields.dayOfWeek.includes(dow);
}

/**
 * Verilen iki tarih aynı yerel güne mi denk geliyor?
 * @param a
 * @param b
 */
function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

@Injectable()
export class LogRetentionScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogRetentionScheduler.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private lastRunDate: Date | null = null;
  private readonly cronPattern: string;
  private readonly disabled: boolean;
  private readonly parsedCron: CronFields;

  public constructor(
    @Optional()
    @Inject(LogRetentionService)
    private readonly service?: LogRetentionService,
  ) {
    this.cronPattern = process.env["LOG_RETENTION_SWEEP_CRON"] ?? DEFAULT_CRON;
    this.disabled =
      process.env["LOG_RETENTION_SCHEDULER_DISABLED"] === "true" ||
      process.env["NODE_ENV"] === "test";
    try {
      this.parsedCron = parseCron(this.cronPattern);
    } catch (err) {
      this.logger.error(
        `Geçersiz LOG_RETENTION_SWEEP_CRON: ${(err as Error).message}. Default (${DEFAULT_CRON}) kullanılıyor.`,
      );
      this.parsedCron = parseCron(DEFAULT_CRON);
    }
  }

  /**
   * Pattern geçerli mi? Test yardımcısı.
   */
  public getCronPattern(): string {
    return this.cronPattern;
  }

  /**
   * Cron pattern'i test eder: verilen tarih eşleşiyor mu?
   * @param date
   */
  public matchesAt(date: Date): boolean {
    return matchesCron(date, this.parsedCron);
  }

  public onModuleInit(): void {
    if (this.disabled) {
      this.logger.log(
        "Log retention scheduler devre dışı (test ortamı veya LOG_RETENTION_SCHEDULER_DISABLED=true).",
      );
      return;
    }
    if (!this.service) {
      this.logger.warn(
        "LogRetentionService enjekte edilmedi; scheduler başlatılmadı.",
      );
      return;
    }
    this.intervalHandle = setInterval(() => {
      void this.tick();
    }, TICK_MS);
    this.logger.log(
      `Log retention scheduler başlatıldı: cron="${this.cronPattern}" tick=${TICK_MS}ms.`,
    );
  }

  public onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.log("Log retention scheduler durduruldu.");
    }
  }

  /**
   * Tek bir tick: hedef saate geldiyse ve bugün daha önce
   * çalıştırılmadıysa sweep çağrılır. Hatalar yutulmaz, loglanır.
   */
  public async tick(now: Date = new Date()): Promise<boolean> {
    if (!this.service) return false;
    if (this.lastRunDate && isSameLocalDay(this.lastRunDate, now)) {
      return false; // bugün zaten çalıştı.
    }
    if (!matchesCron(now, this.parsedCron)) return false;
    this.lastRunDate = now;
    this.logger.log(
      `Scheduled sweep tetiklendi: ${now.toISOString()} (cron=${this.cronPattern}).`,
    );
    try {
      const result = await this.service.runScheduledSweep();
      this.logger.log(
        `Scheduled sweep tamamlandı: scanned=${result.totalScanned} ` +
          `archived=${result.totalArchived} deleted=${result.totalDeleted} ` +
          `errors=${result.totalErrors}.`,
      );
      return true;
    } catch (err) {
      this.logger.error(
        `Scheduled sweep başarısız: ${(err as Error).message}`,
        err instanceof Error ? err.stack : String(err),
      );
      // Hata durumunda lastRunDate'i sıfırla ki yarın tekrar denensin.
      this.lastRunDate = null;
      return false;
    }
  }
}
