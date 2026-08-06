/**
 * @file Pilot geri bildirim dosyasi (JSON) okuyucu testleri.
 * @module @vetniva/acceptance-test/tests/feedback-loader
 *
 * @description GOAL-121 (FAZ-12) feedback-form.html tarafindan
 * uretilen JSON dosyasinin parse edilip runner'in bekledigi
 * Map formatina donusturulmesini dogrular. PII maskeleme, hatali
 * puan/reviewer ve eksik alanlarin nasil islendigini test eder.
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import { describe, expect, it } from "vitest";

import {
  FEEDBACK_INVALID_RATING,
  FEEDBACK_MISSING_REVIEWER,
} from "../src/feedback.js";
import {
  flattenForScenario,
  parseFeedbackJson,
  type RawFeedbackFile,
} from "../src/feedback-loader.js";
import type { UatFeedback } from "../src/types.js";

describe("parseFeedbackJson", () => {
  it("_meta.reviewer ile scenario'lara reviewer miras verir", () => {
    const raw: RawFeedbackFile = {
      _meta: { generatedAt: "2026-08-01T00:00:00.000Z", reviewer: "Dr. X" },
      new_owner_patient: {
        create_owner: { rating: 4, comment: "Hizli", unnecessary: false },
      },
    };
    const map = parseFeedbackJson(raw);
    const scenario = map.get("new_owner_patient");
    expect(scenario).toBeDefined();
    const fb = scenario?.get("create_owner");
    expect(fb).toBeDefined();
    expect(fb?.reviewer).toBe("Dr. X");
    expect(fb?.rating).toBe(4);
    expect(fb?.comment).toBe("Hizli");
  });

  it("satir basina ayri reviewer verilmisse onu kullanir", () => {
    const raw: RawFeedbackFile = {
      _meta: { reviewer: "Dr. X" },
      examination: {
        start_examination: {
          reviewer: "Dr. Y",
          rating: 5,
          comment: "Mukemmel",
          unnecessary: false,
        },
      },
    };
    const map = parseFeedbackJson(raw);
    const fb = map.get("examination")?.get("start_examination");
    expect(fb?.reviewer).toBe("Dr. Y");
  });

  it("PII yorumu maskelenir", () => {
    const raw: RawFeedbackFile = {
      _meta: { reviewer: "Dr. X" },
      new_owner_patient: {
        create_owner: {
          rating: 4,
          comment: "Telefon: 05551234567, mail: user@host.com",
          unnecessary: false,
        },
      },
    };
    const map = parseFeedbackJson(raw);
    const fb = map.get("new_owner_patient")?.get("create_owner");
    expect(fb).toBeDefined();
    expect(fb?.comment).not.toContain("05551234567");
    expect(fb?.comment).not.toContain("user@host.com");
  });

  it("bilinmeyen senaryo anahtari sessizce atlanir", () => {
    const raw: RawFeedbackFile = {
      _meta: { reviewer: "Dr. X" },
      unknown_scenario: {
        some_step: { rating: 4, comment: "x", unnecessary: false },
      },
      new_owner_patient: {
        create_owner: { rating: 4, comment: "y", unnecessary: false },
      },
    };
    const map = parseFeedbackJson(raw);
    expect(map.has("unknown_scenario")).toBe(false);
    expect(map.get("new_owner_patient")?.get("create_owner")?.rating).toBe(4);
  });

  it("gecersiz puan hata firlatir (UAT-FEEDBACK-0002)", () => {
    const raw: RawFeedbackFile = {
      _meta: { reviewer: "Dr. X" },
      new_owner_patient: {
        create_owner: { rating: 6, comment: "x", unnecessary: false },
      },
    };
    expect(() => parseFeedbackJson(raw)).toThrow(FEEDBACK_INVALID_RATING);
  });

  it("reviewer yoksa hata firlatir (UAT-FEEDBACK-0003)", () => {
    const raw: RawFeedbackFile = {
      new_owner_patient: {
        create_owner: { rating: 4, comment: "x", unnecessary: false },
      },
    };
    expect(() => parseFeedbackJson(raw)).toThrow(FEEDBACK_MISSING_REVIEWER);
  });

  it("bos senaryo blogu atlanir (hata firlatilmaz)", () => {
    const raw: RawFeedbackFile = {
      _meta: { reviewer: "Dr. X" },
      new_owner_patient: {},
    };
    const map = parseFeedbackJson(raw);
    expect(map.get("new_owner_patient")?.size).toBe(0);
  });

  it("unnecessary=true isareti korunur", () => {
    const raw: RawFeedbackFile = {
      _meta: { reviewer: "Dr. X" },
      new_owner_patient: {
        get_owner: { rating: 0, comment: "", unnecessary: true },
      },
    };
    const map = parseFeedbackJson(raw);
    const fb = map.get("new_owner_patient")?.get("get_owner");
    expect(fb?.unnecessary).toBe(true);
    expect(fb?.rating).toBe(0);
  });

  it("tum 10 senaryo anahtari parse edilir", () => {
    const raw: RawFeedbackFile = {
      _meta: { reviewer: "Dr. X" },
      new_owner_patient: {
        create_owner: { rating: 4, comment: "", unnecessary: false },
      },
      appointment: {
        create_appointment: { rating: 4, comment: "", unnecessary: false },
      },
      examination: {
        start_examination: { rating: 4, comment: "", unnecessary: false },
      },
      vaccination: {
        create_vaccine_application: {
          rating: 4,
          comment: "",
          unnecessary: false,
        },
      },
      petshop_sale: {
        create_sale: { rating: 4, comment: "", unnecessary: false },
      },
      collection: {
        create_payment: { rating: 4, comment: "", unnecessary: false },
      },
      surgery: {
        create_surgery_plan: { rating: 4, comment: "", unnecessary: false },
      },
      hospitalization: {
        create_hospitalization: {
          rating: 4,
          comment: "",
          unnecessary: false,
        },
      },
      laboratory: {
        create_lab_order: { rating: 4, comment: "", unnecessary: false },
      },
      portal: {
        create_portal_request: {
          rating: 4,
          comment: "",
          unnecessary: false,
        },
      },
    };
    const map = parseFeedbackJson(raw);
    expect(map.size).toBe(10);
  });
});

describe("flattenForScenario", () => {
  it("senaryo icin flat Map<String, UatFeedback> doner", () => {
    const raw: RawFeedbackFile = {
      _meta: { reviewer: "Dr. X" },
      new_owner_patient: {
        create_owner: { rating: 4, comment: "A", unnecessary: false },
        get_owner: { rating: 5, comment: "B", unnecessary: true },
      },
    };
    const map = parseFeedbackJson(raw);
    const flat = flattenForScenario(map, "new_owner_patient");
    expect(flat.size).toBe(2);
    const fbA = flat.get("create_owner") as UatFeedback;
    expect(fbA.rating).toBe(4);
    const fbB = flat.get("get_owner") as UatFeedback;
    expect(fbB.unnecessary).toBe(true);
  });

  it("senaryo bulunamazsa bos Map doner", () => {
    const flat = flattenForScenario(new Map(), "new_owner_patient");
    expect(flat.size).toBe(0);
  });
});
