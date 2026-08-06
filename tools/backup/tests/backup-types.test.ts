/**
 * @file backup-types.test.ts — RPO/RTO tier + validate testleri.
 * @module @vetniva/backup/tests/backup-types
 *
 * @description RPO/RTO tier matrisinin dokumantasyonla
 * uyumunu, critical/pilot/production tier degerlerinin
 * dogru oldugunu dogrular. Tenant izolasyonu ve PII
 * kurallarina uyar.
 *
 * @since GOAL-124 (FAZ-12) backup + restore
 */

import { describe, it, expect } from "vitest";

import {
  RPO_RTO_TIERS,
  rpoRtoForTier,
  type BackupTier,
} from "../src/backup-types.js";

describe("RPO_RTO_TIERS", () => {
  it("3 tier tanimli (pilot/production/critical)", () => {
    expect(Object.keys(RPO_RTO_TIERS).sort()).toEqual([
      "critical",
      "pilot",
      "production",
    ]);
  });

  it("pilot tier RPO 5dk, RTO 60dk", () => {
    expect(RPO_RTO_TIERS.pilot.rpoMinutes).toBe(5);
    expect(RPO_RTO_TIERS.pilot.rtoMinutes).toBe(60);
  });

  it("production tier RPO 1dk, RTO 30dk", () => {
    expect(RPO_RTO_TIERS.production.rpoMinutes).toBe(1);
    expect(RPO_RTO_TIERS.production.rtoMinutes).toBe(30);
  });

  it("critical tier RPO 0dk (KVKK/UK GDPR zero data loss), RTO 15dk", () => {
    expect(RPO_RTO_TIERS.critical.rpoMinutes).toBe(0);
    expect(RPO_RTO_TIERS.critical.rtoMinutes).toBe(15);
  });

  it("RPO her zaman RTO'dan kucuk veya esit", () => {
    for (const tier of Object.keys(RPO_RTO_TIERS) as BackupTier[]) {
      expect(RPO_RTO_TIERS[tier].rpoMinutes, tier).toBeLessThanOrEqual(
        RPO_RTO_TIERS[tier].rtoMinutes,
      );
    }
  });

  it("retention policy tum tier'lar icin 7/4/12 (daily/weekly/monthly)", () => {
    for (const tier of Object.keys(RPO_RTO_TIERS) as BackupTier[]) {
      const cfg = RPO_RTO_TIERS[tier];
      expect(cfg.retentionDaily, `${tier}.daily`).toBeGreaterThanOrEqual(7);
      expect(cfg.retentionWeekly, `${tier}.weekly`).toBeGreaterThanOrEqual(4);
      expect(cfg.retentionMonthly, `${tier}.monthly`).toBeGreaterThanOrEqual(
        12,
      );
    }
  });
});

describe("rpoRtoForTier", () => {
  it("pilot tier ozeti uretir", () => {
    const out = rpoRtoForTier("pilot");
    expect(out.tier).toBe("pilot");
    expect(out.rpoMinutes).toBe(5);
    expect(out.rtoMinutes).toBe(60);
    expect(out.strategy).toContain("WAL");
  });

  it("critical tier ozeti KVKK uyumu tasir", () => {
    const out = rpoRtoForTier("critical");
    expect(out.rpoMinutes).toBe(0);
    expect(out.description).toContain("0dk");
  });
});
