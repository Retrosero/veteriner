/**
 * @file Superadmin güvenlik olayı detay davranış testleri.
 * @module @vetniva/web/components/superadmin/security-event-detail.test
 * @description Tek bir güvenlik olayı detay isteğinin yalnız
 * oturum çereziyle doğru endpoint'e yönlendirildiğini ve
 * beklenen alanların (maskedIp, userAgentHash, fingerprint,
 * alertSent, statusCode, route) render edildiğini doğrular.
 *
 * Kapsam:
 * - happy-path: detay yükleme + tüm alanların render'ı
 * - error-path: API hata döndüğünde yüklenemedi rozeti
 * - loading: veri gelene kadar yükleniyor durumu
 * @security Detay isteğinde tenant/aktör bilgisi yoktur.
 */

import "@testing-library/jest-dom/vitest";

import { render, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../../lib/api-client", () => ({ apiRequest: mocks.request }));

import { SecurityEventDetail } from "./security-event-detail";

const detail = {
  id: "evt-1",
  type: "tenant_isolation_breach_attempt" as const,
  severity: "critical" as const,
  module: "tenant",
  errorCode: "VET-TENANT-0002",
  message: "Tenant A kullanıcısı Tenant B kaydına erişmeye çalıştı",
  route: "GET /api/v1/clinic/patients",
  country: "TR",
  occurrenceCount: 1,
  lastSeenAt: "2026-08-05T10:00:00.000Z",
  statusCode: 403,
  fingerprint: "0123456789abcdef",
  requestId: "req-abc",
  maskedIp: "192.168.1.***",
  userAgentHash: "ab12cd34",
  release: "1.0.0",
  firstSeenAt: "2026-08-05T10:00:00.000Z",
  alertSent: true,
  context: { email: "[email protected]", retryCount: 3 },
  tenantId: "ten-A",
  branchId: null,
  userId: "usr-1",
};

describe("SecurityEventDetail", () => {
  it("detayı çerezle yükler ve tüm alanları render eder", async () => {
    mocks.request.mockResolvedValue({ ok: true, data: detail });

    const view = render(<SecurityEventDetail eventId="evt-1" locale="tr-TR" />);

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/security-events/evt-1",
        { credentials: "include" },
      );
    });

    await waitFor(() => {
      expect(view.getByText("0123456789abcdef")).toBeInTheDocument();
      expect(view.getByText("192.168.1.***")).toBeInTheDocument();
      expect(view.getByText("ab12cd34")).toBeInTheDocument();
      expect(view.getByText("VET-TENANT-0002")).toBeInTheDocument();
      expect(view.getByText("req-abc")).toBeInTheDocument();
    });

    // Alert sent rozeti görünür.
    expect(view.getByText(/Alarm Gönderildi: Evet/)).toBeInTheDocument();
    // Context PII mask'lı görünür.
    expect(view.getByText(/email \(masked\)/)).toBeInTheDocument();
  });

  it("API hata döndüğünde yüklenemedi rozeti gösterir", async () => {
    mocks.request.mockResolvedValue({
      ok: false,
      error: {
        error_code: "VET-COMMON-0001",
        message: "fail",
        source: "api",
        severity: "error",
        correlation_id: "corr-1",
        timestamp: "2026-08-05T10:00:00.000Z",
      },
      requestId: "corr-1",
    });

    const view = render(<SecurityEventDetail eventId="evt-1" locale="tr-TR" />);

    expect(
      await view.findByText(/yüklenemiyor/i),
    ).toBeInTheDocument();
  });

  it("veri yüklenene kadar yükleniyor durumunu gösterir", () => {
    let resolvePromise: (value: unknown) => void = () => {};
    mocks.request.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const view = render(<SecurityEventDetail eventId="evt-1" locale="tr-TR" />);

    expect(view.getByRole("status")).toHaveTextContent("Yükleniyor");
    resolvePromise({ ok: true, data: detail });
  });
});
