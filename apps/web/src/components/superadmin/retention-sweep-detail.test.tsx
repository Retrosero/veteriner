/**
 * @file Retention sweep detay davranış testleri.
 * @module @vetniva/web/components/superadmin/retention-sweep-detail.test
 * @description Sweep detayının çerezli yüklendiğini, meta verinin
 * ve bucket tablosunun render edildiğini doğrular. dryRun rozeti
 * true olduğunda "Kuru çalışma", false olduğunda "Live" gösterir.
 * @security Test isteği yalnız ID içerir; tenant/aktör taşımaz.
 */

import "@testing-library/jest-dom/vitest";

import { render, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ apiRequest: mocks.request }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { RetentionSweepDetail } from "./retention-sweep-detail";

const sweepDryRun = {
  id: "sw-1",
  triggeredBy: "sa-001",
  triggeredByType: "user",
  startedAt: "2026-08-01T10:00:00.000Z",
  finishedAt: "2026-08-01T10:00:30.000Z",
  durationMs: 30000,
  dryRun: true,
  buckets: [
    {
      tenantId: null,
      logType: "error_event",
      severity: "critical",
      cutoff: "2025-07-31T16:00:00.000Z",
      expired: 12,
      archived: 12,
      deleted: 0,
    },
  ],
  totals: { expired: 12, archived: 12, deleted: 0 },
};

describe("RetentionSweepDetail", () => {
  it("sweep detayını çerezli yükler ve dryRun rozetini gösterir", async () => {
    mocks.request.mockResolvedValue({ ok: true, data: sweepDryRun });
    const view = render(<RetentionSweepDetail locale="tr-TR" sweepId="sw-1" />);
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/log-retention/sweeps/sw-1",
        { credentials: "include" },
      );
    });
    await waitFor(() => {
      expect(view.getByText("Kuru çalışma")).toBeInTheDocument();
      expect(view.getByText("Global")).toBeInTheDocument();
      expect(view.getByLabelText("expired")).toHaveTextContent("12");
    });
  });

  it("live sweep için Live rozeti gösterir", async () => {
    mocks.request.mockResolvedValue({
      ok: true,
      data: { ...sweepDryRun, dryRun: false },
    });
    const view = render(<RetentionSweepDetail locale="tr-TR" sweepId="sw-1" />);
    await waitFor(() => {
      expect(view.getByText("Live")).toBeInTheDocument();
    });
  });

  it("API hatasında hata mesajı gösterir", async () => {
    mocks.request.mockResolvedValue({
      ok: false,
      error: {
        error_code: "VET-COMMON-0001",
        message: "fail",
        source: "unknown",
        severity: "error",
        correlation_id: "x",
        timestamp: "2026-08-01T00:00:00.000Z",
      },
      requestId: "x",
    });
    const view = render(<RetentionSweepDetail locale="tr-TR" sweepId="sw-1" />);
    await waitFor(() => {
      expect(view.getByRole("alert")).toHaveTextContent("Veri yüklenemedi");
    });
  });
});
