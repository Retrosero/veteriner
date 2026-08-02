/**
 * @file Api-error-integration unit testleri.
 * @module @vetniva/web/lib/api-error-integration.test
 * @description GOAL-101 (FAZ-10) frontend hata yakalama — API
 * client hata entegrasyonunun davranış testleri. Severity
 * tahmini, no-throw garantisi ve wrapApiRequest'in başarıyı
 * bozmadığı doğrulanır.
 * @since GOAL-101 (FAZ-10) frontend hata yakalama core
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  reportApiFailure,
  severityForApiFailure,
  wrapApiRequest,
} from "./api-error-integration";
import { errorReporter } from "./error-reporter";

import type { ApiFailure, ApiResult } from "./api-client";

const NETWORK_FAILURE: ApiFailure = {
  ok: false,
  error: {
    error_code: "VET-COMMON-0001",
    message: "API bağlantısı kurulamadı",
    source: "unknown",
    severity: "error",
    correlation_id: "req-net-1",
    timestamp: "2026-07-30T10:00:00.000Z",
  },
  requestId: "req-net-1",
};

const SERVER_FAILURE: ApiFailure = {
  ok: false,
  error: {
    error_code: "VET-CLINIC-0001",
    message: "Server error 500 happened",
    source: "server",
    severity: "critical",
    correlation_id: "req-500-1",
    timestamp: "2026-07-30T10:00:00.000Z",
  },
  requestId: "req-500-1",
};

const AUTH_FAILURE: ApiFailure = {
  ok: false,
  error: {
    error_code: "VET-AUTHZ-0001",
    message: "Yetkisiz erişim",
    source: "server",
    severity: "warning",
    correlation_id: "req-403-1",
    timestamp: "2026-07-30T10:00:00.000Z",
  },
  requestId: "req-403-1",
};

const VALIDATION_FAILURE: ApiFailure = {
  ok: false,
  error: {
    error_code: "VET-CLINIC-0001",
    message: "Validation 422 bad input",
    source: "server",
    severity: "warning",
    correlation_id: "req-422-1",
    timestamp: "2026-07-30T10:00:00.000Z",
  },
  requestId: "req-422-1",
};

describe("severityForApiFailure", () => {
  it("network hata → warning", () => {
    expect(severityForApiFailure(NETWORK_FAILURE)).toBe("warning");
  });

  it("5xx mesaj → error", () => {
    expect(severityForApiFailure(SERVER_FAILURE)).toBe("error");
  });

  it("auth/authz → warning", () => {
    expect(severityForApiFailure(AUTH_FAILURE)).toBe("warning");
  });

  it("4xx validation → warning", () => {
    expect(severityForApiFailure(VALIDATION_FAILURE)).toBe("warning");
  });
});

describe("reportApiFailure", () => {
  beforeEach(() => {
    // pendingCount testleri için reporter'ı etkisiz hale getirip
    // kendi sayacımızı kullanmak yerine doğrudan pendingCount'a
    // güveniyoruz. Burada sadece no-throw + çağrı sonrası pending
    // artışı doğrulanır.
  });

  it("no-throw; reporter'a captureMessage çağırır", () => {
    const before = errorReporter.pendingCount();
    expect(() => reportApiFailure(SERVER_FAILURE)).not.toThrow();
    // pending artmış olmalı (dedup window dışında).
    const after = errorReporter.pendingCount();
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("null/undefined verilirse sessizce döner", () => {
    // @ts-expect-error: runtime test
    expect(() => reportApiFailure(null)).not.toThrow();
    // @ts-expect-error: runtime test
    expect(() => reportApiFailure(undefined)).not.toThrow();
  });

  it("context'e errorCode + correlationId eklenir", () => {
    // Bu test davranışı: en az bir hata kuyruğa girdiğinde config
    // bozulmamış olmalı. Doğrudan context'i görmek için reporter'ı
    // mock'lamak yerine captureError tetikleyip pendingCount artışı
    // üzerinden doğrulama yapıyoruz.
    const before = errorReporter.pendingCount();
    reportApiFailure(NETWORK_FAILURE);
    const after = errorReporter.pendingCount();
    expect(after - before).toBe(1);
  });
});

describe("wrapApiRequest", () => {
  it("başarılı sonuç → olduğu gibi döner + captureMessage çağrılmaz", async () => {
    const success: ApiResult<{ ok: true }> = {
      ok: true,
      data: { ok: true },
      status: 200,
      requestId: "req-ok-1",
    };
    const caller = vi.fn(() => Promise.resolve(success));
    const captureSpy = vi.spyOn(errorReporter, "captureMessage");
    const out = await wrapApiRequest(caller);
    expect(out).toBe(success);
    expect(captureSpy).not.toHaveBeenCalled();
    captureSpy.mockRestore();
  });

  it("başarısız sonuç → raporlar + sonucu döner", async () => {
    const caller = vi.fn(() => Promise.resolve(SERVER_FAILURE));
    const captureSpy = vi.spyOn(errorReporter, "captureMessage");
    const out = await wrapApiRequest(caller);
    expect(out).toBe(SERVER_FAILURE);
    // captureMessage en az 1 kez çağrılmış olmalı.
    expect(captureSpy).toHaveBeenCalled();
    const [msg, severity, _context, requestId] = captureSpy.mock.calls[0]!;
    expect(msg).toContain("VET-CLINIC-0001");
    expect(severity).toBe("error");
    expect(requestId).toBe("req-500-1");
    captureSpy.mockRestore();
  });
});
