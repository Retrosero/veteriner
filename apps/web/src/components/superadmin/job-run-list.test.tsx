/**
 * @file JobRunList davranış testleri.
 * @module @vetniva/web/components/superadmin/job-run-list.test
 * @description Job runs liste ve filtre çağrılarının oturum çerezi
 * ile doğru endpoint'e yönlendirildiğini, dead-letter view toggle'ı
 * ve filtre değerlerinin yalnızca whitelist alanlara eklendiğini
 * doğrular. Tenant, kullanıcı veya aktör kimliği istemciden
 * eklenmez.
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../../lib/api-client", () => ({ apiRequest: mocks.request }));

import { JobRunList } from "./job-run-list";

const renderList = () => render(<JobRunList locale="tr-TR" />);

describe("JobRunList", () => {
  it("çerezli başlangıç isteği gönderir ve filtreleri sorguya taşır (happy-path)", async () => {
    mocks.request.mockResolvedValue({
      ok: true,
      data: { items: [], total: 0 },
    });
    const view = renderList();

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/job-runs?limit=50&offset=0",
        { credentials: "include" },
      );
    });

    fireEvent.change(view.getByLabelText("Queue"), {
      target: { value: "billing.invoice" },
    });
    fireEvent.change(view.getByLabelText("Job adı"), {
      target: { value: "SendInvoice" },
    });
    fireEvent.change(view.getByLabelText("Job anahtarı"), {
      target: { value: "invoice-123" },
    });
    fireEvent.change(view.getByLabelText("Durum"), {
      target: { value: "failed" },
    });
    fireEvent.change(view.getByLabelText("Kaynak"), {
      target: { value: "queue" },
    });
    fireEvent.change(view.getByLabelText("Tetikleyici"), {
      target: { value: "user" },
    });
    fireEvent.change(view.getByLabelText("Tenant"), {
      target: { value: "tenant-acme" },
    });
    fireEvent.change(view.getByLabelText("Şube"), {
      target: { value: "br-1" },
    });
    fireEvent.change(view.getByLabelText("Ülke"), {
      target: { value: "tr" },
    });
    fireEvent.change(view.getByLabelText("Ara"), {
      target: { value: "  invoice-timeout  " },
    });

    await waitFor(() => {
      const lastCall =
        mocks.request.mock.calls[mocks.request.mock.calls.length - 1];
      expect(lastCall?.[0]).toBe(
        "/api/v1/superadmin/job-runs?limit=50&offset=0&queueName=billing.invoice&jobName=SendInvoice&jobKey=invoice-123&status=failed&source=queue&triggeredBy=user&tenantId=tenant-acme&branchId=br-1&country=TR&search=invoice-timeout",
      );
      expect(lastCall?.[1]).toEqual({ credentials: "include" });
    });
  });

  it("dead-letter view toggle'ı doğru endpoint'e yönlendirir (loading-path)", async () => {
    mocks.request.mockResolvedValue({
      ok: true,
      data: { items: [], total: 0 },
    });
    const view = renderList();

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/job-runs?limit=50&offset=0",
        { credentials: "include" },
      );
    });

    fireEvent.click(view.getByRole("tab", { name: /Dead-letter/ }));

    await waitFor(() => {
      const lastCall =
        mocks.request.mock.calls[mocks.request.mock.calls.length - 1];
      expect(lastCall?.[0]).toBe(
        "/api/v1/superadmin/job-runs/dead-letter?limit=50&offset=0",
      );
      expect(lastCall?.[1]).toEqual({ credentials: "include" });
    });
  });

  it("API hatası döndüğünde 'yüklenemedi' rozetini gösterir (error-path)", async () => {
    mocks.request.mockResolvedValue({
      ok: false,
      error: {
        error_code: "VET-COMMON-0001",
        message: "API isteği zaman aşımına uğradı",
        source: "unknown",
        severity: "error",
        correlation_id: "req-1",
        timestamp: "2026-08-05T10:00:00.000Z",
      },
      requestId: "req-1",
    });
    const view = renderList();
    await waitFor(() => {
      expect(
        view.getByText("Job run kayıtları şu anda yüklenemiyor."),
      ).toBeInTheDocument();
    });
  });
});
