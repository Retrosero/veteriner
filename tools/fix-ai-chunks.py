#!/usr/bin/env python3
"""
GOAL-118 pilot temizliği — AI_CHUNKS.yaml format düzeltmesi.

Mevcut dosya mixed format: üst düzey metadata + doğrudan chunks listesi.
Bu format Prettier ve standart YAML parser'lar tarafından reddedilir.
Dosyayı proper YAML formatına çevirir: üst düzey `chunks:` anahtarı altında liste.

Kullanım:
    python tools/fix-ai-chunks.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "docs" / "ai" / "AI_CHUNKS.yaml"


def main() -> int:
    if not TARGET.exists():
        print(f"HATA: {TARGET} bulunamadı.")
        return 1
    # Dosya Windows-1254 (Türkçe) encoding'de. UTF-8'e dönüştür.
    raw = TARGET.read_bytes()
    try:
        text = raw.decode("cp1254")
    except UnicodeDecodeError:
        text = raw.decode("utf-8", errors="replace")
    lines = text.split("\n")

    # Header (yorum + üst düzey metadata) ve chunks listesi olarak ikiye ayır.
    first_chunk_idx = None
    for i, line in enumerate(lines):
        if re.match(r"^-\s+chunk_id:", line):
            first_chunk_idx = i
            break
    if first_chunk_idx is None:
        print("chunks listesi bulunamadı.")
        return 0

    # Header: ilk chunk'a kadar olan kısım (yorum + metadata).
    header = "\n".join(lines[:first_chunk_idx]).rstrip()
    # Header'ı normalize et: üst düzey metadata'nın chunks: anahtarı
    # olmadığından emin ol.
    if re.search(r"^chunks:\s*$", header, re.M):
        # Zaten chunks: var; dosya doğru formattadır.
        print("Dosya zaten doğru formatta.")
        return 0
    # Chunks listesi: her satırın başına 2-boşluk indent ekle
    # (chunks: anahtarının altına yerleşmesi için). Mevcut iç
    # indent (field altına 2-space) 4-space'e çıkmalı. Multi-line
    # block (content: |) içindeki satırlar orijinalde `content:`
    # ile aynı seviyede; yeni konumda `content:` 4-space olduğu için
    # block içeriği 6-space olmalı.
    chunk_lines = lines[first_chunk_idx:]
    in_block_scalar = False
    indented = []
    for line in chunk_lines:
        if line.startswith("-"):
            in_block_scalar = False
            indented.append("  " + line)
        elif line == "":
            in_block_scalar = False
            indented.append(line)
        elif line.startswith("  ") and not line.startswith("    "):
            # Yeni field satırı (örn. `type: glossary` veya
            # `content: |`) — block scalar modundan çık.
            in_block_scalar = False
            indented.append("    " + line[2:])
        elif in_block_scalar:
            # Block scalar içindeki satır; 2-space daha indent.
            # Orijinal 2-space, 4-space olur.
            indented.append("    " + line[2:])
        else:
            indented.append(line)
        # `content: |` veya `content: >` ile başlayan field'tan
        # sonra block scalar moduna geç.
        stripped = line.strip()
        if re.match(r"^(content|description):\s*[|>][+-]?\s*$", stripped):
            in_block_scalar = True
    chunks_list = "\n".join(indented)

    # Yeni içerik: header + boş satır + `chunks:` + 2-boşluk indent + ilk öğe
    # js-yaml.dump'ın çıktısına benzer. Manuel olarak oluşturuyoruz.
    # Ancak YAML "implicit key" sorunu: 4-space'le başlayan ve
    # `:` içermeyen satırlar bir önceki key'in devamı olarak
    # yorumlanır (multiline implicit key). Bunu engellemek için
    # bu tür satırların başına `# ` ekleyerek yorum yap.
    # Ek olarak: 4-space key satırlarında `(` bulunuyorsa (kapanmamış
    # parantez, ör. `key: value (note)`) YAML flow sequence başlatır
    # ve hata verir. Bu satırları tırnak içine al.
    # Çok satırlı değerler için (değer bir sonraki satıra devam
    # ediyor) block scalar `>` kullan.
    post_lines = chunks_list.split("\n")
    safe_lines = []
    in_multiline_value = False
    for i, line in enumerate(post_lines):
        if in_multiline_value:
            # Block scalar içindeyiz; ya `>` indented satırlar
            # (boşluklu) veya boş satır. Bitiş: daha az indentli
            # field.
            if (
                line.startswith("    ")
                and not line.startswith("    ")
                or line == ""
            ):
                # Block scalar devam ediyor.
                if line == "":
                    safe_lines.append("    >")
                safe_lines.append("    " + line[4:] if line else "")
                continue
            else:
                in_multiline_value = False

        if (
            line.startswith("    ")
            and not line.startswith("      ")
            and ":" not in line.strip()
            and line.strip() != ""
        ):
            # Devam satırı → yorum.
            safe_lines.append("    # " + line[4:])
        elif line.startswith("    ") and not line.startswith("      "):
            # Normal field satırı; parantez sorununu kontrol et.
            stripped = line.strip()
            if ":" in stripped:
                key, _, value = stripped.partition(":")
                value = value.strip()
                # Değer `[...]` veya `{}` ile başlıyorsa flow sequence/map
                # olarak kabul et (bunlar YAML'da geçerli).
                if value and not value.startswith("[") and not value.startswith("{"):
                    # Parantez sayısını kontrol et.
                    open_count = value.count("(")
                    close_count = value.count(")")
                    if open_count > close_count:
                        # Çok satırlı değer veya tırnaklı olması
                        # gereken değer → quoted string.
                        # İçerideki tırnakları escape et.
                        escaped = value.replace('"', '\\"')
                        safe_lines.append(f'    {key.strip()}: "{escaped}"')
                        continue
            safe_lines.append(line)
        else:
            safe_lines.append(line)
    chunks_list_safe = "\n".join(safe_lines)

    new_text = header + "\n\nchunks:\n" + chunks_list_safe + "\n"
    # UTF-8'e dönüştürülmüş olarak yaz.
    TARGET.write_bytes(new_text.encode("utf-8"))
    print(f"OK: {TARGET} yeniden formatlandı. ({len(lines)} satır)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
