/**
 * @file Retention sweep listesi davranış testleri.
 * @module @vetniva/web/components/superadmin/retention-sweep-list.test
 * @description Tarih filtrelerinin ISO-8601'e dönüştürülerek query'ye
 * yazıldığını, sweep listesinin tablo halinde render edildiğini ve
 * detay linkinin üretildiğini doğrular. Hata ve boş durumlar için
 * ekran okuyucu dostu mesajlar görüntülenir.
 * @security Test isteği yalnız query parametrelerini taşır; tenant
 * veya aktör kimliği içermez.
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ apiRequest: mocks.request }));

import { RetentionSweepList } from "./retention-sweep-list";

describe("RetentionSweepList", () => {
  it("başlangıç isteğini çerezle gönderir", async () => {
    mocks.request.mockResolvedValue({ ok: true, data: { items: [], total: 0 } });
    const view = render(<RetentionSweepList locale="tr-TR" />);

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/log-retention/sweeps?limit=50&offset=0",
        { credentials: "include" },
      );
    });
    expect(view.getByRole("status")).toHaveTextContent("Kayıt bulunamadı");
  });

  it("tarih filtrelerini ISO-8601 olarak query'ye yazar", async () => {
    mocks.request.mockResolvedValue({ ok: true, data: { items: [], total: 0 } });
    const view = render(<RetentionSweepList locale="tr-TR" />);

    fireEvent.change(view.getByLabelText("Başlangıç"), {
      target: { value: "2026-08-01T10:00" },
    });
    fireEvent.change(view.getByLabelText("Bitiş"), {
      target: { value: "2026-08-02T10:00" },
    });

    await waitFor(() => {
      const lastCall = mocks.request.mock.calls.at(-1);
      expect(lastCall?.[0]).toMatch(
        /\/api\/v1\/superadmin\/log-retention\/sweeps\?limit=50&offset=0&from=/,
      );
      expect(lastCall?.[0]).toContain("to=2026-08-02T07%3A00%3A00.000Z");
    });
  });

  it("sweep listesini render eder ve detay linki üretir", async () => {
    mocks.request.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: "sw-1",
            triggeredBy: "sa-001",
            triggeredByType: "user",
            startedAt: "2026-08-01T10:00:00.000Z",
            finishedAt: "2026-08-01T10:00:30.000Z",
            durationMs: 30000,
            dryRun: false,
          },
        ],
        total: 1,
      },
    });
    const view = render(<RetentionSweepList locale="tr-TR" />);
    await waitFor(() => {
      expect(
        view.getByLabelText("Detay: sw-1"),
      ).toHaveAttribute(
        "href",
        "/tr-TR/superadmin/retention/sweeps/sw-1",
      );
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
    const view = render(<RetentionSweepList locale="tr-TR" />);
    await waitFor(() => {
      expect(view.getByRole("alert")).toHaveTextContent("Veri yüklenemedi");
    });
  });
});
