/**
 * @file Retention policy detay davranış testleri.
 * @module @vetniva/web/components/superadmin/retention-policy-detail.test
 * @description Policy detayının yalnız oturum çereziyle yüklendiğini,
 * upsert PUT'unun kompozit anahtarı (tenantId/logType/severity)
 * koruyarak çağrıldığını ve silmenin DELETE endpoint'ine yönlendirildiğini
 * doğrular. `redactPii` alanı read-only olarak işaretlenmiştir.
 * @security PUT body'de `redactPii` gönderilmez; backend bu alanı
 * her zaman `true` yapar. tenantId kompozit anahtar olduğu için
 * UI'dan değiştirilemez (read-only).
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ apiRequest: mocks.request }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { RetentionPolicyDetail } from "./retention-policy-detail";

const policy = {
  id: "rp-1",
  tenantId: null,
  logType: "error_event",
  severity: "critical",
  retentionDays: 365,
  archiveAfterDays: 90,
  archiveStorage: "hot" as const,
  redactPii: true,
  createdById: "sa-001",
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedById: null,
  updatedAt: null,
};

describe("RetentionPolicyDetail", () => {
  beforeEach(() => {
    mocks.request.mockReset();
    // default mock: detail GET
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === "PUT" || init?.method === "DELETE") {
        return Promise.resolve({ ok: true, data: {} });
      }
      return Promise.resolve({ ok: true, data: policy });
    });
    // window.confirm otomatik onay
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("policy detayını çerezli yükler ve tenant/redactPii alanlarını read-only yapar", async () => {
    const view = render(
      <RetentionPolicyDetail locale="tr-TR" policyId="rp-1" />,
    );
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/log-retention/policies/rp-1",
        { credentials: "include" },
      );
    });
    await waitFor(() => {
      const tenantInput = view.getByLabelText(
        "Tenant (boş = global override)",
      ) as HTMLInputElement;
      expect(tenantInput).toBeDisabled();
      const redactInput = view.getByLabelText(
        "PII Maskeleme (her zaman true)",
      ) as HTMLInputElement;
      expect(redactInput).toBeDisabled();
    });
  });

  it("Kaydet butonu PUT endpoint'ini body ile çağırır", async () => {
    const view = render(
      <RetentionPolicyDetail locale="tr-TR" policyId="rp-1" />,
    );
    await waitFor(() => {
      expect(view.getByText("Kaydet")).toBeInTheDocument();
    });
    fireEvent.click(view.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/log-retention/policies",
        {
          method: "PUT",
          credentials: "include",
          body: {
            tenantId: null,
            logType: "error_event",
            severity: "critical",
            retentionDays: 365,
            archiveAfterDays: 90,
            archiveStorage: "hot",
          },
        },
      );
    });
  });

  it("Sil butonu DELETE endpoint'ini çağırır", async () => {
    const view = render(
      <RetentionPolicyDetail locale="tr-TR" policyId="rp-1" />,
    );
    await waitFor(() => {
      expect(view.getByText("Sil")).toBeInTheDocument();
    });
    fireEvent.click(view.getByRole("button", { name: "Sil" }));
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/log-retention/policies/rp-1",
        { method: "DELETE", credentials: "include" },
      );
    });
  });

  it("yükleme hatasında hata mesajı gösterir", async () => {
    mocks.request.mockReset();
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
    const view = render(
      <RetentionPolicyDetail locale="tr-TR" policyId="rp-1" />,
    );
    await waitFor(() => {
      expect(view.getByRole("alert")).toHaveTextContent("Veri yüklenemedi");
    });
  });
});
