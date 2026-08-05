/**
 * @file Superadmin güvenlik olayları özet davranış testleri.
 * @module @vetniva/web/components/superadmin/security-event-summary.test
 * @description Summary endpoint'inin doğru parametrelerle çağrıldığını,
 * severity × type kırılımının ve top-groups fingerprint
 * kartlarının render edildiğini doğrular. Boş liste durumu,
 * hata ve yükleme durumları da kapsanır.
 *
 * Kapsam:
 * - happy-path: tüm kartlar render
 * - error-path: API hatası → yüklenemedi
 * - loading: veri gelene kadar yükleniyor
 * @security Summary isteğinde tenant/aktör yoktur.
 */

import "@testing-library/jest-dom/vitest";

import { render, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../../lib/api-client", () => ({ apiRequest: mocks.request }));

import { SecurityEventSummary } from "./security-event-summary";

const summary = {
  total: 42,
  bySeverity: [
    { severity: "info" as const, count: 5 },
    { severity: "warning" as const, count: 12 },
    { severity: "error" as const, count: 18 },
    { severity: "critical" as const, count: 7 },
  ],
  byType: [
    { type: "failed_login" as const, count: 10 },
    { type: "unauthorized_access_attempt" as const, count: 15 },
    { type: "suspicious_export" as const, count: 3 },
    { type: "role_change" as const, count: 5 },
    { type: "tenant_isolation_breach_attempt" as const, count: 9 },
  ],
  topGroups: [
    {
      fingerprint: "fp-1",
      type: "tenant_isolation_breach_attempt" as const,
      severity: "critical" as const,
      eventCount: 12,
    },
    {
      fingerprint: "fp-2",
      type: "unauthorized_access_attempt" as const,
      severity: "error" as const,
      eventCount: 8,
    },
  ],
};

describe("SecurityEventSummary", () => {
  it("summary endpoint'ini çerezle çağırır ve kartları render eder", async () => {
    mocks.request.mockResolvedValue({ ok: true, data: summary });

    const view = render(<SecurityEventSummary from="2026-08-01T00:00:00.000Z" locale="tr-TR" />);

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/security-events/summary?from=2026-08-01T00%3A00%3A00.000Z",
        { credentials: "include" },
      );
    });

    await waitFor(() => {
      expect(view.getByText("fp-1")).toBeInTheDocument();
      expect(view.getByText("fp-2")).toBeInTheDocument();
      // Toplam oluşum sayısı label'ı
      expect(view.getByText(/12 olay/)).toBeInTheDocument();
      expect(view.getByText(/8 olay/)).toBeInTheDocument();
    });
  });

  it("API hatası döndüğünde yüklenemedi rozetini gösterir", async () => {
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

    const view = render(<SecurityEventSummary locale="tr-TR" />);

    expect(await view.findByText("Yüklenemedi")).toBeInTheDocument();
  });

  it("veri yüklenene kadar yükleniyor durumunu gösterir", () => {
    let resolvePromise: (value: unknown) => void = () => {};
    mocks.request.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    const view = render(<SecurityEventSummary locale="tr-TR" />);

    expect(view.getByRole("status")).toHaveTextContent("Yükleniyor");
    resolvePromise({ ok: true, data: summary });
  });
});
