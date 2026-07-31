/**
 * @file Pilot kabul (UAT) geri bildirim testleri.
 * @module @vetniva/acceptance-test/tests/feedback
 *
 * @description PII maskeleme, puan dogrulama, gereksiz
 * adim sayma ve UatFeedback sema testleri.
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import { describe, expect, it } from "vitest";

import {
  averageRating,
  buildFeedback,
  FEEDBACK_INVALID_RATING,
  FEEDBACK_MISSING_REVIEWER,
  isValidRating,
  maskPii,
  unnecessaryCount,
} from "../src/feedback.js";
import type { UatStepResult } from "../src/types.js";

describe("maskPii", () => {
  it("email maskelenir", () => {
    const r = maskPii("mail: foo at bar dot com");
    expect(r.text).toBe("mail: foo at bar dot com");
    // gercek email formati
    const r2 = maskPii("hello: " + "user" + "@" + "host" + ".io");
    expect(r2.masked).toBe(true);
    expect(r2.text).toContain("@***");
  });
  it("TCKN maskelenir", () => {
    const r = maskPii("TC 12345678950");
    expect(r.masked).toBe(true);
    expect(r.text).not.toContain("12345678950");
  });
  it("telefon maskelenir", () => {
    const r = maskPii("Arayin 05551234567");
    expect(r.masked).toBe(true);
    expect(r.text).not.toContain("05551234567");
  });
  it("IBAN maskelenir", () => {
    const r = maskPii("IBAN: TR330006100519786457841326");
    expect(r.masked).toBe(true);
    expect(r.text).toContain("TR**");
  });
  it("kart numarasi maskelenir", () => {
    const r = maskPii("Kart: 4111 1111 1111 1111");
    expect(r.masked).toBe(true);
    expect(r.text).toContain("****");
  });
  it("PII yoksa aynen kalir", () => {
    const r = maskPii("Sadece Turkce yorum");
    expect(r.masked).toBe(false);
    expect(r.text).toBe("Sadece Turkce yorum");
  });
  it("bos string", () => {
    const r = maskPii("");
    expect(r.text).toBe("");
    expect(r.masked).toBe(false);
  });
});

describe("isValidRating", () => {
  it("0 ve 1-5 gecerli", () => {
    expect(isValidRating(0)).toBe(true);
    for (let i = 1; i <= 5; i++) expect(isValidRating(i)).toBe(true);
  });
  it("6 ve -1 gecersiz", () => {
    expect(isValidRating(6)).toBe(false);
    expect(isValidRating(-1)).toBe(false);
    expect(isValidRating(1.5)).toBe(false);
  });
});

describe("buildFeedback", () => {
  it("minimum gecerli geri bildirim", () => {
    const f = buildFeedback({ reviewer: "pilot" });
    expect(f.reviewer).toBe("pilot");
    expect(f.rating).toBe(0);
    expect(f.unnecessary).toBe(false);
    expect(f.comment).toBe("");
  });
  it("reviewer bos ise hata", () => {
    expect(() => buildFeedback({ reviewer: "" })).toThrow(
      FEEDBACK_MISSING_REVIEWER,
    );
    expect(() => buildFeedback({ reviewer: "   " })).toThrow(
      FEEDBACK_MISSING_REVIEWER,
    );
  });
  it("gecersiz puan hatasi", () => {
    expect(() =>
      buildFeedback({ reviewer: "p", rating: 9 as unknown as 1 }),
    ).toThrow(FEEDBACK_INVALID_RATING);
  });
  it("PII yorum maskelenir", () => {
    const f = buildFeedback({
      reviewer: "pilot",
      comment: "TC 12345678950",
      rating: 4,
    });
    expect(f.comment).not.toContain("12345678950");
  });
  it("occurredAt override edilebilir", () => {
    const f = buildFeedback({
      reviewer: "p",
      occurredAt: "2026-08-01T00:00:00.000Z",
    });
    expect(f.occurredAt).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("adim istatistikleri", () => {
  const makeResult = (feedback: UatStepResult["feedback"]): UatStepResult => ({
    name: "x",
    status: 200,
    durationMs: 10,
    error: null,
    extracted: {},
    feedback,
    passed: true,
    fieldFound: true,
  });

  it("averageRating bos feedback ile 0", () => {
    expect(averageRating([makeResult(null)])).toBe(0);
  });
  it("averageRating ortalama alir", () => {
    const r = averageRating([
      makeResult({
        reviewer: "a",
        comment: "",
        rating: 4,
        unnecessary: false,
        occurredAt: "",
      }),
      makeResult({
        reviewer: "a",
        comment: "",
        rating: 2,
        unnecessary: false,
        occurredAt: "",
      }),
    ]);
    expect(r).toBe(3);
  });
  it("unnecessaryCount sadece unnecessary=true olanlari sayar", () => {
    const count = unnecessaryCount([
      makeResult({
        reviewer: "a",
        comment: "",
        rating: 0,
        unnecessary: true,
        occurredAt: "",
      }),
      makeResult(null),
    ]);
    expect(count).toBe(1);
  });
});
