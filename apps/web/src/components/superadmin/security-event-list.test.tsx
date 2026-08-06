/**
 * @file Superadmin güvenlik olayları liste davranış testleri.
 * @module @vetniva/web/components/superadmin/security-event-list.test
 * @description Liste isteğinin oturum çerezi ile yapıldığını ve
 * kullanıcı filtrelerinin yalnız izinli API sorgu parametrelerine
 * dönüştüğünü doğrular. Tenant veya aktör kimliği istemciden
 * eklenmez; boş filtre değerleri sorguya taşınmaz.
 *
 * Kapsam:
 * - happy-path: filtre olmadan ilk istek + filtrelerin URL'e yansıması
 * - error-path: API hata döndüğünde yüklenemedi rozeti
 * - loading: veri gelene kadar loading durumu
 * @security Test isteğinde tenant/aktör bilgisi yoktur.
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../../lib/api-client", () => ({ apiRequest: mocks.request }));

import { SecurityEventList } from "./security-event-list";

const SAMPLE_ROW = {
  id: "evt-1",
  type: "failed_login" as const,
  severity: "warning" as const,
  module: "auth",
  errorCode: "VET-AUTH-0002",
  message: "Çok sayıda başarısız giriş",
  route: "POST /api/v1/auth/login",
  country: "TR",
  occurrenceCount: 4,
  lastSeenAt: "2026-08-05T10:00:00.000Z",
  alertSent: false,
};

describe("SecurityEventList", () => {
  it("çerezli başlangıç isteği gönderir ve filtreleri sorguya taşır", async () => {
    mocks.request.mockResolvedValue({
      ok: true,
      data: { items: [SAMPLE_ROW], total: 1 },
    });

    render(<SecurityEventList locale="tr-TR" />);

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/security-events?limit=50&offset=0",
        { credentials: "include" },
      );
    });

    fireEvent.change(screen.getByLabelText("Tür"), {
      target: { value: "failed_login" },
    });
    fireEvent.change(screen.getByLabelText("Şiddet"), {
      target: { value: "critical" },
    });
    fireEvent.change(screen.getByLabelText("Tenant"), {
      target: { value: "  ten-123  " },
    });
    fireEvent.change(screen.getByLabelText("Ülke"), {
      target: { value: "tr" },
    });
    fireEvent.change(screen.getByLabelText("Ara"), {
      target: { value: "  VET-AUTH-0002  " },
    });

    await waitFor(() => {
      expect(mocks.request).toHaveBeenLastCalledWith(
        "/api/v1/superadmin/security-events?limit=50&offset=0&type=failed_login&severity=critical&tenantId=ten-123&country=TR&search=VET-AUTH-0002",
        { credentials: "include" },
      );
    });
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

    render(<SecurityEventList locale="tr-TR" />);

    expect(await screen.findByText("Yüklenemedi")).toBeInTheDocument();
  });

  it("veri yüklenene kadar loading durumunu gösterir", () => {
    let resolvePromise: (value: unknown) => void = () => {};
    mocks.request.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    render(<SecurityEventList locale="tr-TR" />);

    expect(screen.getByRole("status")).toHaveTextContent("Yükleniyor");
    resolvePromise({
      ok: true,
      data: { items: [], total: 0 },
    });
  });
});
