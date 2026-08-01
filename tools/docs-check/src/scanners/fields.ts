/**
 * @file Alan referansı tarayıcısı.
 * @module @vetniva/docs-check/scanners/fields
 * @description Kodda geçen alan referanslarını bulur. Format:
 * `<entity>.<field>` (ör. `tenant.slug`, `patient.microchip`,
 * `payment.amount`). Çıktı, `docs/fields/fields.yaml` kataloğu
 * ile çapraz doğrulanır.
 *
 * Tarama stratejisi:
 * 1. `packages/contracts/src/...` — Zod şemaları (tek doğruluk
 *    kaynağı). Burada tanımlı alanlar `entity.field` formatında
 *    referans olarak işlenir.
 * 2. `apps/api/src/modules/...` — DTO/repository katmanı. Birincil
 *    referans yine contracts'tır; bu katmanda geçen alan adları
 *    doğrudan `entity.field` olarak değil, sadece varlık adı
 *    çıkarımı için taranır.
 *
 * Varlık (entity) çıkarımı:
 * - Schema adı `xxxTenantYyySchema` → entity = "tenant".
 * - Dosya adı `tenant.ts` → entity = "tenant".
 * - Birden fazla varlık içeren şemalarda (örn. `branchAddressSchema`)
 *   entity, dosya adına göre seçilir.
 *
 * Yanlış pozitif azaltma:
 * - TypeScript anahtar kelimeleri (let, const, var, return, if, vb.)
 *   elenir.
 * - Node.js builtin modülleri elenir.
 * - Tek satırlık literal'ler (error kodu, permission kodu) elenir.
 * @author GOAL-112 (FAZ-11) alan sözlüğü ve yetki kataloğu
 * @since 2026-07-31
 * @security Tarayıcı yalnızca public alan adlarını okur. PII içerik
 *   taramaz; loglanmaz.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";

/**
 * Tarayıcının ürettiği alan referansı.
 */
export type FieldRef = {
  /** `<entity>.<field>` formatında tam alan kimliği. */
  fieldId: string;
  /** Referansın bulunduğu dosya. */
  file: string;
};

/**
 * Zod object şeması içindeki alan adı. Format:
 *   `slug: z.string()` veya `taxId: z.string().optional()` gibi.
 * Yalnızca `z.` ile başlayan değerleri yakalar (sıradan object literal
 * değerleri elenir).
 */

/**
 * TypeScript interface/type field. Format:
 *   `slug: string;` veya `id: string;`
 * Object tipindeki property'leri yakalar.
 */

/**
 * Schema değişken isminden entity çıkarımı.
 * Format: `<camelCase>Tenant<CamelCase>Schema` veya
 * `tenant<CamelCase>Schema` veya `tenantSchema`.
 * Öncelik: bilinen varlık adları sözlüğü.
 */
const SCHEMA_NAME_RE =
  /\b([a-zA-Z]+)(Tenant|Branch|User|Patient|Owner|Visit|Examination|Prescription|Product|Sale|Payment|Appointment|Vaccination|Test|Result|Order|Note|Event|Job|Sweep|Policy|Note|Link|Assignment|Transition|Group|Fingerprint|Cash|Refund|Stock|Movement|Count|Snapshot|File|Folder|Upload|Invitation|Share|Access|Token|Session|Setting|Plan|Rule|Alert|Block|Role|Permission|Adapter|Device|Export|Import|Account|Ledger|Entry|Invoice|Estimate)([A-Z][a-zA-Z]*)?Schema\b/g; // eslint-disable-line security/detect-unsafe-regex -- Sabit desen yalnızca TypeScript kaynak envanterinde kullanılır.

/**
 * Bilinen varlık adları — schema adından entity çıkarımı için.
 * Dosya adı sözlüğü ile birleşik kullanılır.
 *
 * Önemli: Bu sözlük yalnızca schema adının AÇIKÇA bir entity
 * içerdiği durumları kapsamalıdır. Genel İngilizce kelimeler
 * (test, group, type, vb.) dahil EDİLMEZ çünkü false positive
 * yaratır (örn. `testSchema` → entity "test" olur; ama schema
 * genelde başka bir entity için yazılmıştır).
 */
const KNOWN_ENTITIES = new Set([
  "tenant",
  "branch",
  "user",
  "patient",
  "owner",
  "appointment",
  "visit",
  "examination",
  "prescription",
  "product",
  "sale",
  "payment",
  "vaccination",
  "result",
  "order",
  "note",
  "event",
  "job",
  "sweep",
  "policy",
  "link",
  "assignment",
  "transition",
  "fingerprint",
  "cash",
  "refund",
  "stock",
  "movement",
  "count",
  "snapshot",
  "folder",
  "upload",
  "invitation",
  "share",
  "access",
  "token",
  "session",
  "setting",
  "plan",
  "rule",
  "alert",
  "block",
  "role",
  "adapter",
  "device",
  "account",
  "ledger",
  "entry",
  "invoice",
  "estimate",
]);

/**
 * Çıkarımda göz ardı edilen TS anahtar kelimeleri.
 */
const TS_KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "function",
  "class",
  "extends",
  "implements",
  "interface",
  "type",
  "enum",
  "export",
  "import",
  "from",
  "as",
  "async",
  "await",
  "yield",
  "new",
  "this",
  "super",
  "static",
  "public",
  "private",
  "protected",
  "readonly",
  "abstract",
  "void",
  "null",
  "undefined",
  "true",
  "false",
  "throw",
  "try",
  "catch",
  "finally",
  "of",
  "in",
  "instanceof",
  "typeof",
  "void",
  "delete",
  "with",
  "default",
]);

/**
 * Bir tanımlayıcının gerçek alan adı olma olasılığını kontrol eder.
 * @param name
 */
function isLikelyFieldName(name: string): boolean {
  if (!name) return false;
  if (TS_KEYWORDS.has(name)) return false;
  if (name.length < 2) return false;
  // Skaler primitive'ler (tek harfli veya yaygın reserved) elenmez;
  // genelde entity.field üretmek için uygun bir ad olmalı.
  if (/^[A-Z_]+$/.test(name)) return false; // SCREAMING_CASE
  return true;
}

/**
 * Schema değişken isminden entity adı çıkarır.
 * Örnek: `createTenantRequestSchema` → "tenant"
 *         `branchAddressSchema` → "branch"
 *         `tenantSchema` → "tenant".
 * @param schemaName
 * @param fileEntity
 */
function extractEntityFromSchemaName(
  schemaName: string,
  fileEntity: string | null,
): string | null {
  // Önce bilinen entity listesinde ara.
  const m = schemaName.match(SCHEMA_NAME_RE);
  if (m && m[0]) {
    const lower = m[0].toLowerCase();
    for (const e of KNOWN_ENTITIES) {
      if (lower.startsWith(e) || lower.includes(e)) {
        return e;
      }
    }
  }

  // Bilinen varlık adlarını substring olarak ara.
  const lower = schemaName.toLowerCase();
  for (const e of KNOWN_ENTITIES) {
    if (lower.startsWith(e) && lower.endsWith("schema")) {
      return e;
    }
  }

  // Varlık adı schema isminde yoksa dosya adından gelen entity'yi kullan.
  return fileEntity;
}

/**
 * Dosya yolundan entity adı çıkarır.
 * Örnek: `packages/contracts/src/tenant.ts` → "tenant"
 *         `apps/api/src/modules/owners/owners.service.ts` → "owner".
 * @param relPath
 */
function extractEntityFromFile(relPath: string): string | null {
  // Önce src/<entity>.ts desenini dene (contracts klasörü için).
  const contractsMatch = relPath.match(/contracts\/src\/([a-zA-Z_-]+)\.ts$/);
  if (contractsMatch && contractsMatch[1]) {
    const base = contractsMatch[1].toLowerCase().replace(/-/g, "_");
    // Tekil/plural sadeleştirme.
    return singularize(base);
  }

  // API modül dizini: modules/<entity>/<entity>.service.ts
  const moduleMatch = relPath.match(/modules\/([a-zA-Z_-]+)\//);
  if (moduleMatch && moduleMatch[1]) {
    return singularize(moduleMatch[1].toLowerCase().replace(/-/g, "_"));
  }

  return null;
}

/**
 * Çoğul isimleri tekil hale getirir. Basit heuristic: "s" veya "es"
 * sonekini kaldırır. Tam kapsamlı değildir; amaç sadece bilinen
 * modül klasörleridir (`owners` → `owner`, `patients` → `patient`).
 * @param s
 */
function singularize(s: string): string {
  if (s.endsWith("ies") && s.length > 3) {
    return s.slice(0, -3) + "y";
  }
  if (s.endsWith("ses") && s.length > 3) {
    return s.slice(0, -2);
  }
  if (s.endsWith("s") && !s.endsWith("ss") && s.length > 1) {
    return s.slice(0, -1);
  }
  return s;
}

/**
 * Tarayıcı ana fonksiyonu. Verilen kök dizin altındaki tüm
 * contracts ve API modülü TS dosyalarını tarar ve alan
 * referanslarını döner.
 * @param root
 */
export async function scanFields(root: string): Promise<FieldRef[]> {
  const files = await fg(
    ["packages/contracts/src/**/*.ts", "apps/api/src/modules/**/*.ts"],
    {
      cwd: root,
      onlyFiles: true,
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.test.ts",
        "**/*.spec.ts",
      ],
    },
  );

  const refs: FieldRef[] = [];
  const seen = new Set<string>();

  for (const rel of files) {
    const abs = path.join(root, rel);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Yol repo kökü ve glob sonucu ile sınırlıdır.
    const text = await readFile(abs, "utf8");
    const fileEntity = extractEntityFromFile(rel);

    // Schema adı + entity eşlemesini önceden topla. Her schema bloğu
    // için entity'yi belirler, ardından o bloktaki alan adlarını topla.
    const schemaBlocks = collectSchemaBlocks(text);
    for (const block of schemaBlocks) {
      const entity = extractEntityFromSchemaName(block.name, fileEntity);
      if (!entity) continue;
      for (const field of block.fields) {
        if (!isLikelyFieldName(field)) continue;
        const fieldId = `${entity}.${field}`;
        if (seen.has(fieldId)) continue;
        seen.add(fieldId);
        refs.push({ fieldId, file: rel });
      }
    }

    // Schema dışındaki TS interface field'larını da topla.
    // (örn. Response tipleri veya yardımcı interface'ler)
    const interfaceFields = collectInterfaceFields(text, fileEntity);
    for (const ref of interfaceFields) {
      if (!isLikelyFieldName(ref.fieldName)) continue;
      const fieldId = `${ref.entity}.${ref.fieldName}`;
      if (seen.has(fieldId)) continue;
      seen.add(fieldId);
      refs.push({ fieldId, file: rel });
    }
  }

  return refs;
}

/**
 * Zod object şeması bloklarını toplar. Her blok için adı ve alan
 * adlarını döner.
 * @param text
 */
function collectSchemaBlocks(
  text: string,
): Array<{ name: string; fields: string[] }> {
  const results: Array<{ name: string; fields: string[] }> = [];

  // Schema adı + z.object({ ... }) bloğu eşleştirmesi.
  // Çok satırlı olabilir; en yakın eşleşen küme parantezini bul.
  const schemaDeclRe =
    /(?:export\s+)?const\s+([a-zA-Z][a-zA-Z0-9_]*Schema)\s*=\s*z\.object\(\s*\{/g; // eslint-disable-line security/detect-unsafe-regex -- Sabit desen taranan kaynak metninden şema bildirimlerini çıkarır.
  let m: RegExpExecArray | null;
  while ((m = schemaDeclRe.exec(text)) !== null) {
    const name = m[1];
    if (!name) continue;
    const openIdx = m.index + m[0].length;
    const closeIdx = findMatchingClose(text, openIdx - 1, "{", "}");
    if (closeIdx < 0) continue;
    const body = text.slice(openIdx, closeIdx);
    const fields: string[] = [];
    const fieldRe = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(body)) !== null) {
      const f = fm[1];
      if (f) fields.push(f);
    }
    results.push({ name, fields });
  }

  return results;
}

/**
 * Basit küme parantez eşleştirmesi. Verilen açma indeksi için
 * eşleşen kapama indeksini döner. Bulunamazsa -1.
 * @param text
 * @param openIdx
 * @param openChar
 * @param closeChar
 */
function findMatchingClose(
  text: string,
  openIdx: number,
  openChar: string,
  closeChar: string,
): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    const c = text.charAt(i);
    if (c === openChar) depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * TS interface/type alanlarını toplar. Zod şeması olmayan yapılar
 * için fallback. Varlık adı dosyadan gelir.
 * @param text
 * @param fileEntity
 */
function collectInterfaceFields(
  text: string,
  fileEntity: string | null,
): Array<{ entity: string; fieldName: string }> {
  if (!fileEntity) return [];
  const results: Array<{ entity: string; fieldName: string }> = [];

  // interface/type bloğu: `{`, `= {`, veya `extends ... {` ile
  // başlayabilir. Açma karakteri pozisyonu en sonda olmalı.
  const interfaceRe =
    /(?:export\s+)?(?:interface|type)\s+[A-Z][a-zA-Z0-9_]*[^{=]*\{/g; // eslint-disable-line security/detect-unsafe-regex -- Sabit desen taranan kaynak metnindeki type/interface blokları içindir.
  let m: RegExpExecArray | null;
  while ((m = interfaceRe.exec(text)) !== null) {
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = findMatchingClose(text, openIdx, "{", "}");
    if (closeIdx < 0) continue;
    const body = text.slice(openIdx + 1, closeIdx);
    const fieldRe = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\??\s*:/gm;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(body)) !== null) {
      const f = fm[1];
      if (f) results.push({ entity: fileEntity, fieldName: f });
    }
  }

  return results;
}
