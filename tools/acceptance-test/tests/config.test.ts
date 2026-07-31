/**
 * @file Pilot kabul (UAT) senaryo katalogu testleri.
 * @module @vetniva/acceptance-test/tests/config
 *
 * @description 10 pilot senaryosunun varligini, temel yapisal
 * kurallara uyumunu (anahtar benzersizligi, mod/rol, adim
 * status) ve placeholder tutarliligini dogrular.
 *
 * @since GOAL-121 (FAZ-12) pilot kabul testleri
 */

import { describe, expect, it } from "vitest";

import {
  SCENARIOS,
  getScenario,
  listScenarioKeys,
  scenariosByPriority,
} from "../src/config.js";
import type {
  HttpMethod,
  UatScenarioConfig,
  UatStep,
} from "../src/types.js";

const VALID_METHODS: ReadonlyArray<HttpMethod> = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
];

describe("SCENARIOS katalogu", () => {
  it("10 pilot senaryosu tanimli", () => {
    expect(SCENARIOS.length).toBe(10);
  });

  it("tum senaryo anahtarlari benzersiz", () => {
    const keys = SCENARIOS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("her senaryoda en az 2 adim var", () => {
    for (const s of SCENARIOS) {
      expect(s.steps.length, `${s.key} adim sayisi`).toBeGreaterThanOrEqual(2);
    }
  });

  it("her senaryo gecerli HTTP metodu kullanir", () => {
    for (const s of SCENARIOS) {
      for (const step of s.steps) {
        expect(VALID_METHODS, `${s.key}/${step.name} method`).toContain(
          step.method,
        );
      }
    }
  });

  it("POST adimlari expectStatus=201 bekler", () => {
    for (const s of SCENARIOS) {
      for (const step of s.steps) {
        if (step.method === "POST") {
          expect(
            step.expectStatus === 201 ||
              (Array.isArray(step.expectStatus) &&
                step.expectStatus.includes(201)),
            `${s.key}/${step.name} POST status`,
          ).toBe(true);
        }
      }
    }
  });

  it("her senaryoda title/description/module/actorRole dolu", () => {
    for (const s of SCENARIOS) {
      expect(s.title.length, `${s.key} title`).toBeGreaterThan(0);
      expect(s.description.length, `${s.key} description`).toBeGreaterThan(0);
      expect(s.module.length, `${s.key} module`).toBeGreaterThan(0);
      expect(s.actorRole.length, `${s.key} role`).toBeGreaterThan(0);
    }
  });

  it("priority 1/2/3 arasinda", () => {
    for (const s of SCENARIOS) {
      expect([1, 2, 3], `${s.key} priority`).toContain(s.priority);
    }
  });

  it("placeholder adlari {xxx} formatinda", () => {
    const placeholderRe = /\{([a-zA-Z0-9_]+)\}/g;
    for (const s of SCENARIOS) {
      const text = JSON.stringify(s);
      const matches = text.match(placeholderRe) ?? [];
      for (const m of matches) {
        expect(m.startsWith("{") && m.endsWith("}")).toBe(true);
      }
    }
  });

  it("senaryo anahtarlari UatScenarioKey enum'unu tam kapsar", () => {
    const expected: ReadonlyArray<string> = [
      "new_owner_patient",
      "appointment",
      "examination",
      "vaccination",
      "petshop_sale",
      "collection",
      "surgery",
      "hospitalization",
      "laboratory",
      "portal",
    ];
    const actual = listScenarioKeys();
    for (const k of expected) {
      expect(actual, k).toContain(k);
    }
  });

  it("scenariosByPriority filtre calisiyor", () => {
    const p1 = scenariosByPriority(1);
    expect(p1.length).toBeGreaterThanOrEqual(1);
    for (const s of p1) expect(s.priority).toBe(1);
    const p3 = scenariosByPriority(3);
    for (const s of p3) expect(s.priority).toBe(3);
  });

  it("getScenario bilinmeyen anahtarda hata firlatir", () => {
    expect(() =>
      getScenario("unknown_scenario" as UatScenarioConfig["key"]),
    ).toThrow(/Bilinmeyen pilot senaryosu/);
  });
});

describe("Senaryo icerik dogrulamalari", () => {
  it("yeni_owner_patient: ownerId ve patientId olusturulur", () => {
    const s = getScenario("new_owner_patient");
    const createOwner = s.steps.find((st: UatStep) => st.name === "create_owner");
    const createPatient = s.steps.find(
      (st: UatStep) => st.name === "create_patient",
    );
    expect(createOwner?.expectField).toBe("id");
    expect(JSON.stringify(createPatient?.body)).toContain("{ownerId}");
  });

  it("appointment: {ownerId}/{patientId} placeholder'lari onceki adimlardan gelir", () => {
    const s = getScenario("appointment");
    expect(s.steps[0].name).toBe("list_calendar_today");
    // create_appointment {patientId} icermeli
    const create = s.steps[1];
    expect(create.path).toContain("{patientId}");
  });

  it("portal: approve adimi {appointmentId} placeholder'i kullanir", () => {
    const s = getScenario("portal");
    const approve = s.steps.find(
      (st: UatStep) => st.name === "approve_portal_request",
    );
    expect(approve?.path).toContain("{portalRequestId}");
  });
});
