/**
 * @file Retention policy listesi davranış testleri.
 * @module @vetniva/web/components/superadmin/retention-policy-list.test
 * @description Filtreli policy sorgusunun yalnız oturum çereziyle
 * yetkili endpoint'e yönlendirildiğini doğrular. Tenant filtresi
 * boş bırakıldığında global dahil tüm policy'ler için istek atılır;
 * filtre değiştiğinde yeni path yeniden oluşturulur. Boş/hata
 * durumları `role="status"` / `role="alert"` olarak duyurulur.
 * @security Test isteği tenant veya aktör kimliği taşımaz; yalnız
 * whitelist edilmiş query parametreleri kullanılır.
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ apiRequest: mocks.request }));

import { RetentionPolicyList } from "./retention-policy-list";

describe("RetentionPolicyList", () => {
  it("başlangıç isteğini çerezle gönderir ve filtreleri query'ye taşır", async () => {
    mocks.request.mockResolvedValue({ ok: true, data: { items: [], total: 0 } });
    const view = render(<RetentionPolicyList locale="tr-TR" />);

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/log-retention/policies?limit=50&offset=0",
        { credentials: "include" },
      );
    });

    fireEvent.change(view.getByLabelText("Tenant"), {
      target: { value: "tenant-uuid-1" },
    });
    fireEvent.change(view.getByLabelText("Log Tipi"), {
      target: { value: "security_event" },
    });
    fireEvent.change(view.getByLabelText("Şiddet"), {
      target: { value: "critical" },
    });

    await waitFor(() => {
      expect(mocks.request).toHaveBeenLastCalledWith(
        "/api/v1/superadmin/log-retention/policies?limit=50&offset=0&tenantId=tenant-uuid-1&logType=security_event&severity=critical",
        { credentials: "include" },
      );
    });
  });

  it("policy listesini tablo halinde render eder ve detay linki üretir", async () => {
    mocks.request.mockResolvedValue({
      ok: true,
      data: {
        items: [
          {
            id: "rp-1",
            tenantId: null,
            logType: "error_event",
            severity: "critical",
            retentionDays: 365,
            archiveAfterDays: 90,
            archiveStorage: "hot",
            redactPii: true,
            createdById: "sa-001",
            createdAt: "2026-08-01T10:00:00.000Z",
            updatedById: null,
            updatedAt: null,
          },
        ],
        total: 1,
      },
    });
    const view = render(<RetentionPolicyList locale="tr-TR" />);
    await waitFor(() => {
      expect(view.getByText("Global")).toBeInTheDocument();
      expect(view.getByText("365")).toBeInTheDocument();
      expect(
        view.getByLabelText("Detay: rp-1"),
      ).toHaveAttribute(
        "href",
        "/tr-TR/superadmin/retention/rp-1",
      );
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
    const view = render(<RetentionPolicyList locale="tr-TR" />);
    await waitFor(() => {
      expect(
        view.getByRole("alert"),
      ).toHaveTextContent("Veri yüklenemedi");
    });
  });
});
