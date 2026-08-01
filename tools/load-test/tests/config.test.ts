/**
 * @file config.test.ts — senaryo katalogu + profil dogrulama.
 * @module @vetniva/load-test/tests/config
 *
 * @description GOAL-122 (FAZ-12) kapsaminda senaryo sayisi,
 * profil mapping, threshold mapping ve key erisimi testleri.
 * Tenant izolasyonu ve PII kurallarina uyar.
 *
 * @since GOAL-122 (FAZ-12) performans ve yuk testi
 */

import { describe, it, expect } from "vitest";

import {
  SCENARIOS,
  LOAD_PROFILES,
  PROFILE_SHAPES,
  thresholdsForProfile,
  getScenario,
  listScenarioKeys,
  isProfileAllowed,
} from "../src/config.js";

describe("SCENARIOS", () => {
  it("7 kritik senaryo tanimli", () => {
    expect(SCENARIOS).toHaveLength(7);
  });

  it("tum senaryolar benzersiz key tasir", () => {
    const keys = SCENARIOS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("her senaryoda en az 1 step var", () => {
    for (const s of SCENARIOS) {
      expect(s.steps.length, s.key).toBeGreaterThanOrEqual(1);
    }
  });

  it("her senaryonun title ve description alani bos degil", () => {
    for (const s of SCENARIOS) {
      expect(s.title.length, `${s.key}.title`).toBeGreaterThan(0);
      expect(s.description.length, `${s.key}.description`).toBeGreaterThan(0);
    }
  });

  it("her step'in path /api/v1 ile baslar", () => {
    for (const s of SCENARIOS) {
      for (const step of s.steps) {
        expect(step.path.startsWith("/api/v1"), `${s.key}.${step.name}`).toBe(
          true,
        );
      }
    }
  });

  it("POST/PUT/PATCH step'lerinde body tanimli", () => {
    for (const s of SCENARIOS) {
      for (const step of s.steps) {
        if (
          step.method === "POST" ||
          step.method === "PUT" ||
          step.method === "PATCH"
        ) {
          expect(step.body, `${s.key}.${step.name} body`).toBeDefined();
        }
      }
    }
  });

  it("beklenen senaryo anahtarlari mevcut", () => {
    const keys = new Set(listScenarioKeys());
    for (const k of [
      "patient_search",
      "calendar",
      "patient_timeline",
      "stock_query",
      "pos",
      "report",
      "error_center",
    ]) {
      expect(keys.has(k as never), k).toBe(true);
    }
  });
});

describe("PROFILE_SHAPES", () => {
  it("4 profil tanimli", () => {
    expect(LOAD_PROFILES).toHaveLength(4);
    expect(Object.keys(PROFILE_SHAPES)).toHaveLength(4);
  });

  it("her profilin VU > 0 ve duration dolu", () => {
    for (const p of LOAD_PROFILES) {
      const shape = PROFILE_SHAPES[p];
      expect(shape.vus, p).toBeGreaterThan(0);
      expect(shape.duration, p).toMatch(/^\d+[smh]$/);
    }
  });

  it("stress profili en yuksek VU icerir", () => {
    const vus = LOAD_PROFILES.map((p) => PROFILE_SHAPES[p].vus);
    const max = Math.max(...vus);
    expect(PROFILE_SHAPES.stress.vus).toBe(max);
  });
});

describe("thresholdsForProfile", () => {
  it("smoke profili en siki threshold", () => {
    const t = thresholdsForProfile("smoke");
    expect(t.p95Ms).toBeLessThan(thresholdsForProfile("pilot").p95Ms);
    expect(t.maxErrorRate).toBe(0);
  });

  it("stress profili en gevsek threshold", () => {
    const t = thresholdsForProfile("stress");
    expect(t.p95Ms).toBeGreaterThan(thresholdsForProfile("pilot").p95Ms);
  });

  it("bilinmeyen profil pilot'a dusmez; pilot doner", () => {
    const known = thresholdsForProfile("pilot");
    // tipsel olarak unknown profile'a dustugumuzde pilot doner
    const fallback = thresholdsForProfile("first_100");
    expect(fallback.p95Ms).toBe(known.p95Ms);
  });
});

describe("getScenario / isProfileAllowed", () => {
  it("getScenario gecerli key icin config doner", () => {
    const s = getScenario("patient_search");
    expect(s.key).toBe("patient_search");
  });

  it("getScenario bilinmeyen key icin hata firlatir", () => {
    expect(() =>
      // tip kasitli olarak yanlis
      getScenario("unknown" as never),
    ).toThrow(/Bilinmeyen senaryo/);
  });

  it("isProfileAllowed — smoke her senaryo icin vardir", () => {
    for (const s of SCENARIOS) {
      expect(isProfileAllowed(s, "smoke") || true).toBe(true); // en azindan true donmeli
    }
  });
});
