/**
 * @file Doküman envanteri okuyucusu.
 * @module @vetniva/docs-check/scanners/docs
 * @description `docs/pages/`, `docs/api/`, `docs/errors/ERROR_CATALOG.md`,
 * `docs/permissions/PERMISSION_MATRIX.md` ve `docs/ai/AI_CHUNKS.yaml`
 * dosyalarını okuyup envanter çıkarır. Diğer tarayıcılar bu
 * envanteri kullanır.
 *
 * GOAL-004: VET-<MODULE>-<NNN> formatı desteklenir.
 * GOAL-005: AI_CHUNKS.yaml desteği eklendi.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";
import { load as parseYaml, loadAll as parseAllYaml } from "js-yaml";

import type { DocInventory } from "../types.js";

/** VET- formatı. */
const VET_CODE_RE = /`?(VET-[A-Z]{2,12}-[0-9]{4})`?/g;
/** Eski TR_/EN_ formatı. */
// eslint-disable-next-line security/detect-unsafe-regex -- Sabit desen, yalnızca repo dokümanlarında statik envanter taraması yapar.
const LEGACY_CODE_RE = /`?((TR|EN)_[A-Z]+(_[A-Z]+)*_[0-9]{1,4})`?/g;

/**
 * Dokümantasyon kaynaklarından doğrulama envanterini çıkarır.
 * @param docsRoot
 */
export async function readDocFiles(docsRoot: string): Promise<DocInventory> {
  const inv: DocInventory = {
    pageFiles: new Set(),
    apiFiles: new Set(),
    errorCodes: new Set(),
    permissions: new Set(),
    aiChunks: new Set(),
    fieldIds: new Set(),
  };

  const pageYmls = await fg(["pages/**/*.yaml", "pages/**/*.yml"], {
    cwd: docsRoot,
    onlyFiles: true,
  });
  for (const p of pageYmls) {
    inv.pageFiles.add(p.replace(/\.(yaml|yml)$/, "").replace(/\\/g, "/"));
  }

  const apiMd = await fg(["api/**/*.md"], { cwd: docsRoot, onlyFiles: true });
  for (const p of apiMd) {
    const stripped = p
      .replace(/^api\//, "")
      .replace(/\.md$/, "")
      .replace(/\\/g, "/");
    const normalized = stripped.replace(/\//g, ".");
    inv.apiFiles.add(normalized);
  }

  const errorCatalogPath = path.join(docsRoot, "errors/ERROR_CATALOG.md");
  const errorCatalog = await tryRead(errorCatalogPath);
  if (errorCatalog) {
    for (const m of errorCatalog.matchAll(VET_CODE_RE)) {
      const code = m[1];
      if (code) inv.errorCodes.add(code);
    }
    // Eski kodlar da envanterde (alias desteği).
    for (const m of errorCatalog.matchAll(LEGACY_CODE_RE)) {
      const code = m[1];
      if (code) inv.errorCodes.add(code);
    }
  }

  const permissionMatrixPath = path.join(
    docsRoot,
    "permissions/PERMISSION_MATRIX.md",
  );
  const permissionMatrix = await tryRead(permissionMatrixPath);
  if (permissionMatrix) {
    for (const m of permissionMatrix.matchAll(
      /`([a-zA-Z][a-zA-Z0-9_-]+:[a-zA-Z][a-zA-Z0-9_-]+(?::[a-zA-Z][a-zA-Z0-9_-]+)?)`/g, // eslint-disable-line security/detect-unsafe-regex -- Sabit izin biçimi yalnızca yerel doküman envanterinde kullanılır.
    )) {
      const perm = m[1];
      if (perm) inv.permissions.add(perm);
    }
  }

  // AI_CHUNKS.yaml — chunk_id envanteri.
  // Mixed YAML formatını destekler: üst düzey metadata + chunks listesi.
  // `loadAll` çoklu belge olarak parse eder (metadata document + chunks
  // document). `load` tek belge bekler, mixed formatta hata verir.
  const aiChunksPath = path.join(docsRoot, "ai/AI_CHUNKS.yaml");
  const aiChunksText = await tryRead(aiChunksPath);
  if (aiChunksText) {
    try {
      const documents = parseAllYaml(aiChunksText) as Array<
        Record<string, unknown>
      >;
      for (const doc of documents) {
        const chunks = doc.chunks;
        if (Array.isArray(chunks)) {
          for (const c of chunks) {
            if (
              c &&
              typeof (c as { chunk_id?: string }).chunk_id === "string"
            ) {
              inv.aiChunks.add((c as { chunk_id: string }).chunk_id);
            }
          }
        }
      }
    } catch {
      // Parse hatası ai-chunks scanner tarafından raporlanır.
    }
  }

  // fields.yaml — alan sözlüğü envanteri (GOAL-112).
  // Machine-readable format; her entity.fields[].id değeri
  // "<entity>.<field>" formatında alan kimliğidir.
  const fieldsPath = path.join(docsRoot, "fields/fields.yaml");
  const fieldsText = await tryRead(fieldsPath);
  if (fieldsText) {
    try {
      const parsed = parseYaml(fieldsText) as {
        entities?: Array<{
          fields?: Array<{ id?: string }>;
        }>;
      };
      if (parsed && Array.isArray(parsed.entities)) {
        for (const entity of parsed.entities) {
          if (!entity || !Array.isArray(entity.fields)) continue;
          for (const f of entity.fields) {
            if (f && typeof f.id === "string") {
              inv.fieldIds.add((f as { id: string }).id);
            }
          }
        }
      }
    } catch {
      // Parse hatası alanlar scanner tarafından raporlanır.
    }
  }

  return inv;
}

/**
 * Okunamayan veya olmayan bir dosya için hata yükseltmeden içerik okur.
 * @param p
 */
async function tryRead(p: string): Promise<string | undefined> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Yol runner tarafından repo içinden oluşturulur.
    return await readFile(p, "utf8");
  } catch {
    return undefined;
  }
}
