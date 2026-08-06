/**
 * @file Retention tabs (sekme konteyneri) davranış testleri.
 * @module @vetniva/web/components/superadmin/retention-tabs.test
 * @description Üç sekmenin (Policies, Sweeps, Effective) klavye
 * navigasyonu ile değiştirilebildiğini, modal açma butonlarının
 * çalıştığını ve klavye Escape ile modalların kapatılabildiğini
 * doğrular. Sekme erişilebilirliği: `aria-selected`, `role="tab"`.
 * @security Tüm mutasyonlar `audit:log:read` yetkisi gerektirir.
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ apiRequest: mocks.request }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { RetentionTabs } from "./retention-tabs";

describe("RetentionTabs", () => {
  beforeEach(() => {
    mocks.request.mockReset();
    // default: policy listesi boş döner
    mocks.request.mockResolvedValue({
      ok: true,
      data: { items: [], total: 0 },
    });
  });

  it("üç sekmeyi render eder ve default olarak Policies seçili gelir", async () => {
    const view = render(<RetentionTabs locale="tr-TR" />);
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalled();
    });
    const policiesTab = view.getByRole("tab", { name: "Politikalar" });
    expect(policiesTab).toHaveAttribute("aria-selected", "true");
    expect(view.getByRole("tab", { name: "Sweep Geçmişi" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(view.getByRole("tab", { name: "Effective" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("Sağ ok ile Effective sekmesine geçer", async () => {
    const view = render(<RetentionTabs locale="tr-TR" />);
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalled();
    });
    const policiesTab = view.getByRole("tab", { name: "Politikalar" });
    policiesTab.focus();
    fireEvent.keyDown(policiesTab, { key: "ArrowRight" });
    fireEvent.keyDown(view.getByRole("tab", { name: "Sweep Geçmişi" }), {
      key: "ArrowRight",
    });
    expect(view.getByRole("tab", { name: "Effective" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("Yeni Policy butonu modalı açar ve Escape kapatır", async () => {
    const view = render(<RetentionTabs locale="tr-TR" />);
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalled();
    });
    fireEvent.click(view.getByRole("button", { name: "Yeni Policy" }));
    expect(view.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(view.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("Sweep Başlat butonu modalı açar", async () => {
    const view = render(<RetentionTabs locale="tr-TR" />);
    // İlk policy listesi yüklemesinin tamamlanmasını bekle
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalled();
    });
    fireEvent.click(view.getByRole("button", { name: "Sweep Başlat" }));
    expect(view.getByRole("dialog")).toBeInTheDocument();
  });
});
