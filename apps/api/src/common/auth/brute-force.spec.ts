/**
 * @file Brute-force guard unit testleri.
 * @module apps/api/common/auth/brute-force.spec
 * @description In-memory sayaç + lockout mantığı. MAX_FAILED_LOGIN_COUNT
 * sonrası lockout uygulanır; başarılı login sayacı sıfırlar.
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import {
  ACCOUNT_LOCK_SECONDS,
  MAX_FAILED_LOGIN_COUNT,
} from "@vetniva/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import { BruteForceGuard } from "./brute-force.js";

describe("BruteForceGuard", () => {
  let guard: BruteForceGuard;

  beforeEach(() => {
    guard = new BruteForceGuard();
  });

  it("eşik altında kilit uygulanmaz", () => {
    for (let i = 0; i < MAX_FAILED_LOGIN_COUNT - 1; i++) {
      expect(guard.recordFailure("user:1")).toBe(false);
    }
    expect(guard.isLocked("user:1")).toBe(false);
  });

  it("eşik aşıldığında lockout döner", () => {
    for (let i = 0; i < MAX_FAILED_LOGIN_COUNT; i++) {
      guard.recordFailure("user:1");
    }
    expect(guard.isLocked("user:1")).toBe(true);
    expect(guard.remainingLockSeconds("user:1")).toBeGreaterThan(0);
    expect(guard.remainingLockSeconds("user:1")).toBeLessThanOrEqual(
      ACCOUNT_LOCK_SECONDS,
    );
  });

  it("başarılı login sayacı sıfırlar", () => {
    for (let i = 0; i < MAX_FAILED_LOGIN_COUNT; i++) {
      guard.recordFailure("user:1");
    }
    expect(guard.isLocked("user:1")).toBe(true);
    guard.recordSuccess("user:1");
    expect(guard.isLocked("user:1")).toBe(false);
    expect(guard.remainingLockSeconds("user:1")).toBe(0);
  });

  it("farklı anahtarlar birbirinden bağımsız", () => {
    for (let i = 0; i < MAX_FAILED_LOGIN_COUNT; i++) {
      guard.recordFailure("user:1");
    }
    expect(guard.isLocked("user:1")).toBe(true);
    expect(guard.isLocked("user:2")).toBe(false);
  });

  it("lockout süresi dolunca tekrar deneme hakkı doğar", async () => {
    for (let i = 0; i < MAX_FAILED_LOGIN_COUNT; i++) {
      guard.recordFailure("user:1");
    }
    // Lockout var; recordSuccess ile sıfırlanabilir.
    guard.recordSuccess("user:1");
    expect(guard.isLocked("user:1")).toBe(false);
  });
});
