#!/usr/bin/env node
/**
 * @file docs:check field catalog gap-filler.
 * @module tools/docs-check/scripts/add-missing-fields
 * @description Eklenecek alanları tanımlar ve docs/fields/fields.yaml
 *   içine uygun entity blokları altına ekler. Mevcut YAML yapısı ve
 *   alan biçimi korunur; idempotent çalışır.
 * @author GOAL-QA-002 devamı
 * @since 2026-08-06
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const target = resolve(repo, "docs/fields/fields.yaml");

/** Entity -> [{ name, type, required, tr, en }] */
const MISSING = {
  lab_order: [
    [
      "tenantId",
      "uuid",
      true,
      "Lab order tenant ID FK.",
      "Lab order tenant ID FK reference.",
    ],
    [
      "labTestId",
      "uuid",
      true,
      "Lab order katalog test ID.",
      "Lab order catalog test ID.",
    ],
    [
      "labTestCode",
      "string",
      false,
      "Lab order test kodu (snapshot).",
      "Lab order test code (snapshot).",
    ],
    [
      "labTestName",
      "string",
      false,
      "Lab order test adı (snapshot).",
      "Lab order test name (snapshot).",
    ],
    [
      "sampleType",
      "string",
      false,
      "Lab order örnek tipi.",
      "Lab order sample type.",
    ],
    [
      "unit",
      "string",
      false,
      "Lab order sonuç birimi.",
      "Lab order result unit.",
    ],
    [
      "referenceRange",
      "string",
      false,
      "Lab order referans aralığı.",
      "Lab order reference range.",
    ],
    [
      "price",
      "decimal",
      false,
      "Lab order fiyat (snapshot).",
      "Lab order price (snapshot).",
    ],
    [
      "priority",
      "enum",
      false,
      "Lab order öncelik seviyesi.",
      "Lab order priority level.",
    ],
    [
      "createdBy",
      "uuid",
      true,
      "Lab order oluşturan kullanıcı ID.",
      "Lab order creator user ID.",
    ],
  ],
  lab_result: [
    [
      "tenantId",
      "uuid",
      true,
      "Lab result tenant ID FK.",
      "Lab result tenant ID FK reference.",
    ],
    [
      "labOrderId",
      "uuid",
      true,
      "Lab result bağlı olduğu lab order ID.",
      "Lab result parent lab order ID.",
    ],
    [
      "revision",
      "number",
      false,
      "Lab result düzeltme revizyon numarası.",
      "Lab result amendment revision number.",
    ],
    [
      "unit",
      "string",
      false,
      "Lab result ölçüm birimi.",
      "Lab result measurement unit.",
    ],
    [
      "referenceRange",
      "string",
      false,
      "Lab result referans aralığı.",
      "Lab result reference range.",
    ],
    [
      "enteredBy",
      "uuid",
      true,
      "Lab result giren kullanıcı ID.",
      "Lab result entered-by user ID.",
    ],
    [
      "amendsResultId",
      "uuid",
      false,
      "Düzeltilen önceki lab result ID.",
      "Amended prior lab result ID.",
    ],
  ],
  imaging_order: [
    [
      "tenantId",
      "uuid",
      true,
      "Imaging order tenant ID FK.",
      "Imaging order tenant ID FK reference.",
    ],
    [
      "imagingTestId",
      "uuid",
      true,
      "Imaging order katalog test ID.",
      "Imaging order catalog test ID.",
    ],
    [
      "imagingTestCode",
      "string",
      false,
      "Imaging order test kodu (snapshot).",
      "Imaging order test code (snapshot).",
    ],
    [
      "imagingTestName",
      "string",
      false,
      "Imaging order test adı (snapshot).",
      "Imaging order test name (snapshot).",
    ],
    [
      "priority",
      "enum",
      false,
      "Imaging order öncelik seviyesi.",
      "Imaging order priority level.",
    ],
    [
      "createdBy",
      "uuid",
      true,
      "Imaging order oluşturan kullanıcı ID.",
      "Imaging order creator user ID.",
    ],
  ],
};

function buildField(entity, name, ftype, required, tr, en) {
  const req = required ? "true" : "false";
  return [
    `      - id: ${entity}.${name}`,
    `        name: ${name}`,
    `        type: ${ftype}`,
    `        required: ${req}`,
    `        unique: false`,
    `        pii: false`,
    `        description_tr: "${tr}"`,
    `        description_en: "${en}"`,
    `        validation: "auto-generated; refine in follow-up"`,
    `        version: "1.0.0"`,
    ``,
  ].join("\n");
}

function insertFields(text, entity, fields) {
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === `- id: ${entity}`) {
      // Bulundu: 'fields:' satırını bul
      let j = i + 1;
      let fieldsIdx = -1;
      while (j < lines.length) {
        const inner = lines[j];
        if (inner.trim() === "fields:") {
          fieldsIdx = j;
          break;
        }
        if (/^  - id: /.test(inner) && j !== i + 1) break;
        j++;
      }
      if (fieldsIdx < 0) {
        i++;
        continue;
      }
      // Mevcut alanları topla
      const existing = new Set();
      let lastFieldLine = fieldsIdx;
      let k = fieldsIdx + 1;
      while (k < lines.length) {
        const ln = lines[k];
        if (ln.startsWith("      - id: ")) {
          lastFieldLine = k;
          const raw = ln.trim().slice("- id: ".length);
          if (raw.startsWith(`${entity}.`)) {
            existing.add(raw.slice(entity.length + 1));
          }
        } else if (
          /^  - id: /.test(ln) ||
          (/^    - id: /.test(ln) && !ln.startsWith("      - id: "))
        ) {
          break;
        }
        k++;
      }
      const newBlocks = [];
      for (const [fname, ftype, req, tr, en] of fields) {
        if (existing.has(fname)) continue;
        newBlocks.push(buildField(entity, fname, ftype, req, tr, en));
      }
      if (newBlocks.length > 0) {
        lines.splice(lastFieldLine + 1, 0, ...newBlocks);
      }
      i = lastFieldLine + 1 + newBlocks.length + 1;
      continue;
    }
    i++;
  }
  return lines.join("\n");
}

const text = await readFile(target, "utf8");
const original = text;
let updated = text;
for (const [entity, fields] of Object.entries(MISSING)) {
  updated = insertFields(updated, entity, fields);
}
if (updated === original) {
  console.log("[BİLGİ] Eksik alan yok; YAML değişmedi.");
} else {
  await writeFile(target, updated, "utf8");
  const total = Object.values(MISSING).reduce((a, b) => a + b.length, 0);
  console.log(`[OK] ${total} alan docs/fields/fields.yaml'a eklendi.`);
}
