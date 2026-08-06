/**
 * @file Retention policy form (modal) davranış testleri.
 * @module @vetniva/web/components/superadmin/retention-policy-form.test
 * @description Modal form alanlarının PUT endpoint'ine validate
 * edilmiş payload ile gönderildiğini doğrular. Geçersiz aralıklar
 * için client-side hata mesajı görüntülenir; gönderilen payload'da
 * `redactPii` alanı bulunmaz (backend her zaman true yapar).
 * @security Form payload'ı whitelist edilmiş alanlar içerir;
 * tenantId boş ise `null` gönderilir → global override oluşturulur.
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ apiRequest: mocks.request }));

import { getLabels } from "@/lib/labels";

import { RetentionPolicyForm } from "./retention-policy-form";

const labels = getLabels("tr-TR").retention;

describe("RetentionPolicyForm", () => {
  beforeEach(() => {
    mocks.request.mockReset();
  });

  it("alanları validate eder ve PUT endpoint'ini çağırır", async () => {
    mocks.request.mockResolvedValue({ ok: true, data: {} });
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const view = render(
      <RetentionPolicyForm
        labels={labels}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Oluştur" }));

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
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("geçersiz retention için validation mesajı gösterir ve API çağırmaz", async () => {
    mocks.request.mockResolvedValue({ ok: true, data: {} });
    const view = render(
      <RetentionPolicyForm
        labels={labels}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const retentionInput = view.getByLabelText("Saklama (gün, 1-3650)");
    fireEvent.change(retentionInput, { target: { value: "5000" } });
    fireEvent.click(view.getByRole("button", { name: "Oluştur" }));

    await waitFor(() => {
      expect(view.getByRole("alert")).toHaveTextContent(
        "Saklama 1-3650 arası olmalı.",
      );
    });
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("archive > retention için validation mesajı gösterir", async () => {
    mocks.request.mockResolvedValue({ ok: true, data: {} });
    const view = render(
      <RetentionPolicyForm
        labels={labels}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const retentionInput = view.getByLabelText("Saklama (gün, 1-3650)");
    const archiveInput = view.getByLabelText("Arşiv (gün, 0 - retentionDays)");
    fireEvent.change(retentionInput, { target: { value: "100" } });
    fireEvent.change(archiveInput, { target: { value: "200" } });
    fireEvent.click(view.getByRole("button", { name: "Oluştur" }));

    await waitFor(() => {
      expect(view.getByRole("alert")).toHaveTextContent(
        "Arşiv, retention değerinden büyük olamaz.",
      );
    });
  });

  it("API hatasında saveError mesajı gösterir", async () => {
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
      <RetentionPolicyForm
        labels={labels}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Oluştur" }));
    await waitFor(() => {
      expect(view.getByRole("alert")).toHaveTextContent(
        "Kayıt güncellenemedi.",
      );
    });
  });
});
