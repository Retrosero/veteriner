/**
 * @file RAG chunk worker unit testleri.
 * @module @vetniva/worker/workers/rag-chunk.worker.spec
 *
 * @description Worker'ın processor işlevi izole test edilir.
 * BullMQ `Job` benzeri bir payload inşa edilir; `getRagChunkWorker`
 * çağrısı Redis bağlantısı gerektirdiğinden bu test yalnızca
 * processor mantığını doğrular (gerçek BullMQ entegrasyonu ileride
 * `ioredis-mock` veya testcontainers ile eklenecektir).
 *
 * @security Testlerde gerçek Redis'e bağlanılmaz; yalnızca
 * `processRagChunkJob` saf fonksiyon olarak test edilir.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk production pipeline
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  processRagChunkJob,
  ragChunkJobPayloadSchema,
} from "../jobs/rag-chunk-job.js";

import type { RagChunkJobPayload } from "../jobs/rag-chunk-job.js";

/**
 * Test sandbox'ı oluşturur. İçinde boş bir AI_CHUNKS.yaml ve bir
 * örnek markdown dosyası bulunur; producer bu dizinden okuyup
 * sandbox'taki output dosyasına yazar.
 */
async function makeSandbox(): Promise<{
  dir: string;
  sourceDir: string;
  outputFile: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vetniva-rag-cron-"));
  const sourceDir = path.join(dir, "workflows");
  const outputFile = path.join(dir, "AI_CHUNKS.yaml");
  // Source dizinini oluştur; producer `stat` ile varlığını kontrol
  // ediyor. Test sandbox'ı boş da olsa dizinin var olması gerekir.
  await mkdir(sourceDir, { recursive: true });
  return {
    dir,
    sourceDir,
    outputFile,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

describe("rag-chunk worker processor", () => {
  it("geçerli payload için Zod şeması kabul eder", () => {
    const payload: RagChunkJobPayload = {
      source: "docs/workflows",
      output: "docs/ai/AI_CHUNKS.yaml",
      defaultLocale: "tr-TR",
      requestId: "r-test-1",
    };
    const parsed = ragChunkJobPayloadSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it("payload doğrulaması başarısızsa exception fırlatır", async () => {
    // requestId boş → Zod hata.
    await expect(
      processRagChunkJob({ source: "x", requestId: "" }),
    ).rejects.toThrow(/rag-chunk-job/);
  });

  it("boş source dizini için job başarıyla tamamlanır (sıfır istatistik)", async () => {
    const sandbox = await makeSandbox();
    try {
      // Hiç dosya yok; producer 0/0/0 dönmeli.
      const result = await processRagChunkJob({
        source: sandbox.sourceDir,
        output: sandbox.outputFile,
        defaultLocale: "tr-TR",
        requestId: "r-empty",
      });
      expect(result.ok).toBe(true);
      expect(result.total).toBe(0);
      expect(result.added).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.mode).toBe("spawn");
    } finally {
      await sandbox.cleanup();
    }
  });

  it("örnek workflow markdown'ından chunk üretir ve istatistikleri döner", async () => {
    const sandbox = await makeSandbox();
    try {
      await writeFile(
        path.join(sandbox.sourceDir, "vaccine.md"),
        [
          "# Vaccine Flow",
          "",
          "## Aşı Kaydı Oluşturma",
          "",
          "Bir hayvana aşı uygulaması kaydetmek için önce hasta detay sayfasını açın. POST /api/v1/clinic/vaccines/applications kullanılır.",
          "",
          "## Aşı Hatırlatma",
          "",
          "Sistem her Pzt 09:00'da hatırlatma üretir.",
          "",
        ].join("\n"),
        "utf8",
      );
      const result = await processRagChunkJob({
        source: sandbox.sourceDir,
        output: sandbox.outputFile,
        defaultLocale: "tr-TR",
        requestId: "r-flow-1",
      });
      expect(result.ok).toBe(true);
      expect(result.total).toBeGreaterThan(0);
      expect(result.added).toBeGreaterThan(0);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    } finally {
      await sandbox.cleanup();
    }
  });

  it("aynı source iki kez çalıştırılırsa idempotent (skipped > 0)", async () => {
    const sandbox = await makeSandbox();
    try {
      await writeFile(
        path.join(sandbox.sourceDir, "owner.md"),
        [
          "## Hasta Sahibi Ekleme",
          "",
          "Yeni bir hasta sahibi eklemek için önce sahip araması yapılır.",
        ].join("\n"),
        "utf8",
      );
      const first = await processRagChunkJob({
        source: sandbox.sourceDir,
        output: sandbox.outputFile,
        defaultLocale: "tr-TR",
        requestId: "r-idem-1",
      });
      expect(first.added).toBeGreaterThan(0);
      const second = await processRagChunkJob({
        source: sandbox.sourceDir,
        output: sandbox.outputFile,
        defaultLocale: "tr-TR",
        requestId: "r-idem-2",
      });
      // İkinci çalıştırmada aynı chunk_id olduğu için added=0 olmalı.
      expect(second.added).toBe(0);
      expect(second.skipped).toBe(first.added);
    } finally {
      await sandbox.cleanup();
    }
  });

  it("en-GB locale ile de çalışır", async () => {
    const sandbox = await makeSandbox();
    try {
      await writeFile(
        path.join(sandbox.sourceDir, "register.md"),
        [
          "## Register a New Owner",
          "",
          "Steps to register a new patient owner in the clinic system.",
        ].join("\n"),
        "utf8",
      );
      const result = await processRagChunkJob({
        source: sandbox.sourceDir,
        output: sandbox.outputFile,
        defaultLocale: "en-GB",
        requestId: "r-en-1",
      });
      expect(result.ok).toBe(true);
      expect(result.total).toBeGreaterThan(0);
    } finally {
      await sandbox.cleanup();
    }
  });
});
