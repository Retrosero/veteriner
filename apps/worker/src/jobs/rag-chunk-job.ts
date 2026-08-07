/**
 * @file RAG chunk üretim job tanımı.
 * @module @vetniva/worker/jobs/rag-chunk-job
 *
 * @description `rag-chunk` queue'sunda işlenen job'un payload Zod
 * şeması ve processor fonksiyonu burada tanımlıdır. GOAL-116
 * (FAZ-11) — RAG chunk production pipeline'ın periyodik olarak
 * çalıştırılması. Processor, `tools/rag-chunk-producer` paketinin
 * `runPipeline` fonksiyonunu programatik olarak çağırır; CLI yerine
 * doğrudan TypeScript fonksiyon çağrısı yapıldığı için spawn
 * overhead'i yoktur.
 *
 * @security PII veya secret taşımaz. Yalnızca `source` dizini ve
 * `output` dosya yolu çevresinde meta veri taşır. Hata durumunda
 *   Zod validation mesajı failedReason'a yazılır; secret yoktur.
 *
 * @since GOAL-116 (FAZ-11) RAG chunk production pipeline
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { logger } from "../logger.js";

/**
 * Job payload şeması. `source` dizini recursive olarak taranır;
 * `output` dosyası idempotent merge yapılır.
 */
export const ragChunkJobPayloadSchema = z.object({
  /** Kaynak dizin (ör. `docs/workflows`, `docs/pages`). */
  source: z.string().min(1, "source zorunludur").default("docs/workflows"),
  /** Çıktı dosyası (YAML). */
  output: z
    .string()
    .min(1, "output zorunludur")
    .default("docs/ai/AI_CHUNKS.yaml"),
  /** Varsayılan locale. */
  defaultLocale: z.enum(["tr-TR", "en-GB"]).default("tr-TR"),
  /** Correlation ID. */
  requestId: z.string().min(1, "requestId zorunludur"),
});

/** Doğrulanmış payload tipi. */
export type RagChunkJobPayload = z.infer<typeof ragChunkJobPayloadSchema>;

/**
 * İşlem sonucu. Worker tarafından BullMQ'ya döner; job run
 * raporlaması ve scheduler metrikleri için kullanılır.
 */
export interface RagChunkJobResult {
  ok: boolean;
  total: number;
  added: number;
  skipped: number;
  source: string;
  output: string;
  /** Spawn modunda toplam süre (ms). */
  duration_ms: number;
  /** Çalıştırma modu. */
  mode: "spawn" | "in-process";
}

/**
 * RAG chunk production job processor. BullMQ tarafından çağrılır;
 * payload Zod ile doğrulanır, sonra `tools/rag-chunk-producer`
 * paketinin CLI'ı `tsx` üzerinden çalıştırılır. BullMQ'nun
 * exponential backoff'u sayesinde geçici FS hatalarında kendini
 * toplar.
 *
 * @param payload Job payload'ı (BullMQ'dan gelen raw JSON).
 * @returns İşlem sonucu.
 * @throws Geçersiz payload veya spawn hatası.
 */
export async function processRagChunkJob(
  payload: unknown,
): Promise<RagChunkJobResult> {
  const parsed = ragChunkJobPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`rag-chunk-job: payload doğrulaması başarısız: ${issues}`);
  }

  const data = parsed.data;
  const childLogger = logger.child({
    module: "worker",
    action: "rag-chunk-job",
    requestId: data.requestId,
  });

  childLogger.info(
    { source: data.source, output: data.output, locale: data.defaultLocale },
    "rag-chunk job başladı",
  );

  const result = await runProducerAsChild(data);

  childLogger.info(
    {
      ok: result.ok,
      total: result.total,
      added: result.added,
      skipped: result.skipped,
      duration_ms: result.duration_ms,
    },
    "rag-chunk job tamamlandı",
  );

  return result;
}

/**
 * `tools/rag-chunk-producer` paketinin CLI'ını `tsx` üzerinden
 * çalıştırır. Worker process'te aynı pnpm workspace bağımlılıkları
 * çözümlenmiş olduğundan ek bir `pnpm install` adımı gerekmez.
 *
 * @param data Doğrulanmış job payload'ı.
 * @returns Üretim istatistikleri + süre.
 */
async function runProducerAsChild(
  data: RagChunkJobPayload,
): Promise<RagChunkJobResult> {
  const start = Date.now();
  const repoRoot = findRepoRoot();
  const producerEntry = path.join(
    repoRoot,
    "tools/rag-chunk-producer/src/index.ts",
  );

  // Windows'ta forward slash'ler Node tarafından kabul edilir, ancak
  // shellescape için normalleştirilir. `--output` mutlaka geçilir;
  // producer default olarak repo kökündeki `docs/ai/AI_CHUNKS.yaml`
  // dosyasına yazar — test fixture'ı bu davranışa güvenemez, sandbox
  // yalıtımı için payload'daki `output` yolu kullanılmalıdır.
  const args = [
    "--import",
    "tsx",
    producerEntry,
    "--source",
    data.source,
    "--output",
    data.output,
  ];

  return new Promise<RagChunkJobResult>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        // Producer'ın konsol çıktısı job stdout'una yazılır; worker
        // log'unu kirletmesini önlemek için child process'in stdout'u
        // capture edilir.
        NODE_NO_WARNINGS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err: Error) => {
      reject(
        new Error(
          `rag-chunk producer spawn başarısız: ${err.message}; stderr=${stderr.slice(0, 500)}`,
        ),
      );
    });

    child.on("close", (code: number | null) => {
      const duration_ms = Date.now() - start;
      if (code !== 0) {
        reject(
          new Error(
            `rag-chunk producer exit code=${code ?? "null"}; stderr=${stderr.slice(0, 500)}`,
          ),
        );
        return;
      }
      // Producer'ın son satırı: "RAG chunk pipeline: total=... added=... skipped=..."
      const stats = parseProducerStats(stdout);
      resolve({
        ok: true,
        total: stats.total,
        added: stats.added,
        skipped: stats.skipped,
        source: data.source,
        output: data.output,
        duration_ms,
        mode: "spawn",
      });
    });
  });
}

/**
 * Producer stdout'unun son satırından istatistik çıkarır. Pattern
 * değişirse bu fonksiyon sessizce 0 döner; bu durum yalnızca
 * metrik kaybıdır, job hatası değildir.
 */
function parseProducerStats(stdout: string): {
  total: number;
  added: number;
  skipped: number;
} {
  const lines = stdout.trim().split(/\r?\n/);
  const last = lines[lines.length - 1] ?? "";
  const totalMatch = /total=(\d+)/.exec(last);
  const addedMatch = /added=(\d+)/.exec(last);
  const skippedMatch = /skipped=(\d+)/.exec(last);
  return {
    total: totalMatch && totalMatch[1] ? Number.parseInt(totalMatch[1], 10) : 0,
    added: addedMatch && addedMatch[1] ? Number.parseInt(addedMatch[1], 10) : 0,
    skipped:
      skippedMatch && skippedMatch[1]
        ? Number.parseInt(skippedMatch[1], 10)
        : 0,
  };
}

/**
 * Worker process'in çalıştığı dizinden repo kökünü bulur. `apps/worker`
 * altında çalıştığı için iki seviye yukarı çıkmak yeterlidir; ancak
 * daha sağlam bir yaklaşım `package.json` (`pnpm-workspace.yaml`)
 * aramaktır.
 */
function findRepoRoot(): string {
  // Worker `apps/worker` paketinde çalışır; `apps/worker` üst dizini
  // repo köküdür. Geliştirme/test sırasında CWD farklı olabilir;
  // bu yüzden iki adım yukarı + en yakın `pnpm-workspace.yaml` aranır.
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), ".."),
  ];
  for (const dir of candidates) {
    // pnpm-workspace.yaml marker'ı repo kökü kabul edilir.
    const marker = path.join(dir, "pnpm-workspace.yaml");
    try {
      if (existsSync(marker)) return dir;
    } catch {
      // Devam: sonraki aday.
    }
  }
  return process.cwd();
}
