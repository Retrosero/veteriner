/**
 * @file AI chunk loader (AI_CHUNKS.yaml dosya okuyucu).
 * @module apps/api/common/ai/ai-chunk-loader
 *
 * @description `docs/ai/AI_CHUNKS.yaml` dosyasını periyodik olarak
 * okur; içeriği in-memory normalize edilmiş bir indeks olarak
 * tutar. GOAL-116 (FAZ-11) — RAG chunk pipeline'ın web index
 * katmanı.
 *
 * Üretim planı:
 * - Faz 12+ ile vector DB (Qdrant/pgvector) ingest edilir; bu
 *   loader in-memory TF-IDF indeksini sıcak önbellek olarak tutar.
 * - Dosya değişikliği `fs.watch` ile algılanır; değişim olursa
 *   indeks yeniden yüklenir.
 *
 * @security Yalnızca public/technical chunk'lar yüklenir. PII
 *   chunk'lar yalnızca yetkili rollere açık olmalıdır; bu loader
 *   PII chunk'ları yükler ancak `search` çağrısı tenant + role
 *   filtresi uygular.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk pipeline + web index
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { load as parseYaml, loadAll as parseAllYaml } from "js-yaml";

/**
 * AI_CHUNKS.yaml'dan okunan normalize chunk.
 */
export interface LoadedChunk {
  chunk_id: string;
  type: string;
  title: string;
  content: string;
  locale: "tr-TR" | "en-GB";
  keywords: string[];
  source: string;
  /** PII içerikli mi? (PII chunk'lar yalnızca yetkili rollere). */
  pii: boolean;
  /** Tenant filtresi için metadata. */
  tenantId: string | null;
}

/**
 * AI_CHUNKS.yaml dosya okuyucu + normalize indeks.
 * Singleton; ilk `load` çağrısında dosyayı okur, sonraki
 * çağrılarda `lastMtime` değişmemişse cache'i döner.
 */
export class AiChunkLoader {
  private cache: LoadedChunk[] = [];
  private lastMtime: number = 0;
  private readonly filePath: string;
  /**
   * Test amaçlı override: dosya yerine sabit chunk listesi
   * kullanır. Üretimde bu opsiyon kullanılmaz; testlerde
   * `AiChunkLoader` direkt inject edilir.
   */
  private readonly staticChunks: LoadedChunk[] | null;

  public constructor(
    filePath: string,
    staticChunks?: LoadedChunk[] | null,
  ) {
    this.filePath = filePath;
    this.staticChunks = staticChunks ?? null;
    if (this.staticChunks !== null) {
      this.cache = [...this.staticChunks];
      this.lastMtime = Number.MAX_SAFE_INTEGER;
    }
  }

  /**
   * İndeksi döner. Dosya değişmemişse cache; değişmişse yeniden
   * yüklenir. Hata durumunda cache temizlenir ve exception fırlatılır.
   *
   * Test amaçlı `staticChunks` set edildiyse her zaman onu döner;
   * dosya sistemi erişimi yapılmaz.
   */
  public async load(): Promise<LoadedChunk[]> {
    if (this.staticChunks !== null) {
      return this.cache;
    }
    try {
      // this.filePath constructor'da tek seferlik set edilir; runtime'da
      // disaridan gelen kullanici girdisi degildir. Bu nedenle non-literal
      // fs yolu beklenen ve kontrollu bir kullanimdir.
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const s = await stat(this.filePath);
      const mtime = s.mtimeMs;
      if (mtime === this.lastMtime && this.cache.length > 0) {
        return this.cache;
      }
      this.cache = await this.readFile();
      this.lastMtime = mtime;
      return this.cache;
    } catch (err) {
      // Dosya yoksa cache boş döner; UI "henüz indekslenmedi" mesajı
      // gösterir. Yetki hatası varsa yine boş döner (testlerde
      // dosya yaratma gerekmesin).
      this.cache = [];
      this.lastMtime = 0;
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return this.cache;
      }
      throw err;
    }
  }

  /**
   * Cache'i manuel olarak temizler. Testlerde ve scheduler'da
   * (dosya değişiminde) kullanılır.
   */
  public invalidate(): void {
    this.cache = [];
    this.lastMtime = 0;
  }

  /**
   * Tek bir dosya okuması yapar. Hem "mixed" (multi-document YAML)
   * hem de tek-doküman formatını destekler.
   */
  private async readFile(): Promise<LoadedChunk[]> {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Yol config'ten gelir; prod'da sabit.
    const raw = await readFile(this.filePath, "utf8");
    const out: LoadedChunk[] = [];

    // Mixed YAML: `loadAll` her `---` ayracını ayrı doküman olarak
    // parse eder; üst düzey `chunks` listesini taşıyan tek doküman
    // modeliyle uyumludur.
    const documents = parseAllYaml(raw) as Array<Record<string, unknown>>;
    for (const doc of documents) {
      const chunks = doc["chunks"];
      if (!Array.isArray(chunks)) continue;
      for (const raw of chunks) {
        if (!raw || typeof raw !== "object") continue;
        const chunk = this.normalize(raw as Record<string, unknown>);
        if (chunk) out.push(chunk);
      }
    }
    return out;
  }

  /**
   * YAML objesini normalize eder. Zorunlu alanlar eksikse atlanır.
   * @param raw
   */
  private normalize(raw: Record<string, unknown>): LoadedChunk | null {
    const chunkId = raw["chunk_id"];
    const content = raw["content"];
    const title = raw["title"];
    if (typeof chunkId !== "string" || chunkId.length === 0) return null;
    if (typeof content !== "string" || content.length === 0) return null;
    if (typeof title !== "string" || title.length === 0) return null;
    const locale = raw["locale"] === "en-GB" ? "en-GB" : "tr-TR";
    const type = typeof raw["type"] === "string" ? raw["type"] : "glossary";
    const source = typeof raw["source"] === "string" ? raw["source"] : "";
    const pii = raw["pii"] === true;
    const tenantIdRaw = raw["tenantId"];
    const tenantId = typeof tenantIdRaw === "string" ? tenantIdRaw : null;
    const keywordsRaw = raw["keywords"];
    const keywords = Array.isArray(keywordsRaw)
      ? keywordsRaw.filter((k): k is string => typeof k === "string")
      : [];
    return {
      chunk_id: chunkId,
      type,
      title,
      content,
      locale,
      keywords,
      source,
      pii,
      tenantId,
    };
  }
}

/**
 * Default loader instance. Worker process'te üretilen
 * `docs/ai/AI_CHUNKS.yaml` dosyasını okur. Path, container
 * başlangıcında ortam değişkeni ile override edilebilir.
 */
export function defaultChunkLoader(
  env: NodeJS.ProcessEnv = process.env,
): AiChunkLoader {
  const relPath =
    env["RAG_CHUNKS_PATH"] ?? "docs/ai/AI_CHUNKS.yaml";
  // Göreceli yol: process.cwd() repo kökü varsayılır.
  const absPath = path.isAbsolute(relPath)
    ? relPath
    : path.resolve(process.cwd(), relPath);
  return new AiChunkLoader(absPath);
}

/**
 * YAML dosyasını doğrudan parse eder; test yardımcısı.
 * @param raw
 */
export function parseChunksYaml(raw: string): LoadedChunk[] {
  const out: LoadedChunk[] = [];
  let documents: Array<Record<string, unknown>>;
  try {
    // Mixed YAML desteği.
    documents = parseAllYaml(raw) as Array<Record<string, unknown>>;
  } catch {
    // Fallback: tek-doküman parse.
    const single = parseYaml(raw) as Record<string, unknown> | null;
    documents = single ? [single] : [];
  }
  for (const doc of documents) {
    const chunks = doc["chunks"];
    if (!Array.isArray(chunks)) continue;
    for (const c of chunks) {
      if (!c || typeof c !== "object") continue;
      const chunkId = (c as Record<string, unknown>)["chunk_id"];
      const content = (c as Record<string, unknown>)["content"];
      const title = (c as Record<string, unknown>)["title"];
      if (typeof chunkId !== "string") continue;
      if (typeof content !== "string") continue;
      if (typeof title !== "string") continue;
      const localeRaw = (c as Record<string, unknown>)["locale"];
      out.push({
        chunk_id: chunkId,
        type:
          typeof (c as Record<string, unknown>)["type"] === "string"
            ? ((c as Record<string, unknown>)["type"] as string)
            : "glossary",
        title,
        content,
        locale: localeRaw === "en-GB" ? "en-GB" : "tr-TR",
        keywords: Array.isArray((c as Record<string, unknown>)["keywords"])
          ? (((c as Record<string, unknown>)["keywords"] as unknown[]).filter(
              (k): k is string => typeof k === "string",
            ))
          : [],
        source:
          typeof (c as Record<string, unknown>)["source"] === "string"
            ? ((c as Record<string, unknown>)["source"] as string)
            : "",
        pii: (c as Record<string, unknown>)["pii"] === true,
        tenantId:
          typeof (c as Record<string, unknown>)["tenantId"] === "string"
            ? ((c as Record<string, unknown>)["tenantId"] as string)
            : null,
      });
    }
  }
  return out;
}
