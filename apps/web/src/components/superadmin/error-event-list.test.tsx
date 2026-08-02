/**
 * @file Superadmin hata listesi davranış testleri.
 * @module @vetniva/web/components/superadmin
 * @description Hata merkezi isteğinin oturum çerezini taşıdığını ve kullanıcı
 * filtrelerinin yalnız izinli API sorgu parametrelerine dönüştüğünü doğrular.
 * Tenant veya aktör kimliği istemciden hiçbir zaman eklenmez.
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
    const view = render(<ErrorEventList />);

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/error-events?limit=50&offset=0",
        { credentials: "include" },
      );
    });

    fireEvent.change(view.getByLabelText("Durum filtresi"), {
      target: { value: "investigating" },
    });
    fireEvent.change(view.getByLabelText("Şiddet filtresi"), {
      target: { value: "error" },
    });
    fireEvent.change(view.getByLabelText("Hata ara"), {
      target: { value: "  VET-TEST-0001  " },
    });

    await waitFor(() => {
      expect(mocks.request).toHaveBeenLastCalledWith(
        "/api/v1/superadmin/error-events?limit=50&offset=0&status=investigating&severity=error&search=VET-TEST-0001",
        { credentials: "include" },
      );
    });
  });
});
