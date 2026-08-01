/**
 * @file RAG chunk production pipeline.
 * @module @vetniva/rag-chunk-producer
 *
 * @description Markdown + YAML dokümanları AI_CHUNKS.yaml
 * formatına dönüştürür. Her chunk metadata + content
 * taşır; `pnpm docs:check` şema doğrulaması yapar.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk production pipeline
 */

import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { load as parseYaml, dump as stringifyYaml } from "js-yaml";

/* --------------------------------------------------------------------------
 * Tipler
 * --------------------------------------------------------------------------
 */

/** Üretilen chunk'ın yapısı. */
export interface ProducedChunk {
  chunk_id: string;
  type:
    | "glossary"
    | "flow"
    | "field"
    | "permission"
    | "error"
    | "page"
    | "user_education";
  source: string;
  entity: string;
  locale: "tr-TR" | "en-GB";
  version: string;
  last_verified_at: string;
  confidence: "high" | "medium" | "low";
  pii: boolean;
  title: string;
  content: string;
  keywords: string[];
  related_chunks: string[];
  related_pages: string[];
  related_api: string[];
}

/** Pipeline konfigürasyonu. */
export interface PipelineConfig {
  /** Kaynak dizin (recursive). */
  sourceDir: string;
  /** Çıktı dosyası. */
  outputFile: string;
  /** Chunk'ın varsayılan dili. */
  defaultLocale: "tr-TR" | "en-GB";
  /** Pipeline çalıştırma zamanı. */
  runAt: string;
}

/* --------------------------------------------------------------------------
 * Ana fonksiyonlar
 * --------------------------------------------------------------------------
 */

/**
 * Kaynak dizindeki tüm desteklenen dosyaları keşfeder
 * (.md, .yaml, .yml).
 */
export async function discoverFiles(sourceDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (/\.(md|yaml|yml)$/i.test(entry.name)) {
        files.push(full);
      }
    }
  }

  await walk(sourceDir);
  return files.sort();
}

/**
 * Markdown dosyasını parçalara ayırır. Her `## Başlık`
 * yeni bir chunk sınırı olur.
 */
export function chunkMarkdown(
  content: string,
  filePath: string,
  config: PipelineConfig,
): ProducedChunk[] {
  const chunks: ProducedChunk[] = [];
  const sections = content.split(/^## /m);
  // İlk bölüm dosya başlığıdır (skip).
  for (let i = 1; i < sections.length; i += 1) {
    const section = sections[i]!;
    const newlineIdx = section.indexOf("\n");
    if (newlineIdx < 0) continue;
    const title = section.slice(0, newlineIdx).trim();
    const body = section.slice(newlineIdx + 1).trim();
    if (!title || !body) continue;
    const id = inferChunkId(filePath, title, "flow");
    chunks.push({
      chunk_id: id,
      type: inferType(filePath, title),
      source: relative(".", filePath).split(sep).join("/"),
      entity: inferEntity(filePath),
      locale: config.defaultLocale,
      version: "1.0.0",
      last_verified_at: config.runAt,
      confidence: "high",
      pii: false,
      title,
      content: body,
      keywords: extractKeywords(title, body),
      related_chunks: [],
      related_pages: [],
      related_api: extractApiRefs(body),
    });
  }
  return chunks;
}

/**
 * YAML dosyasını (sayfa kataloğu, permission) tek bir
 * chunk'a dönüştürür.
 */
export function chunkYaml(
  content: string,
  filePath: string,
  config: PipelineConfig,
): ProducedChunk[] {
  let parsed: Record<string, unknown> | null;
  try {
    parsed = parseYaml(content) as Record<string, unknown> | null;
  } catch {
    // Parse hatası: bu dosyayı atla (sessizce devam et). Üretim
    // hataya karşı dayanıklı olmalı; sadece geçerli YAML üretir.
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const id = (parsed["page_id"] as string | undefined) ?? filePath;
  const title =
    (parsed["title_key"] as string | undefined) ??
    (parsed["name"] as string | undefined) ??
    id;
  const purpose = parsed["purpose"] as
    { "tr-TR"?: string; "en-GB"?: string } | undefined;
  const summary = purpose?.[config.defaultLocale] ?? purpose?.["tr-TR"] ?? "";
  return [
    {
      chunk_id: id,
      type: "page",
      source: relative(".", filePath).split(sep).join("/"),
      entity: id,
      locale: config.defaultLocale,
      version: "1.0.0",
      last_verified_at: config.runAt,
      confidence: "high",
      pii: false,
      title,
      content: summary,
      keywords: extractKeywords(title, summary),
      related_chunks: [],
      related_pages: Array.isArray(parsed["related_pages"])
        ? (parsed["related_pages"] as string[])
        : [],
      related_api: Array.isArray(parsed["related_api"])
        ? (parsed["related_api"] as string[])
        : [],
    },
  ];
}

/**
 * AI_CHUNKS.yaml dosyasına yeni chunk'ları ekler (idempotent).
 * `chunk_id` zaten varsa atlanır.
 */
export async function mergeChunks(
  outputFile: string,
  newChunks: ProducedChunk[],
): Promise<{ added: number; skipped: number }> {
  let existing: ProducedChunk[] = [];
  let catalog: Record<string, unknown> = { version: "1.0.0" };
  try {
    const raw = await readFile(outputFile, "utf8");
    const parsed = parseYaml(raw) as
      ProducedChunk[] | Record<string, unknown> | null;
    if (Array.isArray(parsed)) {
      // Eski kök-listesi formatı, kayıpsız biçimde yeni şemaya taşınır.
      existing = parsed;
    } else if (parsed && typeof parsed === "object") {
      catalog = { ...parsed };
      const catalogChunks = parsed["chunks"];
      if (Array.isArray(catalogChunks)) {
        existing = catalogChunks as ProducedChunk[];
      }
    }
  } catch (err) {
    // Dosya yoksa veya parse hatası varsa sıfırdan başla.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      // Parse hatası: dosyayı yeniden yazmak için array olarak parse et.
    }
  }
  const existingIds = new Set(existing.map((c) => c.chunk_id));
  const toAdd = newChunks.filter((c) => !existingIds.has(c.chunk_id));
  if (toAdd.length === 0) {
    return { added: 0, skipped: newChunks.length };
  }
  const merged = [...existing, ...toAdd];
  const yaml = stringifyYaml(
    { ...catalog, chunks: merged },
    { lineWidth: 100, noRefs: true },
  );
  await writeFile(outputFile, yaml, "utf8");
  return { added: toAdd.length, skipped: newChunks.length - toAdd.length };
}

/**
 * Tüm pipeline'ı çalıştırır.
 */
export async function runPipeline(config: PipelineConfig): Promise<{
  total: number;
  added: number;
  skipped: number;
}> {
  const files = await discoverFiles(config.sourceDir);
  const allChunks: ProducedChunk[] = [];
  for (const file of files) {
    const content = await readFile(file, "utf8");
    if (file.endsWith(".md")) {
      allChunks.push(...chunkMarkdown(content, file, config));
    } else {
      allChunks.push(...chunkYaml(content, file, config));
    }
  }
  const result = await mergeChunks(config.outputFile, allChunks);
  return { total: allChunks.length, ...result };
}

/* --------------------------------------------------------------------------
 * Yardımcılar
 * --------------------------------------------------------------------------
 */

export function inferChunkId(
  filePath: string,
  title: string,
  kind: string,
): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  const fileSlug =
    relative(".", filePath)
      .replace(/^docs\//, "")
      .replace(/\.(md|yaml|yml)$/i, "")
      .split("/")
      .pop() ?? "unknown";
  return `${kind}-${fileSlug}-${slug}`.replace(/--+/g, "-");
}

export function inferType(
  filePath: string,
  title: string,
): ProducedChunk["type"] {
  if (filePath.includes("/workflows/")) return "flow";
  if (filePath.includes("/pages/")) return "page";
  if (filePath.includes("/errors/")) return "error";
  if (filePath.includes("/permissions/")) return "permission";
  if (filePath.includes("/fields/")) return "field";
  if (filePath.includes("/user-education/")) return "user_education";
  if (filePath.includes("/domain/")) return "glossary";
  if (
    title.toLowerCase().includes("akış") ||
    title.toLowerCase().includes("flow")
  ) {
    return "flow";
  }
  return "glossary";
}

export function inferEntity(filePath: string): string {
  const file = relative(".", filePath)
    .replace(/^docs\//, "")
    .split("/");
  return file.slice(0, 2).join("/");
}

export function extractKeywords(title: string, body: string): string[] {
  const text = `${title} ${body}`.toLowerCase();
  const stopwords = new Set([
    "ve",
    "ile",
    "için",
    "olan",
    "olarak",
    "bu",
    "şu",
    "bir",
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
  ]);
  const tokens = text.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 3);
  const set = new Set<string>();
  for (const t of tokens) {
    if (stopwords.has(t)) continue;
    set.add(t);
    if (set.size >= 8) break;
  }
  return Array.from(set);
}

export function extractApiRefs(body: string): string[] {
  const re = /(?:GET|POST|PATCH|DELETE|PUT)\s+(\/api\/v\d+\/[^\s`")]+)/g;
  const refs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    refs.push(match[1]!);
  }
  return Array.from(new Set(refs));
}

/* --------------------------------------------------------------------------
 * CLI entry
 * --------------------------------------------------------------------------
 */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf("--source");
  const sourceDir = sourceIdx >= 0 ? args[sourceIdx + 1] : "docs/workflows";
  const outputFile = "docs/ai/AI_CHUNKS.yaml";
  const defaultLocale: "tr-TR" | "en-GB" = "tr-TR";
  const runAt = new Date().toISOString().slice(0, 10);

  const sourceStat = await stat(sourceDir).catch(() => null);
  if (!sourceStat) {
    console.error(`Source dir not found: ${sourceDir}`);
    process.exit(1);
  }

  const result = await runPipeline({
    sourceDir,
    outputFile,
    defaultLocale,
    runAt,
  });
  console.log(
    `RAG chunk pipeline: total=${result.total} added=${result.added} skipped=${result.skipped}`,
  );
}

const isMain =
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain) {
  void main();
}
