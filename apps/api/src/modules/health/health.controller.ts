/**
 * @file HealthController.
 * @module apps/api/modules/health
 * @description Liveness ve readiness endpoint'leri.
 *
 * - `GET /api/v1/health` → süreç sağlık kontrolü
 * - `GET /api/v1/health/ready` → bağımlılık sağlık kontrolü (DB).
 *
 * OpenAPI: her method `@ApiOperation` ve `@ApiResponse` ile etiketlidir.
 * Idempotent: GET metodu, yan etkisiz.
 */

import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  readinessResponseSchema,
  type LivenessResponse,
  type ReadinessResponse,
} from "@vetniva/contracts";

import { HealthService } from "./health.service.js";
import { Public } from "../../common/decorators/public.decorator.js";

const APP_VERSION = process.env["APP_VERSION"] ?? "0.0.0";

@ApiTags("health")
@Public()
@Controller("api/v1/health")
export class HealthController {
  public constructor(private readonly health: HealthService) {}

  /**
   * Liveness kontrolü. Sürecin ayakta olduğunu doğrular; herhangi bir
   * bağımlılığı test etmez.
   * @returns {LivenessResponse} Süreç sağlık bilgisi.
   */
  @Get()
  @ApiOperation({
    operationId: "healthLiveness",
    summary: "Süreç liveness kontrolü",
    description:
      "API sürecinin ayakta olduğunu doğrular. Bağımlılıkları kontrol etmez.",
  })
  @ApiResponse({ status: 200, description: "Süreç çalışıyor." })
  public liveness(): LivenessResponse {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness kontrolü. Veritabanı bağlantısını test eder. DB yoksa
   * `degraded` yerine `down` döner; bu durumda yük dengeleyici
   * trafiği keser.
   * @returns {Promise<ReadinessResponse>} Bağımlılık sağlık bilgisi.
   */
  @Get("ready")
  @ApiOperation({
    operationId: "healthReadiness",
    summary: "Bağımlılık readiness kontrolü",
    description: "Veritabanı bağlantısını doğrular; latency_ms raporlar.",
  })
  @ApiResponse({ status: 200, description: "Tüm bağımlılıklar hazır." })
  @ApiResponse({
    status: 503,
    description: "Bir veya daha fazla bağımlılık yanıt vermiyor.",
  })
  public async readiness(): Promise<ReadinessResponse> {
    const db = await this.health.checkDatabase();
    const overall = db.status === "ok" ? "ok" : "down";
    const buildSha = process.env["APP_BUILD_SHA"] ?? "devlocal";
    const buildTime = process.env["APP_BUILD_TIME"] ?? new Date().toISOString();
    const body: ReadinessResponse = {
      status: overall,
      timestamp: new Date().toISOString(),
      version: {
        name: "vetniva-api",
        version: APP_VERSION,
        build_sha: buildSha,
        build_time: buildTime,
      },
      components: {
        db: {
          status: db.status,
          ...(db.latency_ms !== undefined ? { latency_ms: db.latency_ms } : {}),
          ...(db.message ? { message: db.message } : {}),
        },
      },
    };
    return readinessResponseSchema.parse(body);
  }
}
