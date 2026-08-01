/**
 * @file HealthService.
 * @module apps/api/modules/health
 * @description Liveness ve readiness kontrolleri. Liveness yalnızca
 * sürecin ayakta olduğunu doğrular. Readiness DB bağlantısını test
 * eder ve sonucu latency_ms ile birlikte raporlar. Güvenlik: tenant
 * bağlamı yoktur; DB sorgusu `SELECT 1` ile sınırlıdır ve PII içermez.
 */

import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  public constructor(private readonly prisma: PrismaService) {}

  /**
   * Veritabanı bağlantısını test eder. Hata durumunda `down` döner.
   * @returns {Promise<object>} DB durumu ve ölçülen gecikme (ms).
   */
  public async checkDatabase(): Promise<{
    status: "ok" | "down";
    latency_ms?: number;
    message?: string;
  }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", latency_ms: Date.now() - start };
    } catch (err) {
      this.logger.error(
        "Veritabanı bağlantı hatası",
        err instanceof Error ? err.stack : String(err),
      );
      return { status: "down", message: "Veritabanı erişilemez" };
    }
  }
}
