/**
 * @file ErrorEventGroups davranış testleri.
 * @module @vetniva/web/components/superadmin/error-event-groups.test
 * @description Fingerprint grupları listeleme, filtre uygulama, detay
 * dialog açma/kapama ve hata/yeniden deneme davranışlarını doğrular.
 * Tenant veya aktör bilgisi istemciden gönderilmez.
 */

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../../lib/api-client", () => ({ apiRequest: mocks.request }));

import { ErrorEventGroups } from "./error-event-groups";

const LABELS = {
  title: "Fingerprint grupları",
  loading: "Gruplar yükleniyor…",
  empty: "Eşleşen fingerprint grubu yok.",
  loadFailed: "Fingerprint grupları yüklenemedi.",
  detailTitle: "Grup detayı",
  detailLoading: "Grup detayı yükleniyor…",
  detailLoadFailed: "Grup detayı yüklenemedi.",
  detailClose: "Detayı kapat",
  columns: {
    fingerprint: "Fingerprint",
    severity: "Şiddet",
    module: "Modül",
    errorCode: "Hata kodu",
    status: "Durum",
    assigned: "Atanan",
    events: "Olay",
    uniqueTenants: "Tenant",
    firstSeen: "İlk görülme",
    lastSeen: "Son görülme",
  },
  filters: {
    severity: "Şiddet",
    module: "Modül",
    status: "Durum",
    all: "Tümü",
  },
  detail: {
    events: "Son olaylar",
    message: "Mesaj",
    tenant: "Tenant",
  },
  retry: "Yeniden dene",
};

const SAMPLE_LIST = {
  total: 2,
  items: [
    {
      fingerprint: "abcdef0123456789",
      severity: "critical" as const,
      module: "clinic",
      errorCode: "VET-CLINIC-0099",
      status: "new" as const,
      assignedToUserId: null,
      eventCount: 12,
      uniqueTenants: 3,
      firstSeenAt: "2026-08-01T10:00:00.000Z",
      lastSeenAt: "2026-08-02T10:00:00.000Z",
    },
    {
      fingerprint: "fedcba9876543210",
      severity: "error" as const,
      module: "auth",
      errorCode: "VET-AUTH-0007",
      status: "investigating" as const,
      assignedToUserId: "usr-dev-1",
      eventCount: 4,
      uniqueTenants: 1,
      firstSeenAt: "2026-08-02T08:00:00.000Z",
      lastSeenAt: "2026-08-02T09:00:00.000Z",
    },
  ],
};

const SAMPLE_DETAIL = {
  ...(SAMPLE_LIST.items[0] as object),
  recentEvents: [
    {
      id: "event-1",
      message: "Hasta sahibi oluşturulamadı",
      tenantId: "tenant-acme",
      lastSeenAt: "2026-08-02T10:00:00.000Z",
    },
  ],
};

describe("ErrorEventGroups", () => {
  afterEach(() => {
    mocks.request.mockReset();
  });

  it("happy-path: başlangıçta listeyi yükler ve render eder", async () => {
    mocks.request.mockResolvedValue({ ok: true, data: SAMPLE_LIST });
    const view = render(<ErrorEventGroups labels={LABELS} />);

    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/error-events/groups?limit=50&offset=0",
        { credentials: "include" },
      );
    });
    expect(view.getByText("VET-CLINIC-0099")).toBeInTheDocument();
    expect(view.getByText("VET-AUTH-0007")).toBeInTheDocument();
  });

  it("filtre değişimi sorguya yansır; boş değerler atlanır", async () => {
    mocks.request.mockResolvedValue({ ok: true, data: SAMPLE_LIST });
    const view = render(<ErrorEventGroups labels={LABELS} />);

    fireEvent.change(view.getByLabelText(LABELS.filters.severity), {
      target: { value: "critical" },
    });
    fireEvent.change(view.getByLabelText(LABELS.filters.module), {
      target: { value: "clinic" },
    });
    fireEvent.change(view.getByLabelText(LABELS.filters.status), {
      target: { value: "new" },
    });

    await waitFor(() => {
      expect(mocks.request).toHaveBeenLastCalledWith(
        "/api/v1/superadmin/error-events/groups?limit=50&offset=0&severity=critical&module=clinic&status=new",
        { credentials: "include" },
      );
    });
  });

  it("error-path: yüklenemedi durumunda kırmızı uyarı ve retry butonu gösterir", async () => {
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
    const view = render(<ErrorEventGroups labels={LABELS} />);

    await waitFor(() => {
      expect(view.getByText(LABELS.loadFailed)).toBeInTheDocument();
    });
    const retryBtn = view.getByRole("button", { name: LABELS.retry });
    expect(retryBtn).toBeInTheDocument();

    // Yeniden deneme: ikinci istek başarılı.
    mocks.request.mockResolvedValueOnce({ ok: true, data: SAMPLE_LIST });
    fireEvent.click(retryBtn);
    await waitFor(() => {
      expect(view.getByText("VET-CLINIC-0099")).toBeInTheDocument();
    });
  });

  it("loading-path: ilk render'da 'Yükleniyor' durumunu gösterir", () => {
    mocks.request.mockReturnValue(new Promise(() => undefined));
    const view = render(<ErrorEventGroups labels={LABELS} />);
    expect(view.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it("boş sonuç: 'empty' mesajı gösterilir", async () => {
    mocks.request.mockResolvedValueOnce({
      ok: true,
      data: { items: [], total: 0 },
    });
    const view = render(<ErrorEventGroups labels={LABELS} />);
    await waitFor(() => {
      expect(view.getByText(LABELS.empty)).toBeInTheDocument();
    });
  });

  it("satıra tıklayınca detay dialog'u açılır ve detay API çağrısı yapılır", async () => {
    mocks.request.mockImplementation((path: string) => {
      if (path.startsWith("/api/v1/superadmin/error-events/groups/abcdef")) {
        return Promise.resolve({ ok: true, data: SAMPLE_DETAIL });
      }
      return Promise.resolve({ ok: true, data: SAMPLE_LIST });
    });
    const view = render(<ErrorEventGroups labels={LABELS} />);
    await waitFor(() => {
      expect(view.getByText("VET-CLINIC-0099")).toBeInTheDocument();
    });

    fireEvent.click(view.getByText("abcdef012345…"));
    await waitFor(() => {
      expect(mocks.request).toHaveBeenCalledWith(
        "/api/v1/superadmin/error-events/groups/abcdef0123456789",
        { credentials: "include" },
      );
    });
    expect(view.getByRole("dialog")).toBeInTheDocument();
    expect(view.getByText("Hasta sahibi oluşturulamadı")).toBeInTheDocument();
  });
});
