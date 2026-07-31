/**
 * @file Pilot kabul (UAT) rapor uretici testleri.
 * @module @vetniva/acceptance-test/tests/report
 *
 * @description summarize, formatDuration, formatTimestamp,
 * reportToMarkdown ve reportToJson cikti formatlari.
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import { describe, expect, it } from "vitest";

import {
  buildReport,
  formatDuration,
  formatTimestamp,
  reportToJson,
  reportToMarkdown,
  summarize,
} from "../src/report.js";
import type { UatRunResult } from "../src/types.js";

const baseResult: UatRunResult = {
  runAt: "2026-08-01T10:00:00.000Z",
  operator: "pilot",
  baseUrl: "http://localhost:3001",
  tenantId: "tenant-1",
  allPassed: true,
  passedCount: 2,
  failedCount: 0,
  totalSteps: 5,
  totalFailedSteps: 0,
  totalUnnecessary: 1,
  averageRating: 4.5,
  scenarios: [
    {
      scenario: "new_owner_patient",
      title: "Yeni musteri",
      module: "owner",
      startedAt: "2026-08-01T09:00:00.000Z",
      finishedAt: "2026-08-01T09:00:02.000Z",
      totalDurationMs: 2000,
      passedCount: 3,
      failedCount: 0,
      allPassed: true,
      unnecessaryCount: 0,
      averageRating: 4,
      steps: [
        {
          name: "create_owner",
          status: 201,
          durationMs: 800,
          error: null,
          extracted: { id: "o1" },
          feedback: {
            reviewer: "pilot",
            comment: "Hizli",
            rating: 5,
            unnecessary: false,
            occurredAt: "2026-08-01T09:00:01.000Z",
          },
          passed: true,
          fieldFound: true,
        },
        {
          name: "get_owner",
          status: 200,
          durationMs: 100,
          error: null,
          extracted: {},
          feedback: null,
          passed: true,
          fieldFound: true,
        },
        {
          name: "create_patient",
          status: 201,
          durationMs: 1100,
          error: null,
          extracted: { id: "p1" },
          feedback: {
            reviewer: "pilot",
            comment: "Cok yer kapliyor",
            rating: 3,
            unnecessary: true,
            occurredAt: "2026-08-01T09:00:02.000Z",
          },
          passed: true,
          fieldFound: true,
        },
      ],
    },
    {
      scenario: "appointment",
      title: "Randevu",
      module: "appointment",
      startedAt: "2026-08-01T09:01:00.000Z",
      finishedAt: "2026-08-01T09:01:01.000Z",
      totalDurationMs: 1000,
      passedCount: 2,
      failedCount: 0,
      allPassed: true,
      unnecessaryCount: 1,
      averageRating: 4,
      steps: [
        {
          name: "list_calendar",
          status: 200,
          durationMs: 200,
          error: null,
          extracted: {},
          feedback: null,
          passed: true,
          fieldFound: null,
        },
        {
          name: "create_appointment",
          status: 201,
          durationMs: 800,
          error: null,
          extracted: { id: "a1" },
          feedback: {
            reviewer: "pilot",
            comment: "Eksik alan",
            rating: 4,
            unnecessary: false,
            occurredAt: "2026-08-01T09:01:01.000Z",
          },
          passed: true,
          fieldFound: true,
        },
      ],
    },
  ],
};

describe("summarize", () => {
  it("toplam ve gecme istatistikleri", () => {
    const s = summarize(baseResult);
    expect(s.total).toBe(2);
    expect(s.passed).toBe(2);
    expect(s.failed).toBe(0);
    expect(s.passRate).toBe(1);
    expect(s.averageRating).toBe(4.5);
    expect(s.unnecessaryCount).toBe(1);
  });
  it("ortalama adim suresi hesaplanir", () => {
    const s = summarize(baseResult);
    // (800+100+1100+200+800)/5 = 600
    expect(s.averageStepDurationMs).toBe(600);
  });
  it("bos sonuclar 0 dondurur", () => {
    const s = summarize({ ...baseResult, scenarios: [] });
    expect(s.total).toBe(0);
    expect(s.passRate).toBe(0);
    expect(s.averageStepDurationMs).toBe(0);
  });
});

describe("formatDuration", () => {
  it("ms altinda ms gosterir", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(123)).toBe("123ms");
  });
  it("saniyeye cevirir", () => {
    expect(formatDuration(1500)).toBe("1.50s");
  });
  it("dakika-saniye", () => {
    expect(formatDuration(125000)).toBe("2m5s");
  });
});

describe("formatTimestamp", () => {
  it("ISO'yu Turkce formata cevirir", () => {
    expect(formatTimestamp("2026-08-01T09:05:00.000Z")).toBe(
      "2026-08-01 09:05",
    );
  });
  it("gecersiz ISO'yu aynen dondurur", () => {
    expect(formatTimestamp("not-iso")).toBe("not-iso");
  });
});

describe("reportToMarkdown", () => {
  it("baslik ve ozet tabloda", () => {
    const md = reportToMarkdown(baseResult);
    expect(md).toContain("# Pilot Kabul Testi Raporu (GOAL-121)");
    expect(md).toContain("**Toplam senaryo:** 2");
    expect(md).toContain("**Gecen:** 2 (100%)");
  });
  it("senaryo blogu var", () => {
    const md = reportToMarkdown(baseResult);
    expect(md).toContain("### ✅ Yeni musteri");
    expect(md).toContain("### ✅ Randevu");
  });
  it("gereksiz adim isareti gorunur", () => {
    const md = reportToMarkdown(baseResult);
    expect(md).toContain("[gereksiz]");
    expect(md).toContain("[puan:5/5]");
  });
  it("basarisiz adim yoksa not duser", () => {
    const md = reportToMarkdown(baseResult);
    expect(md).toContain("_Hic basarisiz adim yok._");
  });
});

describe("reportToJson", () => {
  it("makine-okur JSON uretir", () => {
    const j = JSON.parse(reportToJson(baseResult));
    expect(j.runAt).toBe(baseResult.runAt);
    expect(j.summary.total).toBe(2);
    expect(j.scenarios.length).toBe(2);
    expect(j.scenarios[0].scenario).toBe("new_owner_patient");
  });
});

describe("buildReport", () => {
  it("hem md hem json dondurur", () => {
    const r = buildReport(baseResult);
    expect(r.markdown).toContain("# Pilot Kabul Testi Raporu");
    expect(JSON.parse(r.json).summary.total).toBe(2);
  });
});
