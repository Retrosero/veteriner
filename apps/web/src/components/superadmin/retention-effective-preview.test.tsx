/**
 * @file Retention effective preview davranış testleri.
 * @module @vetniva/web/components/superadmin/retention-effective-preview.test
 * @description Filtre değerlerinin effective endpoint'ine taşındığını
 * ve sonuç kartının source rozeti ile birlikte render edildiğini
 * doğrular. Hata durumunda kullanıcıya anlamlı bir uyarı gösterilir.
 * @security Test isteği whitelist edilmiş query parametrelerini
 * taşır; tenant kimliği kullanıcı girdisidir (UI'da kalır).
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ apiRequest: mocks.request }));

import { RetentionEffectivePreview } from "./retention-effective-preview";

describe("RetentionEffectivePreview", () => {
  it("boş başlangıç durumunda no-result mesajı gösterir", () => {
    const view = render(<RetentionEffectivePreview locale="tr-TR" />);
    expect(
      view.getByText("Önizleme için filtreleri doldurun."),
    ).toBeInTheDocument();
  });

  it("Hesapla butonuna basıldığında effective endpoint'ini çağırır", async () => {
    mocks.request.mockResolvedValue({
      ok: true,
      data: {
        tenantId: null,
        logType: "error_event",
        severity: "critical",
        retentionDays: 365,
        archiveAfterDays: 90,
        archiveStorage: "hot",
        redactPii: true,
        source: "globalOverride",
      },
    });
    const view = render(<RetentionEffectivePreview locale="tr-TR" />);
    fireEvent.click(view.getByRole("button", { name: "Hesapla" }));

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/log-retention/policies/effective?logType=error_event&severity=critical",
        { credentials: "include" },
      );
    });
    await waitFor(() => {
      expect(view.getByText("Global Override")).toBeInTheDocument();
      expect(view.getByText("365")).toBeInTheDocument();
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
    const view = render(<RetentionEffectivePreview locale="tr-TR" />);
    fireEvent.click(view.getByRole("button", { name: "Hesapla" }));
    await waitFor(() => {
      expect(view.getByRole("alert")).toHaveTextContent("Veri yüklenemedi");
    });
  });
});
