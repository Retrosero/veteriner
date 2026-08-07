#!/usr/bin/env node
/**
 * @file Orphan field migration dry-run.
 * @module tools/docs-check/scripts/migrate-orphan-fields
 * @description GOAL-128 Faz 1 — Kategori A orphan field'larini
 *   audit_event/operation_note/journal_entry/job_run/kasa gibi dogru
 *   entity'lere tasimak icin dry-run plan ureteci.
 *
 *   Strateji:
 *   1. `pnpm docs:check` ciktisindaki orphan field listesini oku.
 *   2. `orphan-field-mapping.json` kural tablosunu uygula.
 *   3. Kategori A (yanlis entity): hedef entity'ye tasi.
 *   4. Kategori B (dynamic reflection): fields.yaml'a dokunma,
 *      scanner pattern'i eklemek icin raporla.
 *   5. Kategori C (kullanilmiyor): FAZ-12+ migration ile kaldir.
 *   6. Sonuc: JSON + Markdown rapor + yeni orphan sayisi.
 *
 *   Dry-run modunda fields.yaml'a YAZMAZ; sadece plan uretir.
 *   --apply bayragiyla yazma moduna gecilebilir (ileride).
 *
 *   Kullanim:
 *     pnpm docs:check 2>&1 | node tools/docs-check/scripts/migrate-orphan-fields.mjs
 *     node tools/docs-check/scripts/migrate-orphan-fields.mjs --out-json=./orphan-migration.json
 *     node tools/docs-check/scripts/migrate-orphan-fields.mjs --out-md=./orphan-migration.md
 *
 * @author GOAL-128 (FAZ-12) orphan field fix
 * @since 2026-08-07
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const mappingFile = resolve(here, "orphan-field-mapping.json");
const targetJson = process.argv
  .find((a) => a.startsWith("--out-json="))
  ?.split("=")[1];
const targetMd = process.argv
  .find((a) => a.startsWith("--out-md="))
  ?.split("=")[1];
const fromFile = process.argv
  .find((a) => a.startsWith("--from-file="))
  ?.split("=")[1];

/**
 * `pnpm docs:check` ciktisindaki orphan field satirlarini parse et.
 * Format: `field:entity.fieldName — Alan sozlugunde tanimli ancak
 * kodda referansi yok (orphan): docs/fields/fields.yaml`
 */
function parseOrphanList(stdout) {
  const lines = stdout.split("\n");
  const orphans = [];
  // Sadece "orphan" kelimesi iceren satirlar orphan'dur; "field:" pattern'i
  // baska baglamlarda da gecabilir (kullanilan alanlar icin uyari disi).
  const orphanRe = /field:(\w+)\.(\w+)/;
  for (const line of lines) {
    if (!line.includes("orphan")) continue;
    const m = line.match(orphanRe);
    if (m) {
      orphans.push({ entity: m[1], field: m[2], fieldId: `${m[1]}.${m[2]}` });
    }
  }
  return orphans;
}

/**
 * pnpm docs:check ANSI renkli cikti uretebilir; temizle.
 */
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

/**
 * Mapping tablosunu uygula; her orphan field icin hedef entity hesapla.
 */
function classifyOrphans(orphans, mapping) {
  const categories = { A: [], B: [], C: [], D: [], unmapped: [] };
  const entityCount = new Map();

  for (const o of orphans) {
    entityCount.set(o.entity, (entityCount.get(o.entity) || 0) + 1);

    // Kategori A: yanlis entity
    if (mapping.mappings[o.entity]) {
      categories.A.push({
        ...o,
        targetEntity: mapping.mappings[o.entity],
        targetFieldId: `${mapping.mappings[o.entity]}.${o.field}`,
        action: "migrate",
      });
      continue;
    }

    // Kategori B: dynamic reflection (kodda kullanilmiyor ama runtime access)
    if (mapping.categoryB?.entities?.includes(o.entity)) {
      categories.B.push({ ...o, action: "scanner-pattern-needed" });
      continue;
    }

    // Kategori C: kullanilmiyor (FAZ-12+ migration)
    if (mapping.keepAsIs?.[o.entity]) {
      categories.C.push({
        ...o,
        action: "review-remove-or-keep",
        note: "Schema'da var ama service'te kullanilmiyor. FAZ-12+ migration ile kaldir veya dynamic reflection bekle.",
      });
      continue;
    }

    // Kategori D: tenant istatistikleri (runtime computed)
    if (
      o.entity === "tenant" &&
      /count|usage|errorCount|storage/.test(o.field)
    ) {
      categories.D.push({ ...o, action: "tenant-stats-migration" });
      continue;
    }

    categories.unmapped.push({
      ...o,
      action: "manual-review",
    });
  }

  return { categories, entityCount };
}

/**
 * Markdown rapor ureteci.
 */
function renderMarkdown({ orphans, classification, projected }) {
  const lines = [];
  lines.push("# Orphan Field Migration Plan (GOAL-128)");
  lines.push("");
  lines.push(`**Toplam orphan field:** ${orphans.length}`);
  lines.push(
    `**Hedef:** 0 orphan (Kategori A tasima + Kategori B scanner + Kategori C temizleme)`,
  );
  lines.push("");
  lines.push("## Kategori Dagilimi");
  lines.push("");
  lines.push("| Kategori | Aciklama | Sayi | Etki |");
  lines.push("| -------- | -------- | ---- | ---- |");
  lines.push(
    `| A | Yanlis entity (audit_event, job_run, kasa, ...) | ${classification.categories.A.length} | Migration ile 0'a iner |`,
  );
  lines.push(
    `| B | Dynamic reflection (runtime access) | ${classification.categories.B.length} | Scanner pattern ile 0'a iner |`,
  );
  lines.push(
    `| C | Kullanilmiyor (ownership_history, stock_alert) | ${classification.categories.C.length} | FAZ-12+ migration ile kaldirilir |`,
  );
  lines.push(
    `| D | Tenant istatistikleri (runtime computed) | ${classification.categories.D.length} | tenant_stats entity'si ile migrate |`,
  );
  lines.push(
    `| Unmapped | Manuel review gerekli | ${classification.categories.unmapped.length} | TBD |`,
  );
  lines.push("");

  lines.push("## Entity Bazli Dagilim (orphan sayisina gore)");
  lines.push("");
  const sorted = [...classification.entityCount.entries()].sort(
    (a, b) => b[1] - a[1],
  );
  for (const [entity, count] of sorted.slice(0, 20)) {
    lines.push(`- \`${entity}\`: ${count} orphan`);
  }
  lines.push("");

  lines.push("## Kategori A: Migration Listesi");
  lines.push("");
  const byTarget = new Map();
  for (const a of classification.categories.A) {
    if (!byTarget.has(a.targetEntity)) byTarget.set(a.targetEntity, []);
    byTarget.get(a.targetEntity).push(a);
  }
  for (const [target, items] of [...byTarget.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    lines.push(`### → ${target} (${items.length} alan)`);
    lines.push("");
    const samples = items.slice(0, 5);
    for (const s of samples) {
      lines.push(`- \`${s.fieldId}\` → \`${s.targetFieldId}\``);
    }
    if (items.length > 5) lines.push(`- ... ve ${items.length - 5} alan daha`);
    lines.push("");
  }

  lines.push("## Kategori B: Scanner Pattern Gerekli");
  lines.push("");
  lines.push(
    "Bu alanlar runtime'da kullanilir ama scanner tarafindan yakalanmiyor:",
  );
  lines.push("- `prisma.${entity}.findMany({ select: { ... } })` pattern'leri");
  lines.push("- `JSON.stringify(obj)` icindeki property access");
  lines.push("- Dinamik property access (bracket notation)");
  lines.push("");
  for (const b of classification.categories.B.slice(0, 15)) {
    lines.push(`- \`${b.fieldId}\``);
  }
  if (classification.categories.B.length > 15) {
    lines.push(`- ... ve ${classification.categories.B.length - 15} alan daha`);
  }
  lines.push("");

  lines.push("## Projeksiyon");
  lines.push("");
  lines.push("| Adim | Orphan sayisi |");
  lines.push("| ---- | ------------- |");
  lines.push(`| Baslangic | ${orphans.length} |`);
  lines.push(
    `| Kategori A migration (${classification.categories.A.length} alan tasindi) | ${projected.afterA} |`,
  );
  lines.push(
    `| Kategori B scanner pattern (${classification.categories.B.length} alan tespit) | ${projected.afterB} |`,
  );
  lines.push(
    `| Kategori C cleanup (${classification.categories.C.length} alan kaldirildi) | ${projected.afterC} |`,
  );
  lines.push(
    `| Kategori D + Unmapped (${classification.categories.D + classification.categories.unmapped} alan) | ${projected.afterD} |`,
  );
  lines.push("");

  return lines.join("\n");
}

// 1) Mapping'i oku
const mapping = JSON.parse(await readFile(mappingFile, "utf8"));

// 2) Orphan field listesini al. Iki yol:
//    a) --from-file: onceden kaydedilmis pnpm docs:check ciktisindan oku.
//    b) pnpm docs:check --force (subprocess + ANSI temizleme).
let orphans = [];
if (fromFile) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- CLI arg'dan gelen dosya yolu (kullanici kontrollu).
  const fileText = await readFile(resolve(repo, fromFile), "utf8");
  orphans = parseOrphanList(stripAnsi(fileText));
} else {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Sabit build tool adi.
  const docsCheck = spawnSync("pnpm", ["docs:check", "--force"], {
    cwd: repo,
    encoding: "utf8",
    shell: true,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  const docsStdout = stripAnsi(
    (docsCheck.stdout || "") + (docsCheck.stderr || ""),
  );
  orphans = parseOrphanList(docsStdout);
}

// 3) Sinifla
const classification = classifyOrphans(orphans, mapping);

// 4) Projeksiyon
const projected = {
  afterA: orphans.length - classification.categories.A.length,
  afterB:
    orphans.length -
    classification.categories.A.length -
    classification.categories.B.length,
  afterC:
    orphans.length -
    classification.categories.A.length -
    classification.categories.B.length -
    classification.categories.C.length,
  afterD:
    classification.categories.D.length +
    classification.categories.unmapped.length,
};

// 5) Sonuc
const result = {
  generatedAt: new Date().toISOString(),
  totalOrphans: orphans.length,
  categoryCounts: {
    A: classification.categories.A.length,
    B: classification.categories.B.length,
    C: classification.categories.C.length,
    D: classification.categories.D.length,
    unmapped: classification.categories.unmapped.length,
  },
  categoryA: classification.categories.A,
  categoryB: classification.categories.B,
  categoryC: classification.categories.C,
  categoryD: classification.categories.D,
  unmapped: classification.categories.unmapped,
  entityDistribution: [...classification.entityCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([entity, count]) => ({ entity, count })),
  projected,
};

console.log(`[migrate-orphan-fields] Dry-run ozeti:`);
console.log(`  Toplam orphan: ${orphans.length}`);
console.log(
  `  Kategori A (yanlis entity): ${classification.categories.A.length} — migration ile 0'a iner`,
);
console.log(
  `  Kategori B (dynamic reflection): ${classification.categories.B.length} — scanner pattern gerekli`,
);
console.log(
  `  Kategori C (kullanilmiyor): ${classification.categories.C.length} — FAZ-12+ migration`,
);
console.log(
  `  Kategori D (tenant stats): ${classification.categories.D.length}`,
);
console.log(
  `  Unmapped (manuel review): ${classification.categories.unmapped.length}`,
);
console.log(
  `  Projeksiyon: A → ${projected.afterA} | A+B → ${projected.afterB} | A+B+C → ${projected.afterC}`,
);

if (targetJson) {
  await writeFile(
    resolve(repo, targetJson),
    JSON.stringify(result, null, 2),
    "utf8",
  );
  console.log(`  [OK] JSON yazildi: ${targetJson}`);
}

if (targetMd) {
  const md = renderMarkdown({ orphans, classification, projected });
  await writeFile(resolve(repo, targetMd), md, "utf8");
  console.log(`  [OK] Markdown yazildi: ${targetMd}`);
}

if (!targetJson && !targetMd) {
  console.log(
    "\nJSON: node tools/docs-check/scripts/migrate-orphan-fields.mjs --out-json=./orphan-migration.json",
  );
  console.log(
    "MD:   node tools/docs-check/scripts/migrate-orphan-fields.mjs --out-md=./orphan-migration.md",
  );
}

// Test icin export (CLI modunda zararsiz; ESM export ifadeleri yan etki yaratmaz)
export { parseOrphanList, classifyOrphans, renderMarkdown };
