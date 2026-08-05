/**
 * @file ErrorEventKpiSummary davranış testleri.
 * @module @vetniva/web/components/superadmin/error-event-kpi-summary.test
 * @description Dört KPI kartının doğru değer ve rozet davranışlarını
 * doğrular: happy-path'te tüm sayılar okunur; tek bir alt metrik
 * yüklenemediğinde yalnızca o kart "yüklenemedi" rozeti gösterir.
 */

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import { ErrorEventKpiSummary } from "./error-event-kpi-summary";

const LABELS = {
  title: "24 saat özeti",
  total: "Toplam hata (24s)",
  critical: "Kritik (24s)",
  investigating: "İnceleniyor",
  reopened: "Yeniden açıldı",
  loadErrorHint: "Yüklenemedi",
};

describe("ErrorEventKpiSummary", () => {
  it("tüm KPI değerlerini insan-okunabilir sayı olarak render eder (happy-path)", () => {
    render(
      <ErrorEventKpiSummary
        critical={4}
        investigating={11}
        labels={LABELS}
        reopened={2}
        total={1320}
      />,
    );

    // Kart başlıkları görünür.
    expect(screen.getByText(LABELS.total)).toBeInTheDocument();
    expect(screen.getByText(LABELS.critical)).toBeInTheDocument();
    expect(screen.getByText(LABELS.investigating)).toBeInTheDocument();
    expect(screen.getByText(LABELS.reopened)).toBeInTheDocument();
    // Sayılar (locale-agnostic parça kontrolü).
    expect(screen.getByText(/1\.320|1,320/)).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // Hata rozeti yok.
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("yalnızca başarısız alt KPI için 'yüklenemedi' rozeti gösterir (error-path)", () => {
    render(
      <ErrorEventKpiSummary
        critical={null}
        criticalLoadFailed
        investigating={0}
        labels={LABELS}
        reopened={1}
        total={null}
        totalLoadFailed
      />,
    );

    const statuses = screen.getAllByRole("status");
    // Sadece `total` ve `critical` için rozet var; `investigating`
    // ve `reopened` başarılı.
    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toHaveTextContent(LABELS.loadErrorHint);
    expect(statuses[1]).toHaveTextContent(LABELS.loadErrorHint);
    // Başarısız kartlar "—" ile gösterilir.
    expect(screen.getAllByText("—")).toHaveLength(2);
    // Başarılı kartlar gerçek değerleri gösterir.
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("loading-path: hiç değer gelmediğinde dört '—' placeholder gösterir, rozet yok", () => {
    render(<ErrorEventKpiSummary labels={LABELS} />);
    // Dört ayrı "—" placeholder.
    expect(screen.getAllByText("—")).toHaveLength(4);
    // Yükleme devam ediyor; "yüklenemedi" rozeti YOK.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("error-path: tüm KPI'lar başarısız olduğunda dört 'yüklenemedi' rozeti gösterir", () => {
    render(
      <ErrorEventKpiSummary
        criticalLoadFailed
        investigatingLoadFailed
        labels={LABELS}
        reopenedLoadFailed
        totalLoadFailed
      />,
    );
    expect(screen.getAllByRole("status")).toHaveLength(4);
    expect(screen.getAllByText("—")).toHaveLength(4);
  });
});
