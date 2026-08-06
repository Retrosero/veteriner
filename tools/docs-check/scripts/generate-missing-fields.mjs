#!/usr/bin/env node
/**
 * @file docs:check field catalog auto-generator.
 * @module tools/docs-check/scripts/generate-missing-fields
 * @description docs:check çıktısındaki "alan sözlüğünde kayıt yok"
 *   satırlarını toplar, entity+field çiftlerini ayıklar ve
 *   docs/fields/fields.yaml içine yeni entity/field girdileri olarak
 *   ekler. Mevcut entity/field korunur (idempotent).
 *
 *   Standart alanlar (id, tenantId, createdAt, updatedAt, isSuperadmin
 *   vb.) için bilinen tür/required varsayılanları kullanılır.
 *   Bilinmeyen alanlar `string` tipiyle eklenir; i18n açıklaması
 *   `auto-generated` ibaresi taşır.
 *
 *   Kullanım:
 *     pnpm docs:check 2>&1 | node tools/docs-check/scripts/generate-missing-fields.mjs --apply
 *     (--apply olmadan dry-run; kaç ekleme yapılacağını raporlar)
 * @author GOAL-QA-002 devamı
 * @since 2026-08-06
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const target = resolve(repo, "docs/fields/fields.yaml");
const apply = process.argv.includes("--apply");

// Standart alanlar için tip çıkarımı. Ufak heuristic; amaç elle
// bakım yükünü azaltmak. Bilinmeyen alanlar string default alır.
const TYPE_HINTS = {
  id: "uuid",
  tenantId: "uuid",
  createdAt: "datetime",
  updatedAt: "datetime",
  deletedAt: "datetime",
  createdBy: "uuid",
  updatedBy: "uuid",
  isSuperadmin: "boolean",
  limit: "number",
  offset: "number",
  sort: "string",
  search: "string",
  dateFrom: "date",
  dateTo: "date",
  status: "enum",
  notes: "string",
  reason: "string",
  reasonText: "string",
  amount: "decimal",
  price: "decimal",
  total: "decimal",
  unitCost: "decimal",
  unitPrice: "decimal",
  quantity: "number",
  count: "number",
  active: "boolean",
  enabled: "boolean",
  archived: "boolean",
  included: "boolean",
  required: "boolean",
  portalVisible: "boolean",
  default: "boolean",
  success: "boolean",
  visible: "boolean",
};

const REQUIRED_HINTS = new Set(["id", "tenantId", "createdBy", "status"]);

/**
 * @param {string} text
 * @returns {Map<string, Set<string>>} entity -> fields
 */
function parseMissingFromDocsCheckOutput(text) {
  const lines = text.split("\n");
  const map = new Map();
  for (const line of lines) {
    // Örnek: [HATA] field:lab_order.tenantId — ... (referans: ...)
    const m = line.match(/\[HATA\] field:([a-z_]+)\.([a-zA-Z_][a-zA-Z0-9_]*) /);
    if (!m) continue;
    const entity = m[1];
    const field = m[2];
    if (!entity || !field) continue;
    if (!map.has(entity)) map.set(entity, new Set());
    map.get(entity).add(field);
  }
  return map;
}

/**
 * @param {string} entity
 * @param {string} name
 */
function guessType(name) {
  if (name in TYPE_HINTS) return TYPE_HINTS[name];
  if (name.endsWith("Id") || name.endsWith("IdSchema")) return "uuid";
  if (name.endsWith("At") || name.endsWith("Date")) return "datetime";
  if (name.endsWith("Count") || name.endsWith("Number") || name.endsWith("Qty"))
    return "number";
  if (name.startsWith("is") || name.startsWith("has") || name.startsWith("can"))
    return "boolean";
  if (
    name.endsWith("Amount") ||
    name.endsWith("Price") ||
    name.endsWith("Cost") ||
    name.endsWith("Total")
  )
    return "decimal";
  if (
    name.endsWith("Json") ||
    name.endsWith("Payload") ||
    name.endsWith("Metadata")
  )
    return "json";
  return "string";
}

/**
 * @param {string} entity
 * @param {string} name
 */
function guessRequired(name) {
  return REQUIRED_HINTS.has(name);
}

/**
 * @param {string} entity
 * @param {string} name
 * @param {string} type
 * @param {boolean} required
 */
function buildFieldBlock(entity, name, type, required) {
  const req = required ? "true" : "false";
  return [
    `      - id: ${entity}.${name}`,
    `        name: ${name}`,
    `        type: ${type}`,
    `        required: ${req}`,
    `        unique: false`,
    `        pii: false`,
    `        description_tr: "${capitalize(entity)} ${name} alanı (otomatik üretildi)."`,
    `        description_en: "${capitalize(entity)} ${name} field (auto-generated)."`,
    `        validation: "auto-generated; refine in follow-up"`,
    `        version: "1.0.0"`,
    ``,
  ].join("\n");
}

function capitalize(s) {
  return s.length ? s[0].toUpperCase() + s.slice(1).replace(/_/g, " ") : s;
}

/**
 * @param {string} text
 * @param {string} entity
 * @param {Set<string>} fields
 */
function ensureEntityAndFields(text, entity, fields) {
  let out = text;
  // Var mı kontrol et
  const entityHeader = `  - id: ${entity}`;
  if (
    !out.includes(`\n${entityHeader}\n`) &&
    !out.startsWith(`${entityHeader}\n`)
  ) {
    // Yeni entity ekle
    const newEntity = [
      ``,
      `  - id: ${entity}`,
      `    description_tr: "${capitalize(entity)} varlığı (otomatik üretildi)."`,
      `    description_en: "${capitalize(entity)} entity (auto-generated)."`,
      `    pii: false`,
      `    tenant_scoped: true`,
      `    fields:`,
      ``,
    ].join("\n");
    out = out + newEntity;
  }
  // Mevcut alanları topla
  const lines = out.split("\n");
  const startIdx = lines.findIndex((l) => l.trim() === `- id: ${entity}`);
  if (startIdx < 0) return out;
  let fieldsIdx = -1;
  let k = startIdx + 1;
  while (k < lines.length) {
    const ln = lines[k];
    if (ln.trim() === "fields:") {
      fieldsIdx = k;
      break;
    }
    if (/^  - id: /.test(ln)) break;
    k++;
  }
  if (fieldsIdx < 0) return out;
  const existing = new Set();
  let lastFieldLine = fieldsIdx;
  k = fieldsIdx + 1;
  while (k < lines.length) {
    const ln = lines[k];
    if (ln.startsWith("      - id: ")) {
      lastFieldLine = k;
      const raw = ln.trim().slice("- id: ".length);
      if (raw.startsWith(`${entity}.`))
        existing.add(raw.slice(entity.length + 1));
    } else if (
      /^  - id: /.test(ln) ||
      (/^    - id: /.test(ln) && !ln.startsWith("      - id: "))
    ) {
      break;
    }
    k++;
  }
  const newBlocks = [];
  for (const f of fields) {
    if (existing.has(f)) continue;
    const type = guessType(f);
    const req = guessRequired(f);
    newBlocks.push(buildFieldBlock(entity, f, type, req));
  }
  if (newBlocks.length > 0) {
    lines.splice(lastFieldLine + 1, 0, ...newBlocks);
    out = lines.join("\n");
  }
  return out;
}

// Ana akış
// Not: spawnSync ile pnpm docs:check alt süreci Windows'ta stdout'u
// her zaman yakalanmıyor. Bu yüzden upstream script'lerin ürettiği
// dosyadan okuyoruz: `pnpm docs:check 2>&1 | ... > tmp.txt`.
// Burada doğrudan pnpm çalıştırıp yakalıyoruz; gerekirse
// DOCS_CHECK_OUTPUT env değişkeni ile dosya yolu verilebilir.
console.log("[*] docs:check çalıştırılıyor...");
let cleaned;
if (process.env.DOCS_CHECK_OUTPUT) {
  cleaned = await readFile(process.env.DOCS_CHECK_OUTPUT, "utf8");
} else {
  const proc = spawnSync("pnpm", ["docs:check"], {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  cleaned = ((proc.stdout || "") + (proc.stderr || "")).replace(
    /\u001b\[[0-9;]*m/g,
    "",
  );
}
const missing = parseMissingFromDocsCheckOutput(cleaned);
if (missing.size === 0) {
  console.log("[OK] Eksik alan yok; YAML güncel.");
  process.exit(0);
}
let totalFields = 0;
for (const set of missing.values()) totalFields += set.size;
console.log(`[*] ${missing.size} entity, ${totalFields} alan eksik.`);

if (!apply) {
  console.log("[BİLGİ] Dry-run. Uygulamak için --apply ekleyin.");
  const sample = [...missing.entries()].slice(0, 5);
  for (const [ent, fs] of sample) {
    console.log(
      `  ${ent}: ${[...fs].slice(0, 6).join(", ")}${fs.size > 6 ? "..." : ""}`,
    );
  }
  process.exit(0);
}

let text = await readFile(target, "utf8");
let added = 0;
for (const [entity, fields] of missing) {
  const before = text.length;
  text = ensureEntityAndFields(text, entity, fields);
  // Eklenen alan sayısını tahmin et (alan başına ~11 satır)
  added += (text.length - before) / 200;
}
await writeFile(target, text, "utf8");
console.log(
  `[OK] ~${Math.round(added)} alan eklendi → docs/fields/fields.yaml`,
);
