/**
 * @file AI chunk katalog onarım/migrasyon aracı.
 * @module @vetniva/rag-chunk-producer/repair-ai-chunks
 * @description Eski katalogdaki CP-1252 em-dash baytını geçerli UTF-8'e
 * çevirir ve metadata ile listeyi tek kökte `chunks` alanında birleştirir.
 * İşlem idempotenttir; çıktıyı js-yaml ile tekrar parse ederek doğrular.
 * @security Hedef yol sabittir ve yalnızca repository içindeki katalogdur.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const catalogPath = path.resolve(dirname, "../../../docs/ai/AI_CHUNKS.yaml");
const utf8 = new TextDecoder("utf-8", { fatal: true });
const windows1254 = new TextDecoder("windows-1254", { fatal: true });

/**
 * Eski kataloğun tek başına kalan CP-1252 em-dash baytını UTF-8'e dönüştürür.
 * @param {Uint8Array} bytes Kaynak dosyanın ham baytları.
 * @returns {Uint8Array} Geçerli UTF-8 olarak doğrulanacak bayt dizisi.
 */
function repairLegacyDash(bytes) {
  try {
    utf8.decode(bytes);
    return bytes;
  } catch {
    const windows1252 = new Map([
      [0x80, "€"],
      [0x82, "‚"],
      [0x83, "ƒ"],
      [0x84, "„"],
      [0x85, "…"],
      [0x86, "†"],
      [0x87, "‡"],
      [0x88, "ˆ"],
      [0x89, "‰"],
      [0x8a, "Š"],
      [0x8b, "‹"],
      [0x8c, "Œ"],
      [0x8e, "Ž"],
      [0x91, "‘"],
      [0x92, "’"],
      [0x93, "“"],
      [0x94, "”"],
      [0x95, "•"],
      [0x96, "–"],
      [0x97, "—"],
      [0x98, "˜"],
      [0x99, "™"],
      [0x9a, "š"],
      [0x9b, "›"],
      [0x9c, "œ"],
      [0x9e, "ž"],
      [0x9f, "Ÿ"],
    ]);
    const output = [];
    for (let index = 0; index < bytes.length; index += 1) {
      const byte = bytes[index];
      if (byte === undefined) continue;
      const width =
        byte < 0x80
          ? 1
          : byte >= 0xc2 && byte <= 0xdf
            ? 2
            : byte >= 0xe0 && byte <= 0xef
              ? 3
              : byte >= 0xf0 && byte <= 0xf4
                ? 4
                : 1;
      const sequence = bytes.subarray(index, index + width);
      try {
        utf8.decode(sequence);
        output.push(utf8.decode(sequence));
        index += width - 1;
      } catch {
        const replacement =
          windows1252.get(byte) ?? windows1254.decode(Uint8Array.of(byte));
        output.push(replacement);
      }
    }
    const repaired = new TextEncoder().encode(output.join(""));
    utf8.decode(repaired);
    return repaired;
  }
}

/**
 * Metadata ve kök listeyi standart YAML mapping'ine dönüştürür.
 * @param {string} text UTF-8 katalog metni.
 * @returns {string} `chunks` kök anahtarını kullanan katalog metni.
 */
function migrateToChunksMapping(text) {
  if (/^chunks:\s*$/m.test(text)) return text;
  const lines = text.split(/\r?\n/);
  const firstChunk = lines.findIndex((line) => /^- chunk_id:\s+/.test(line));
  if (firstChunk < 0) {
    throw new Error("Katalogta kök `- chunk_id:` listesi bulunamadı.");
  }
  const metadata = lines.slice(0, firstChunk);
  const chunks = lines
    .slice(firstChunk)
    .map((line) => (line.length === 0 ? line : `  ${line}`));
  return [...metadata, "chunks:", ...chunks].join("\n");
}

/** Katalog şemasının minimum bütünlüğünü doğrular. */
function validateCatalog(text) {
  const parsed = yaml.load(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Katalog kökünde mapping bekleniyor.");
  }
  const chunks = parsed.chunks;
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error("Katalogta boş olmayan `chunks` dizisi bekleniyor.");
  }
  if (!chunks.every((chunk) => chunk && typeof chunk.chunk_id === "string")) {
    throw new Error("Her chunk için `chunk_id` zorunludur.");
  }
}

const write = process.argv.includes("--write");
const bytes = await readFile(catalogPath);
const source = utf8.decode(repairLegacyDash(bytes));
const migrated = migrateToChunksMapping(source);
validateCatalog(migrated);

if (write) {
  await writeFile(catalogPath, `${migrated.trimEnd()}\n`, "utf8");
  process.stdout.write(
    "AI_CHUNKS.yaml geçerli UTF-8 ve chunks mapping şemasına taşındı.\n",
  );
} else {
  process.stdout.write(
    "AI_CHUNKS.yaml onarım öncesi doğrulamadan geçti; --write ile uygula.\n",
  );
}
