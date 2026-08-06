/**
 * @file JobRunDetail davranış testleri.
 * @module @vetniva/web/components/superadmin/job-run-detail.test
 * @description Detay, retry, finish ve attempts endpoint çağrılarının
 * yalnız oturum çereziyle doğru path'lere yönlendirildiğini doğrular.
 * Status bazlı aksiyon gating (retry yalnızca failed/dead_letter,
 * finish yalnızca running) test edilir.
 *
 * @security Test isteği tenant veya aktör kimliği taşımaz.
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../../lib/api-client", () => ({ apiRequest: mocks.request }));

import { JobRunDetail } from "./job-run-detail";

const failedDetail = {
  id: "run-1",
  jobKey: "invoice-timeout-2026-08-05",
  queueName: "billing.invoice",
  jobName: "SendInvoice",
  attempt: 3,
  status: "failed" as const,
  source: "queue" as const,
  triggeredBy: "retry" as const,
  errorCode: "VET-JOBRUN-0001",
  startedAt: "2026-08-05T10:00:00.000Z",
  finishedAt: "2026-08-05T10:00:42.000Z",
  durationMs: 42_000,
  tenantId: "tenant-acme",
  branchId: "br-1",
  country: "TR",
  input: { id: "inv-1" },
  output: null,
  errorStack: "Error: timeout\n    at handler",
  maxAttempts: 5,
  triggeredByUserId: "usr-dev-1",
  correlationId: "req-abc",
};

const runningDetail = {
  ...failedDetail,
  id: "run-2",
  status: "running" as const,
  finishedAt: null,
  durationMs: null,
  errorCode: null,
  errorStack: null,
};

const renderDetail = (id: string) =>
  render(<JobRunDetail locale="tr-TR" runId={id} />);

describe("JobRunDetail", () => {
  it("detayı çerezle yükler, failed run için retry çağrısı yapar (happy-path)", async () => {
    mocks.request.mockImplementation(
      (path: string, init?: { method?: string; credentials?: string }) => {
        if (typeof path === "string" && path.includes("/attempts/")) {
          return Promise.resolve({
            ok: true,
            data: { items: [], total: 0 },
          });
        }
        if (init?.method === "POST") {
          return Promise.resolve({ ok: true, data: {} });
        }
        return Promise.resolve({ ok: true, data: failedDetail });
      },
    );

    const view = renderDetail("run-1");

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/job-runs/run-1",
        { credentials: "include" },
      );
    });

    // Failed run için retry aktif; running run için devre dışı.
    const retryButton = view.getByRole("button", { name: "Yeniden dene" });
    const finishButton = view.getByRole("button", {
      name: "Run'ı sonlandır",
    });
    expect(retryButton).not.toBeDisabled();
    expect(finishButton).toBeDisabled();

    fireEvent.click(retryButton);
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/job-runs/run-1/retry",
        {
          method: "POST",
          credentials: "include",
          body: {},
        },
      );
    });

    // Attempts çağrısı jobKey ile yapılır.
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/job-runs/attempts/invoice-timeout-2026-08-05",
        { credentials: "include" },
      );
    });
  });

  it("running run için finish butonu aktiftir ve finish çağrısı yapar (happy-path)", async () => {
    mocks.request.mockImplementation(
      (path: string, init?: { method?: string; credentials?: string }) => {
        if (typeof path === "string" && path.includes("/attempts/")) {
          return Promise.resolve({
            ok: true,
            data: { items: [], total: 0 },
          });
        }
        if (init?.method === "POST") {
          return Promise.resolve({ ok: true, data: {} });
        }
        return Promise.resolve({ ok: true, data: runningDetail });
      },
    );

    const view = renderDetail("run-2");

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/job-runs/run-2",
        { credentials: "include" },
      );
    });

    const finishButton = view.getByRole("button", {
      name: "Run'ı sonlandır",
    });
    const retryButton = view.getByRole("button", { name: "Yeniden dene" });
    expect(finishButton).not.toBeDisabled();
    expect(retryButton).toBeDisabled();

    fireEvent.click(finishButton);
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/job-runs/run-2/finish",
        {
          method: "POST",
          credentials: "include",
          body: {},
        },
      );
    });
  });

  it("detay yüklenemediğinde 'yüklenemedi' mesajını gösterir (error-path)", async () => {
    mocks.request.mockResolvedValue({
      ok: false,
      error: {
        error_code: "VET-AUDIT-0002",
        message: "Job run bulunamadı",
        source: "unknown",
        severity: "error",
        correlation_id: "req-2",
        timestamp: "2026-08-05T10:00:00.000Z",
      },
      requestId: "req-2",
    });
    const view = renderDetail("run-missing");
    await waitFor(() => {
      expect(
        view.getByText("Job run ayrıntısı şu anda yüklenemiyor."),
      ).toBeInTheDocument();
    });
  });
});
