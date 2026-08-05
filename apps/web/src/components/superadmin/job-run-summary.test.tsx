/**
 * @file JobRunSummary davranış testleri.
 * @module @vetniva/web/components/superadmin/job-run-summary.test
 * @description Sekiz KPI kartının doğru değer ve rozet davranışlarını
 * doğrular: happy-path'te tüm sayılar ve zaman etiketi okunur;
 * tek bir alt metrik yüklenemediğinde yalnızca o kart "Yüklenemedi"
 * rozeti gösterir; hiç değer yoksa tüm kartlarda rozet görünür.
 */

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";

import { JobRunSummary } from "./job-run-summary";

const LABELS = {
  title: "Job runs 24 saat özeti",
  total: "Toplam",
  succeeded: "Başarılı",
  failed: "Hata",
  deadLetter: "Dead-Letter",
  running: "Çalışıyor",
  pending: "Beklemede",
  last24hDeadLetter: "24s Dead-Letter",
  oldestRunning: "En eski çalışan",
  oldestRunningNone: "Çalışan job yok",
  loadErrorHint: "Yüklenemedi",
};

describe("JobRunSummary", () => {
  it("tüm KPI değerlerini insan-okunabilir sayı olarak render eder (happy-path)", () => {
    render(
      <JobRunSummary
        deadLetter={3}
        failed={12}
        labels={LABELS}
        last24hDeadLetter={2}
        oldestRunningStartedAt="2026-08-05T10:00:00.000Z"
        pending={7}
        running={5}
        succeeded={420}
        total={447}
      />,
    );

    // Kart başlıkları görünür.
    expect(screen.getByText(LABELS.total)).toBeInTheDocument();
    expect(screen.getByText(LABELS.succeeded)).toBeInTheDocument();
    expect(screen.getByText(LABELS.failed)).toBeInTheDocument();
    expect(screen.getByText(LABELS.deadLetter)).toBeInTheDocument();
    expect(screen.getByText(LABELS.running)).toBeInTheDocument();
    expect(screen.getByText(LABELS.pending)).toBeInTheDocument();
    expect(screen.getByText(LABELS.last24hDeadLetter)).toBeInTheDocument();
    expect(screen.getByText(LABELS.oldestRunning)).toBeInTheDocument();
    // Sayılar (locale-agnostic parça kontrolü).
    expect(screen.getByText(/420/)).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    // Hata rozeti yok.
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("yalnızca başarısız alt KPI için 'Yüklenemedi' rozeti gösterir (error-path)", () => {
    render(
      <JobRunSummary
        deadLetter={null}
        deadLetterLoadFailed
        failed={4}
        labels={LABELS}
        last24hDeadLetter={null}
        last24hDeadLetterLoadFailed
        oldestRunningLoadFailed
        oldestRunningStartedAt={null}
        pending={0}
        running={1}
        succeeded={10}
        total={null}
        totalLoadFailed
      />,
    );

    const statuses = screen.getAllByRole("status");
    // total, deadLetter, last24hDeadLetter, oldestRunning başarısız
    // (4 rozet); failed/pending/running/succeeded başarılı.
    expect(statuses).toHaveLength(4);
    statuses.forEach((badge) => {
      expect(badge).toHaveTextContent(LABELS.loadErrorHint);
    });
    // Başarılı kartlar gerçek değerleri gösterir.
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("hiç değer gelmediğinde tüm kartlarda '—' placeholder gösterir (loading-path)", () => {
    render(<JobRunSummary labels={LABELS} />);
    // Yüklenemedi rozet yok (loadFailed hepsi false); 8 placeholder.
    expect(screen.queryAllByRole("status")).toHaveLength(0);
    // 7 sayısal placeholder + 1 zaman placeholder.
    expect(screen.getAllByText("—")).toHaveLength(8);
  });

  it("oldestRunningStartedAt geçerli ISO ise locale stringine formatlar", () => {
    render(
      <JobRunSummary
        labels={LABELS}
        oldestRunningStartedAt="2026-08-05T10:00:00.000Z"
      />,
    );
    // 7 sayısal placeholder (diğer KPI'lar null) + 0 zaman placeholder
    // (oldestRunningStartedAt geçerli ISO).
    expect(screen.getAllByText("—")).toHaveLength(7);
  });
});
