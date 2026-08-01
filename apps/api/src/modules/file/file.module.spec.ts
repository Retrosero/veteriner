/**
 * @file FileModule production sürücü seçimi testleri.
 * @module apps/api/modules/file/module/spec
 * @description Ortam seçiminin hatalı değerleri ve production'da güvenli
 * olmayan local/noop fallback'lerini uygulama başlamadan reddettiğini doğrular.
 * @security Production dosya verisi yalnızca S3 ve gerçek ClamAV ile işlenir;
 * geliştirme kolaylığı için kullanılan sürücüler production'a sızamaz.
 */

import { afterEach, describe, expect, it } from "vitest";

import { resolveScanDriver, resolveStorageDriver } from "./file.module.js";

const originalNodeEnv = process.env["NODE_ENV"];

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env["NODE_ENV"];
  else process.env["NODE_ENV"] = originalNodeEnv;
});

describe("FileModule production driver policy", () => {
  it("development için local ve noop sürücüleri kabul eder", () => {
    process.env["NODE_ENV"] = "development";
    expect(resolveStorageDriver("local")).toBe("local");
    expect(resolveScanDriver("noop")).toBe("noop");
  });

  it("production için S3 ve ClamAV zorunludur", () => {
    process.env["NODE_ENV"] = "production";
    expect(() => resolveStorageDriver("local")).toThrow(
      "file-storage-driver-production-requires-s3",
    );
    expect(() => resolveScanDriver("noop")).toThrow(
      "file-scan-driver-production-requires-clamav",
    );
    expect(resolveStorageDriver("s3")).toBe("s3");
    expect(resolveScanDriver("clamav")).toBe("clamav");
  });

  it("tanınmayan sürücü adını fail-fast reddeder", () => {
    expect(() => resolveStorageDriver("filesystem")).toThrow(
      "file-storage-driver-invalid-filesystem",
    );
    expect(() => resolveScanDriver("disabled")).toThrow(
      "file-scan-driver-invalid-disabled",
    );
  });
});
