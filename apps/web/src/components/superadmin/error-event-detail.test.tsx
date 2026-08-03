/**
 * @file Superadmin hata olayı detay bileşeni testleri.
 * @module @vetniva/web/components/superadmin/error-event-detail.test
 * @description Yetkili detay, durum güncelleme ve çözüm notu çağrılarının
 * yalnız oturum çereziyle doğru endpointlere yönlendirildiğini doğrular.
 * @security Test isteği tenant veya aktör kimliği taşımaz.
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../../lib/api-client", () => ({ apiRequest: mocks.request }));

import { ErrorEventDetail } from "./error-event-detail";

const detail = {
  id: "event-1",
  errorCode: "VET-TEST-0001",
  message: "Sentetik hata",
  module: "clinic",
  severity: "error",
  status: "new" as const,
  fingerprint: "0123456789abcdef",
  occurrenceCount: 1,
  firstSeenAt: "2026-08-02T10:00:00.000Z",
  lastSeenAt: "2026-08-02T10:00:00.000Z",
  route: "POST /api/v1/clinic/owners",
  release: "1.0.0",
};

describe("ErrorEventDetail", () => {
  it("detayı çerezle yükler, durum günceller ve internal not ekler", async () => {
    mocks.request.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/notes") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          data: {
            id: "note-1",
            body: "İnceleme başladı",
            visibility: "internal",
            createdAt: "2026-08-02T10:05:00.000Z",
          },
        });
      }
      if (path.endsWith("/notes")) {
        return Promise.resolve({ ok: true, data: { items: [], total: 0 } });
      }
      if (path.endsWith("/audit-log")) {
        return Promise.resolve({
          ok: true,
          data: { items: [], total: 0, fingerprint: "0123456789abcdef" },
        });
      }
      if (path.endsWith("/status")) {
        return Promise.resolve({ ok: true, data: {} });
      }
      return Promise.resolve({ ok: true, data: detail });
    });

    const view = render(<ErrorEventDetail eventId="event-1" />);
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/error-events/event-1",
        { credentials: "include" },
      );
    });

    fireEvent.change(view.getByLabelText("Durum"), {
      target: { value: "investigating" },
    });
    fireEvent.click(view.getByRole("button", { name: "Durumu kaydet" }));
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/error-events/event-1/status",
        {
          method: "PATCH",
          credentials: "include",
          body: { toStatus: "investigating" },
        },
      );
    });

    fireEvent.change(view.getByLabelText("Yeni not"), {
      target: { value: "İnceleme başladı" },
    });
    fireEvent.click(view.getByRole("button", { name: "Not ekle" }));
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/error-events/event-1/notes",
        {
          method: "POST",
          credentials: "include",
          body: { body: "İnceleme başladı", visibility: "internal" },
        },
      );
    });
  });

  it("audit-log çağrısı yapılır ve timeline render edilir", async () => {
    mocks.request.mockImplementation((path: string) => {
      if (path.endsWith("/notes")) {
        return Promise.resolve({ ok: true, data: { items: [], total: 0 } });
      }
      if (path.endsWith("/audit-log")) {
        return Promise.resolve({
          ok: true,
          data: {
            fingerprint: "0123456789abcdef",
            total: 2,
            items: [
              {
                id: "trn-1",
                fingerprint: "0123456789abcdef",
                action: "status_transition",
                occurredAt: "2026-08-02T10:00:00.000Z",
                actorId: "usr-super-1",
                actorType: "user",
                details: {
                  fromStatus: "new",
                  toStatus: "investigating",
                  reason: "İncelemeye alındı",
                },
              },
              {
                id: "note-1",
                fingerprint: "0123456789abcdef",
                action: "note_added",
                occurredAt: "2026-08-02T10:01:00.000Z",
                actorId: "usr-super-1",
                actorType: "user",
                details: {
                  noteId: "note-1",
                  visibility: "internal",
                  bodyPreview: "İlk inceleme tamamlandı.",
                },
              },
            ],
          },
        });
      }
      return Promise.resolve({ ok: true, data: detail });
    });

    const view = render(<ErrorEventDetail eventId="event-1" />);
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/error-events/event-1/audit-log",
        { credentials: "include" },
      );
    });
    await waitFor(() => {
      expect(view.getByText("Audit timeline")).toBeInTheDocument();
      expect(view.getByText("Durum geçişi")).toBeInTheDocument();
      expect(view.getByText("Not eklendi")).toBeInTheDocument();
      expect(view.getByText(/İncelemeye alındı/)).toBeInTheDocument();
    });
  });
});
