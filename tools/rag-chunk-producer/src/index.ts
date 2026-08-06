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

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { load as parseYaml, dump as stringifyYaml } from "js-yaml";

import { HASH_PREFIX, contentHash } from "./hash.js";
import { writeJsonl } from "./jsonl.js";

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
  /** SHA-256 içerik özeti (`sha256:<64 hex>`). Boş bırakılırsa
   *  `contentHash(input)` ile otomatik hesaplanır. Eski
   *  katalogdaki (GOAL-005 seed) chunk'larda yoktur; merge
   *  sırasında eksikse geriye dönük uyumluluk için hesaplanır. */
  contentHash?: string;
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

/** Pipeline çalıştırma seçenekleri. */
export interface PipelineOptions {
  /** Merge davranışı.
   *  - `id-only`: chunk_id aynıysa atla (varsayılan, geriye
   *    dönük uyumlu).
   *  - `hash`: chunk_id aynı + contentHash aynıysa atla;
   *    contentHash değişmişse güncelle. */
  mergeMode?: "id-only" | "hash";
  /** JSONL dosyasını da yaz. `outputFile` ile aynı dizinde,
   *  `outputFile` uzantısı `.jsonl` ile değiştirilerek
   *  üretilir (ör. `AI_CHUNKS.yaml` → `AI_CHUNKS.jsonl`). */
  writeJsonl?: boolean;
  /** true ise dosya yazmaz, yalnızca plan istatistiklerini
   *  döner (`runPipelinePlan`). `runPipeline` için no-op. */
  dryRun?: boolean;
}

/** `mergeChunks` dönüş tipi. `updated` alanı yalnızca
 *  `mergeMode: "hash"` modunda set edilir. */
export interface MergeResult {
  added: number;
  skipped: number;
  /** Hash modunda, içerik değiştiği için güncellenen
   *  chunk sayısı. `id-only` modunda her zaman 0. */
  updated: number;
  /** Merge sonrası katalogtaki tüm chunk listesi. JSONL
   *  ihracatı ve FAZ-12+ retrieval loader için kullanılır;
   *  ekleme + atlama + güncelleme sonrası nihai liste. */
  merged: ProducedChunk[];
}

/** Pipeline plan raporu (dry-run ve ölçüm için). */
export interface PipelinePlan {
  total: number;
  /** Üretilen chunk sayısı (discover + parse). */
  byType: Record<string, number>;
  byLocale: Record<string, number>;
  /** Mevcut katalogla karşılaştırıldığında eklenmesi
   *  beklenen (id-only) veya eklenen + güncellenen (hash)
   *  sayısı. */
  wouldAdd: number;
  /** Mevcut katalogda zaten aynı kayıtla eşleşen
   *  chunk sayısı (atlanacak). */
  wouldSkip: number;
  /** Hash modunda: içerik değiştiği için güncellenecek
   *  chunk sayısı. */
  wouldUpdate: number;
  sourceDir: string;
  outputFile: string;
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
    const source = relative(".", filePath).split(sep).join("/");
    const chunk: ProducedChunk = {
      chunk_id: id,
      type: inferType(filePath, title),
      source,
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
    };
    chunk.contentHash = contentHash({
      source: chunk.source,
      title: chunk.title,
      content: chunk.content,
    });
    chunks.push(chunk);
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
  const source = relative(".", filePath).split(sep).join("/");
  const chunk: ProducedChunk = {
    chunk_id: id,
    type: "page",
    source,
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
  };
  chunk.contentHash = contentHash({
    source: chunk.source,
    title: chunk.title,
    content: chunk.content,
  });
  return [chunk];
}

/**
 * Eski kataloglardan (contentHash içermeyen seed verisi)
 * okunan chunk'lar için deterministik hash hesaplar. Bu
 * fonksiyon `mergeChunks` içinde tek seferlik backfill için
 * kullanılır; merge kararı vermez, yalnızca alanı doldurur.
 *
 * Eski seed chunk'larında `source` / `title` / `content`
 * alanlarından biri eksik olabilir (ör. GOAL-005 ile
 * üretilen minimal test fixture'ları). Bu durumda içerik
 * hash'i hesaplanamaz; bunun yerine `chunk_id`'den türetilmiş
 * kararlı bir sentinel hash atanır. Böylece hash modunda
 * ilk gerçek pipeline çalışması eski minimal kaydı
 * eksiksiz içerikle değiştirir; sonraki çalışmalar
 * tekrar atlar.
 */
function ensureContentHash(chunk: ProducedChunk): void {
  if (chunk.contentHash && chunk.contentHash.length > 0) return;
  if (!chunk.source || !chunk.title || !chunk.content) {
    const fallback = createHash("sha256")
      .update(`legacy:${chunk.chunk_id}`, "utf8")
      .digest("hex");
    chunk.contentHash = `${HASH_PREFIX}${fallback}`;
    return;
  }
  chunk.contentHash = contentHash({
    source: chunk.source,
    title: chunk.title,
    content: chunk.content,
  });
}

/**
 * AI_CHUNKS.yaml dosyasına yeni chunk'ları ekler (idempotent).
 *
 * `mergeMode: "id-only"` (varsayılan): `chunk_id` zaten
 * dosyada varsa atlanır. Eski davranış; geriye dönük
 * uyumlu.
 *
 * `mergeMode: "hash"`: `chunk_id` aynı + `contentHash` aynı
 * ise atlanır; `contentHash` değişmişse mevcut kayıt
 * güncellenir (version + last_verified_at dahil). Yeni
 * `chunk_id`'ler eklenir. Bu mod CI'da "hangi docs
 * değişti?" sorusunu netleştirir.
 */
export async function mergeChunks(
  outputFile: string,
  newChunks: ProducedChunk[],
  options: { mergeMode?: "id-only" | "hash" } = {},
): Promise<MergeResult> {
  const mode = options.mergeMode ?? "id-only";
  let existing: ProducedChunk[] = [];
  let catalog: Record<string, unknown> = { version: "1.0.0" };
  try {
    const raw = await readFile(outputFile, "utf8");
    const parsed = parseYaml(raw) as
      | ProducedChunk[]
      | Record<string, unknown>
      | null;
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

  // Eski seed verisinde (GOAL-005) contentHash yok; merge
  // kararı vermeden önce tüm mevcut chunk'lar için backfill.
  for (const chunk of existing) {
    ensureContentHash(chunk);
  }

  const existingById = new Map<string, ProducedChunk>();
  for (const chunk of existing) {
    existingById.set(chunk.chunk_id, chunk);
  }

  const toAdd: ProducedChunk[] = [];
  const toUpdate: ProducedChunk[] = [];
  let skipped = 0;
  for (const incoming of newChunks) {
    const prior = existingById.get(incoming.chunk_id);
    if (!prior) {
      toAdd.push(incoming);
      continue;
    }
    if (mode === "id-only") {
      skipped += 1;
      continue;
    }
    // hash modu
    if (prior.contentHash === incoming.contentHash) {
      skipped += 1;
      continue;
    }
    // İçerik değişmiş: güncelle. Eski version/last_verified_at
    // korunmaz; yeni pipeline çalıştırma zamanı yansır.
    toUpdate.push(incoming);
  }

  if (toAdd.length === 0 && toUpdate.length === 0) {
    return { added: 0, skipped, updated: 0, merged: existing };
  }

  // Update listesi: existing listesinde aynı chunk_id'leri
  // yenisiyle değiştir. Sıra korunur; güncellenen chunk
  // ilk geçtiği yerde kalır (insanlar için kararlı sıralama).
  const updatedIds = new Set(toUpdate.map((c) => c.chunk_id));
  const merged: ProducedChunk[] = existing.map((c) => {
    if (!updatedIds.has(c.chunk_id)) return c;
    const replacement = toUpdate.find((u) => u.chunk_id === c.chunk_id);
    return replacement ?? c;
  });
  // Yeni eklenen chunk'lar listenin sonuna eklenir.
  for (const chunk of toAdd) {
    merged.push(chunk);
  }

  const yaml = stringifyYaml(
    { ...catalog, chunks: merged },
    { lineWidth: 100, noRefs: true },
  );
  await writeFile(outputFile, yaml, "utf8");
  return {
    added: toAdd.length,
    skipped,
    updated: toUpdate.length,
    merged,
  };
}

/**
 * Üretim istatistiklerini döner; dosya yazmaz. CLI
 * `--dry-run` modunda ve testlerde kullanılır. Mevcut
 * katalogla karşılaştırma `mergeMode`'a göre yapılır.
 */
export async function runPipelinePlan(
  config: PipelineConfig,
  options: PipelineOptions = {},
): Promise<PipelinePlan> {
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

  // Mevcut katalogla karşılaştır (kuru plan).
  const existing = await readExistingChunks(config.outputFile);
  const existingById = new Map<string, ProducedChunk>();
  for (const c of existing) {
    ensureContentHash(c);
    existingById.set(c.chunk_id, c);
  }
  const mode = options.mergeMode ?? "id-only";
  let wouldAdd = 0;
  let wouldSkip = 0;
  let wouldUpdate = 0;
  for (const incoming of allChunks) {
    const prior = existingById.get(incoming.chunk_id);
    if (!prior) {
      wouldAdd += 1;
      continue;
    }
    if (mode === "id-only") {
      wouldSkip += 1;
      continue;
    }
    if (prior.contentHash === incoming.contentHash) {
      wouldSkip += 1;
      continue;
    }
    wouldUpdate += 1;
  }

  return {
    total: allChunks.length,
    byType: countBy(allChunks, (c) => c.type),
    byLocale: countBy(allChunks, (c) => c.locale),
    wouldAdd,
    wouldSkip,
    wouldUpdate,
    sourceDir: config.sourceDir,
    outputFile: config.outputFile,
  };
}

/**
 * Tüm pipeline'ı çalıştırır. `dryRun: true` ise dosya
 * yazmaz, yalnızca planı döner.
 */
export async function runPipeline(
  config: PipelineConfig,
  options: PipelineOptions = {},
): Promise<
  | { mode: "executed"; total: number; byType: Record<string, number>; byLocale: Record<string, number>; added: number; skipped: number; updated: number; jsonlPath?: string }
  | { mode: "dry-run"; plan: PipelinePlan }
> {
  if (options.dryRun === true) {
    const plan = await runPipelinePlan(config, options);
    return { mode: "dry-run", plan };
  }
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
  const result = await mergeChunks(config.outputFile, allChunks, {
    mergeMode: options.mergeMode,
  });

  let jsonlPath: string | undefined;
  if (options.writeJsonl === true) {
    jsonlPath = jsonlPathFor(config.outputFile);
    // JSONL, merge sonrası nihai katalog listesini yazar.
    // FAZ-12+ retrieval loader bu dosyayı canonical kaynak
    // olarak kullanır; seed + yeni chunk'lar tek listede.
    await writeJsonl(jsonlPath, result.merged);
  }

  return {
    mode: "executed",
    total: allChunks.length,
    byType: countBy(allChunks, (c) => c.type),
    byLocale: countBy(allChunks, (c) => c.locale),
    added: result.added,
    skipped: result.skipped,
    updated: result.updated,
    jsonlPath,
  };
}

/* --------------------------------------------------------------------------
 * Yardımcılar
 * --------------------------------------------------------------------------
 */

/**
 * Mevcut katalogdan chunk listesini okur. `mergeChunks` ve
 * `runPipelinePlan` tarafından paylaşılır; ortak format
 * normalizasyonu burada toplanır.
 */
async function readExistingChunks(outputFile: string): Promise<ProducedChunk[]> {
  try {
    const raw = await readFile(outputFile, "utf8");
    const parsed = parseYaml(raw) as
      | ProducedChunk[]
      | Record<string, unknown>
      | null;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      const chunks = parsed["chunks"];
      if (Array.isArray(chunks)) return chunks as ProducedChunk[];
    }
    return [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    // Parse hatası durumunda boş döner; mergeChunks da aynı
    // politika ile davranır.
    return [];
  }
}

/** `path.yaml` → `path.jsonl`. Aynı dizinde, aynı gövde. */
function jsonlPathFor(yamlPath: string): string {
  return yamlPath.replace(/\.ya?ml$/i, ".jsonl");
}

/** `arr` üzerinde `keyFn` ile gruplanmış sayım. */
function countBy<T>(arr: ReadonlyArray<T>, keyFn: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of arr) {
    const k = keyFn(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

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

interface CliArgs {
  sourceDir: string;
  outputFile: string;
  defaultLocale: "tr-TR" | "en-GB";
  dryRun: boolean;
  hashOnly: boolean;
  writeJsonl: boolean;
  json: boolean;
}

/**
 * CLI argümanlarını ayrıştırır. Bilinmeyen flag'ler sessizce
 * yok sayılır (forward-compat); eksik değerler varsayılana
 * düşer.
 */
function parseCliArgs(argv: ReadonlyArray<string>): CliArgs {
  const out: CliArgs = {
    sourceDir: "docs/workflows",
    outputFile: "docs/ai/AI_CHUNKS.yaml",
    defaultLocale: "tr-TR",
    dryRun: false,
    hashOnly: false,
    writeJsonl: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source" && i + 1 < argv.length) {
      out.sourceDir = argv[i + 1]!;
      i += 1;
    } else if (arg === "--output" && i + 1 < argv.length) {
      out.outputFile = argv[i + 1]!;
      i += 1;
    } else if (arg === "--locale" && i + 1 < argv.length) {
      const loc = argv[i + 1]!;
      if (loc === "tr-TR" || loc === "en-GB") {
        out.defaultLocale = loc;
      }
      i += 1;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    } else if (arg === "--hash-only") {
      out.hashOnly = true;
    } else if (arg === "--jsonl") {
      out.writeJsonl = true;
    } else if (arg === "--json") {
      out.json = true;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const sourceStat = await stat(args.sourceDir).catch(() => null);
  if (!sourceStat) {
    console.error(`Source dir not found: ${args.sourceDir}`);
    process.exit(1);
  }
  const runAt = new Date().toISOString().slice(0, 10);
  const config: PipelineConfig = {
    sourceDir: args.sourceDir,
    outputFile: args.outputFile,
    defaultLocale: args.defaultLocale,
    runAt,
  };
  const options: PipelineOptions = {
    dryRun: args.dryRun,
    mergeMode: args.hashOnly ? "hash" : "id-only",
    writeJsonl: args.writeJsonl,
  };
  const result = await runPipeline(config, options);

  if (result.mode === "dry-run") {
    const p = result.plan;
    if (args.json) {
      console.log(JSON.stringify(p, null, 2));
    } else {
      console.log(
        `[dry-run] total=${p.total} add=${p.wouldAdd} skip=${p.wouldSkip} update=${p.wouldUpdate} src=${p.sourceDir}`,
      );
      const types = Object.entries(p.byType)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      const locales = Object.entries(p.byLocale)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      if (types) console.log(`[dry-run] types: ${types}`);
      if (locales) console.log(`[dry-run] locales: ${locales}`);
    }
    return;
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          mode: "executed",
          total: result.total,
          byType: result.byType,
          byLocale: result.byLocale,
          added: result.added,
          skipped: result.skipped,
          updated: result.updated,
          jsonlPath: result.jsonlPath ?? null,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `RAG chunk pipeline: total=${result.total} added=${result.added} skipped=${result.skipped} updated=${result.updated}`,
    );
    if (result.jsonlPath) {
      console.log(`JSONL written: ${result.jsonlPath}`);
    }
  }
}

const isMain =
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`;
if (isMain) {
  void main();
}
