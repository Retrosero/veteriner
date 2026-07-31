/**
 * @file generator.test.ts — k6 script uretici testleri.
 * @module @vetniva/load-test/tests/generator
 *
 * @description ScenarioConfig -> k6 .js script donusumunu ve
 * dosya yazimini dogrular. Tenant izolasyonu, PII ve audit
 * kurallarina uyar.
 *
 * @since GOAL-122 (FAZ-12) performans ve yuk testi
 */

import { describe, it, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  generateScenarioScript,
  writeAllScripts,
  listJsFiles,
} from "../src/generator.js";
import { K6_SHARED_TEMPLATE } from "../src/k6-shared.js";
import { SCENARIOS, getScenario } from "../src/config.js";

describe("K6_SHARED_TEMPLATE", () => {
  it("auth, tenant, branch header fabrikasi icerir", () => {
    expect(K6_SHARED_TEMPLATE).toContain("authHeaders");
    expect(K6_SHARED_TEMPLATE).toContain("X-Tenant-Id");
    expect(K6_SHARED_TEMPLATE).toContain("X-Branch-Id");
    expect(K6_SHARED_TEMPLATE).toContain("X-User-Id");
  });

  it("PII mask helper icerir", () => {
    expect(K6_SHARED_TEMPLATE).toContain("maskString");
  });

  it("vetGet/vetPost/vetPut/vetPatch/vetDelete helper icerir", () => {
    for (const fn of ["vetGet", "vetPost", "vetPut", "vetPatch", "vetDelete"]) {
      expect(K6_SHARED_TEMPLATE, fn).toContain(fn);
    }
  });

  it("assertTenantBoundary ile izolasyon kontrolu yapar", () => {
    expect(K6_SHARED_TEMPLATE).toContain("assertTenantBoundary");
    expect(K6_SHARED_TEMPLATE).toContain("tenantBoundaryCheck");
  });
});

describe("generateScenarioScript", () => {
  it("shared.js'den import satirini uretir", () => {
    const s = getScenario("patient_search");
    const out = generateScenarioScript(s, "pilot");
    expect(out).toContain("import");
    expect(out).toContain("./shared.js");
  });

  it("options blogu VU ve duration icerir", () => {
    const s = getScenario("patient_search");
    const out = generateScenarioScript(s, "pilot");
    expect(out).toContain("export const options");
    expect(out).toContain("vus: 10"); // pilot
    expect(out).toContain("duration: '2m'");
  });

  it("her step icin bir k6 check uretir", () => {
    const s = getScenario("patient_search");
    const out = generateScenarioScript(s, "pilot");
    for (const step of s.steps) {
      expect(out, step.name).toContain(step.name);
    }
  });

  it("POST step body literal olarak inline edilir", () => {
    const s = getScenario("pos");
    const out = generateScenarioScript(s, "pilot");
    expect(out).toContain("items");
    expect(out).toContain("branchId");
  });

  it("PI_BODY_REGEX inline edilir (string interpolation tamamlanir)", () => {
    const s = getScenario("patient_search");
    const out = generateScenarioScript(s, "pilot");
    expect(out).not.toContain("${PI_BODY_REGEX}");
    // en az bir regex fragmenti olmali
    expect(out).toMatch(/[\\w\.+-]+@/);
  });

  it("stress profili yuksek VU uretir", () => {
    const s = getScenario("patient_search");
    const out = generateScenarioScript(s, "stress");
    expect(out).toContain("vus: 200");
  });
});

describe("writeAllScripts", () => {
  it("shared.js + her senaryo .js dosyasi yazilir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loadtest-"));
    try {
      const written = await writeAllScripts(dir, "pilot", SCENARIOS);
      // 7 senaryo + shared.js = 8 dosya
      expect(written.length).toBe(SCENARIOS.length);

      const files = await listJsFiles(dir);
      expect(files).toContain("shared.js");
      for (const s of SCENARIOS) {
        expect(files, s.key).toContain(`${s.key}.js`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("yazilan dosyalar uretici ile tekrar uretilenle ayni olur", async () => {
    const dir = await mkdtemp(join(tmpdir(), "loadtest-"));
    try {
      await writeAllScripts(dir, "first_100", SCENARIOS);
      for (const s of SCENARIOS) {
        const onDisk = await readFile(join(dir, `${s.key}.js`), "utf8");
        const generated = generateScenarioScript(s, "first_100");
        expect(onDisk).toBe(generated);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
