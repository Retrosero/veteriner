/**
 * @file Sağlık sayfası component testleri.
 * @module @vetniva/web/app/[locale]/health/health.test
 *
 * @description `HealthPage` server component'inin fetch davranışı ve
 * `HealthCard` render'ı iki senaryo ile doğrulanır:
 *   1. API başarılı döner → status badge görünür, DB latency yazılır.
 *   2. API ağ hatası → hata kartı görünür, correlation ID gösterilir.
 *
 * @security Test verileri sabit; gerçek tenant bilgisi içermez.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

import { HealthCard } from "@/components/health-card";
import type { ReadinessResponse } from "@vetniva/contracts";
import { apiClient } from "@/lib/api-client";

const LABELS = {
  title: "Sistem Sağlığı",
  description: "Platform bileşenlerinin canlı durumu.",
  version: "Sürüm",
  statusOk: "Çalışıyor",
  statusDegraded: "Kısmen çalışıyor",
  statusDown: "Çalışmıyor",
  db: "Veritabanı",
  latency: "Gecikme",
  correlation: "Correlation ID",
  errorTitle: "Sağlık bilgisi alınamadı",
  noData: "Şu an görüntülenecek veri yok.",
};

const SAMPLE_DATA: ReadinessResponse = {
  status: "ok",
  timestamp: "2026-07-30T10:00:00.000Z",
  version: {
    name: "vetniva-api",
    version: "0.1.0",
    build_sha: "abc1234",
    build_time: "2026-07-30T09:55:00.000Z",
  },
  components: {
    db: { status: "ok", latency_ms: 12 },
  },
};

function renderWithProviders(ui: ReactElement): RenderResult {
  return render(ui);
}

describe("HealthCard", () => {
  it("başarılı yanıtta status badge ve latency gösterir", () => {
    const { getByTestId, getByText } = renderWithProviders(
      <HealthCard
        data={SAMPLE_DATA}
        error={null}
        correlationId="req-success-1"
        labels={LABELS}
      />,
    );

    const badge = getByTestId("health-status-badge");
    expect(badge).toBeInTheDocument();
    expect(badge.dataset["status"]).toBe("ok");
    expect(badge.textContent).toBe("Çalışıyor");

    // DB latency doğrudan DOM'a yazılır
    expect(getByText(/12ms/)).toBeInTheDocument();
  });

  it("hata durumunda hata kartını ve correlation ID'yi gösterir", () => {
    const { getByTestId, getByText } = renderWithProviders(
      <HealthCard
        data={null}
        error="API bağlantısı kurulamadı"
        correlationId="req-error-1"
        labels={LABELS}
      />,
    );

    const errorCard = getByTestId("health-card-error");
    expect(errorCard).toBeInTheDocument();
    expect(getByText("req-error-1")).toBeInTheDocument();
  });

  it("boş data durumunda empty mesajı gösterir", () => {
    const { getByTestId, getByText } = renderWithProviders(
      <HealthCard
        data={null}
        error={null}
        correlationId={null}
        labels={LABELS}
      />,
    );

    expect(getByTestId("health-card-empty")).toBeInTheDocument();
    expect(getByText(LABELS.noData)).toBeInTheDocument();
  });
});

describe("HealthPage fetch senaryoları", () => {
  const requestSpy = vi.spyOn(apiClient, "request");
  const originalApiBase = process.env["API_BASE_URL"];

  beforeEach(() => {
    process.env["API_BASE_URL"] = "http://api.test";
    requestSpy.mockReset();
  });

  afterEach(() => {
    if (originalApiBase === undefined) {
      delete process.env["API_BASE_URL"];
    } else {
      process.env["API_BASE_URL"] = originalApiBase;
    }
    vi.restoreAllMocks();
  });

  it("API başarılı döndüğünde HealthCard ok badge gösterir", async () => {
    requestSpy.mockResolvedValueOnce({
      ok: true,
      data: SAMPLE_DATA,
      status: 200,
      requestId: "req-ok-1",
    });

    const HealthPage = (await import("./page.js")).default;
    const element = await HealthPage({
      params: Promise.resolve({ locale: "tr-TR" }),
    });
    const { getByTestId, getByText } = render(element as ReactElement);

    const badge = getByTestId("health-status-badge");
    expect(badge).toBeInTheDocument();
    expect(badge.dataset["status"]).toBe("ok");
    expect(getByText(/12ms/)).toBeInTheDocument();
  });

  it("API ağ hatası döndüğünde hata kartı görüntülenir", async () => {
    requestSpy.mockResolvedValueOnce({
      ok: false,
      error: {
        error_code: "TR_COMMON_0001",
        message: "API bağlantısı kurulamadı",
        source: "unknown",
        severity: "error",
        correlation_id: "req-network-1",
        timestamp: "2026-07-30T10:00:00.000Z",
      },
      requestId: "req-network-1",
    });

    const HealthPage = (await import("./page.js")).default;
    const element = await HealthPage({
      params: Promise.resolve({ locale: "tr-TR" }),
    });
    const { getByTestId, getByText } = render(element as ReactElement);

    expect(getByTestId("health-card-error")).toBeInTheDocument();
    expect(getByText("req-network-1")).toBeInTheDocument();
  });
});
