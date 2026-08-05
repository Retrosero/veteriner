/**
 * @file Superadmin hata listesi davranış testleri.
 * @module @vetniva/web/components/superadmin
 * @description Hata merkezi isteğinin oturum çerezini taşıdığını ve
 * kullanıcı filtrelerinin yalnız izinli API sorgu parametrelerine
 * dönüştüğünü doğrular. Tenant, branch, module, errorCode, release,
 * assignedTo, from, to filtreleri de sorguya yansır. Tenant veya
 * aktör kimliği istemciden hiçbir zaman eklenmez.
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../../lib/api-client", () => ({ apiRequest: mocks.request }));

import { ErrorEventList } from "./error-event-list";

describe("ErrorEventList", () => {
  it("çerezli başlangıç isteği gönderir ve filtreleri sorguya taşır", async () => {
    mocks.request.mockResolvedValue({
      ok: true,
      data: { items: [], total: 0 },
    });
    const view = render(<ErrorEventList locale="tr-TR" />);

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/error-events?limit=50&offset=0",
        { credentials: "include" },
      );
    });

    fireEvent.change(view.getByLabelText("Durum"), {
      target: { value: "investigating" },
    });
    fireEvent.change(view.getByLabelText("Şiddet"), {
      target: { value: "error" },
    });
    fireEvent.change(view.getByLabelText("Ara"), {
      target: { value: "  VET-TEST-0001  " },
    });

    await waitFor(() => {
      expect(mocks.request).toHaveBeenLastCalledWith(
        "/api/v1/superadmin/error-events?limit=50&offset=0&status=investigating&severity=error&search=VET-TEST-0001",
        { credentials: "include" },
      );
    });
  });

  it("yeni filtreler (tenant, branch, module, errorCode, release, assignedTo, from, to) sorguya yansır", async () => {
    mocks.request.mockResolvedValue({
      ok: true,
      data: { items: [], total: 0 },
    });
    const view = render(<ErrorEventList locale="tr-TR" />);

    fireEvent.change(view.getByLabelText("Tenant"), {
      target: { value: "tenant-acme" },
    });
    fireEvent.change(view.getByLabelText("Şube"), {
      target: { value: "branch-1" },
    });
    fireEvent.change(view.getByLabelText("Modül"), {
      target: { value: "clinic" },
    });
    fireEvent.change(view.getByLabelText("Hata kodu"), {
      target: { value: "VET-CLINIC-0001" },
    });
    fireEvent.change(view.getByLabelText("Release"), {
      target: { value: "1.4.2" },
    });
    fireEvent.change(view.getByLabelText("Atanan"), {
      target: { value: "usr-dev-7" },
    });
    fireEvent.change(view.getByLabelText("Başlangıç"), {
      target: { value: "2026-08-01T00:00" },
    });
    fireEvent.change(view.getByLabelText("Bitiş"), {
      target: { value: "2026-08-02T23:59" },
    });

    await waitFor(() => {
      expect(mocks.request).toHaveBeenLastCalledWith(
        "/api/v1/superadmin/error-events?limit=50&offset=0&tenantId=tenant-acme&branchId=branch-1&module=clinic&errorCode=VET-CLINIC-0001&release=1.4.2&assignedToUserId=usr-dev-7&from=2026-08-01T00%3A00&to=2026-08-02T23%3A59",
        { credentials: "include" },
      );
    });
  });

  it("hata durumunda 'yeniden dene' butonu yeni istek tetikler", async () => {
    mocks.request.mockResolvedValueOnce({
      ok: false,
      error: {
        error_code: "VET-COMMON-0001",
        message: "fail",
        source: "unknown",
        severity: "error",
        correlation_id: "req-1",
        timestamp: "2026-08-02T10:00:00.000Z",
      },
      requestId: "req-1",
    });
    const view = render(<ErrorEventList locale="tr-TR" />);

    await waitFor(() => {
      expect(
        view.getByText("Hata kayıtları şu anda yüklenemiyor."),
      ).toBeInTheDocument();
    });

    mocks.request.mockResolvedValueOnce({
      ok: true,
      data: { items: [], total: 0 },
    });
    fireEvent.click(view.getByRole("button", { name: "Listeyi yeniden yükle" }));

    await waitFor(() => {
      // İkinci başarılı istek gönderildi (toplamda en az 2 çağrı).
      expect(mocks.request.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(mocks.request).toHaveBeenLastCalledWith(
        "/api/v1/superadmin/error-events?limit=50&offset=0",
        { credentials: "include" },
      );
    });
  });
});
