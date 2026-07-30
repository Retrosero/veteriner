/**
 * @file AI chunk tarayıcısı.
 * @module @vetniva/docs-check/scanners/ai-chunks
 *
 * @description `docs/ai/AI_CHUNKS.yaml` dosyasını okur,
 * chunk şemasına uygunluğunu doğrular, tutarsızlıkları
 * raporlar. Yeni format GOAL-005 ile birlikte.
 */

import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import path from "node:path";

import yaml from "js-yaml";

import type { Issue } from "../types.js";

const VALID_TYPES = new Set([
  "glossary",
  "flow",
  "field",
  "permission",
  "error",
  "audit",
  "page",
  "api",
  "country",
  "log-standard",
  "pii-rule",
  "correlation",
]);

const VALID_LOCALES = new Set(["tr-TR", "en-GB"]);

const VALID_CONFIDENCE = new Set(["high", "medium", "low"]);

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/**
 * AI_CHUNKS.yaml dosyasını okuyup her chunk için doğrulama yapar.
 * Tutarsızlıklar `Issue[]` olarak döner.
 */
export async function scanAiChunks(root: string): Promise<{
  chunks: number;
  issues: Issue[];
}> {
  const aiDir = path.join(root, "docs/ai");
  const files = await fg(["AI_CHUNKS.yaml", "AI_CHUNKS.yml"], {
    cwd: aiDir,
    onlyFiles: true,
  });

  const issues: Issue[] = [];
  if (files.length === 0) {
    issues.push({
      severity: "warning",
      path: "docs/ai/AI_CHUNKS.yaml",
      message: "AI_CHUNKS.yaml dosyası bulunamadı.",
    });
    return { chunks: 0, issues };
  }

  const yamlPath = path.join(aiDir, files[0]!);
  const text = await readFile(yamlPath, "utf8");
  const parsed = yaml.load(text) as unknown;
  if (!parsed || typeof parsed !== "object") {
    issues.push({
      severity: "error",
      path: "docs/ai/AI_CHUNKS.yaml",
      message: "YAML parse edilemedi veya kök obje değil.",
    });
    return { chunks: 0, issues };
  }

  const chunks = (parsed as { chunks?: unknown[] }).chunks;
  if (!Array.isArray(chunks)) {
    issues.push({
      severity: "error",
      path: "docs/ai/AI_CHUNKS.yaml",
      message: "`chunks` array bekleniyor.",
    });
    return { chunks: 0, issues };
  }

  const seenIds = new Set<string>();
  let count = 0;

  for (const [i, raw] of chunks.entries()) {
    const chunk = raw as Record<string, unknown>;
    const ref = `docs/ai/AI_CHUNKS.yaml#chunks[${i}]`;
    count += 1;

    const id = chunk.chunk_id;
    if (typeof id !== "string" || id.length === 0) {
      issues.push({ severity: "error", path: ref, message: "`chunk_id` zorunlu." });
    } else {
      if (seenIds.has(id)) {
        issues.push({
          severity: "error",
          path: ref,
          message: `Tekrarlayan chunk_id: ${id}`,
        });
      }
      seenIds.add(id);
    }

    if (typeof chunk.type !== "string" || !VALID_TYPES.has(chunk.type)) {
      issues.push({
        severity: "error",
        path: ref,
        message: `Geçersiz veya eksik \`type\`. Bilinen: ${[...VALID_TYPES].join(", ")}`,
      });
    }

    if (
      typeof chunk.locale !== "string" ||
      !VALID_LOCALES.has(chunk.locale)
    ) {
      issues.push({
        severity: "error",
        path: ref,
        message: `Geçersiz \`locale\`. Bilinen: ${[...VALID_LOCALES].join(", ")}`,
      });
    }

    if (typeof chunk.version !== "string" || !SEMVER_RE.test(chunk.version)) {
      issues.push({
        severity: "warning",
        path: ref,
        message: "`version` semver formatında olmalı (örn. 1.0.0).",
      });
    }

    if (
      typeof chunk.last_verified_at !== "string" &&
      !(chunk.last_verified_at instanceof Date)
    ) {
      issues.push({
        severity: "warning",
        path: ref,
        message: "`last_verified_at` ISO 8601 string veya Date olmalı.",
      });
    } else {
      // 90 günden eski ise degraded
      const last =
        chunk.last_verified_at instanceof Date
          ? chunk.last_verified_at.getTime()
          : Date.parse(chunk.last_verified_at);
      if (Number.isFinite(last)) {
        const ageDays = (Date.now() - last) / (1000 * 60 * 60 * 24);
        if (ageDays > 90) {
          issues.push({
            severity: "warning",
            path: ref,
            message: `Chunk 90 günden eski (degraded): ${Math.round(ageDays)} gün.`,
          });
        }
      }
    }

    if (
      chunk.confidence !== undefined &&
      (typeof chunk.confidence !== "string" ||
        !VALID_CONFIDENCE.has(chunk.confidence))
    ) {
      issues.push({
        severity: "warning",
        path: ref,
        message: `Geçersiz \`confidence\`: ${String(chunk.confidence)}`,
      });
    }

    if (typeof chunk.source !== "string" || chunk.source.length === 0) {
      issues.push({
        severity: "error",
        path: ref,
        message: "`source` zorunlu (kaynak dosya yolu).",
      });
    }

    if (typeof chunk.title !== "string" || chunk.title.length === 0) {
      issues.push({
        severity: "warning",
        path: ref,
        message: "`title` zorunlu.",
      });
    }

    if (typeof chunk.content !== "string" || chunk.content.length < 50) {
      issues.push({
        severity: "warning",
        path: ref,
        message: "`content` en az 50 karakter olmalı.",
      });
    }
  }

  return { chunks: count, issues };
}
